import random, re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, get_current_user
from app.models.user import User, UserRole, Notification
from app.services.email_service import send_otp_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    department: str = ""
    phone: str = ""

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format")
        return v.lower()

class LoginRequest(BaseModel):
    email: str
    password: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp: str

class ResendOTPRequest(BaseModel):
    email: str


@router.post("/register")
def register(req: RegisterRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = str(random.randint(100000, 999999))
    user = User(
        name=req.name,
        email=req.email,
        hashed_password=get_password_hash(req.password),
        department=req.department,
        phone=req.phone,
        otp_code=otp,
        otp_expires=datetime.utcnow() + timedelta(minutes=10),
        is_verified=False,
        role=UserRole.user
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    bg.add_task(send_otp_email, user.email, user.name, otp)
    return {"message": "Registration successful. Check your email for OTP.", "dev_otp": otp}


@router.post("/verify-otp")
def verify_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Already verified")
    if user.otp_code != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if datetime.utcnow() > user.otp_expires:
        raise HTTPException(status_code=400, detail="OTP expired")

    user.is_verified = True
    user.otp_code = None
    # Welcome notification
    notif = Notification(user_id=user.id, title="Welcome to Smart Asset Manager!",
                         message="Your account has been verified. You can now request assets.",
                         type="success")
    db.add(notif)
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "name": user.name}


@router.post("/resend-otp")
def resend_otp(req: ResendOTPRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or user.is_verified:
        raise HTTPException(status_code=400, detail="Invalid request")
    otp = str(random.randint(100000, 999999))
    user.otp_code = otp
    user.otp_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    bg.add_task(send_otp_email, user.email, user.name, otp)
    return {"message": "OTP resent", "dev_otp": otp}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "name": user.name, "id": user.id}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "department": current_user.department,
        "phone": current_user.phone,
    }
