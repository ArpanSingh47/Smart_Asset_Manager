from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.user import (Request, RequestItem, RequestStatus, Venue, Asset,
                              AssetStatus, Notification, AuditLog, User)
from app.services.email_service import send_request_status_email

router = APIRouter(prefix="/api/requests", tags=["requests"])


class RequestItemIn(BaseModel):
    item_name: str
    category: str = ""
    quantity_requested: int = 1
    is_other: bool = False
    notes: str = ""


class RequestCreate(BaseModel):
    event_name: str
    venue_id: Optional[int] = None
    event_date: str  # ISO date string
    event_start_time: str = ""
    event_end_time: str = ""
    expected_return_date: Optional[str] = None
    purpose: str = ""
    items: List[RequestItemIn]


class ApprovalItem(BaseModel):
    request_item_id: int
    quantity_approved: int


class ApprovalRequest(BaseModel):
    status: str  # approved, partially_approved, rejected
    admin_notes: str = ""
    items: List[ApprovalItem] = []


@router.post("")
def create_request(data: RequestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not current_user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    # Venue conflict check
    if data.venue_id:
        event_date = datetime.fromisoformat(data.event_date)
        conflict = db.query(Request).filter(
            Request.venue_id == data.venue_id,
            Request.event_date == event_date,
            Request.status.in_([RequestStatus.approved, RequestStatus.pending])
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Venue already booked for this date")

    req = Request(
        user_id=current_user.id,
        venue_id=data.venue_id,
        event_name=data.event_name,
        event_date=datetime.fromisoformat(data.event_date),
        event_start_time=data.event_start_time,
        event_end_time=data.event_end_time,
        expected_return_date=datetime.fromisoformat(data.expected_return_date) if data.expected_return_date else None,
        purpose=data.purpose,
        status=RequestStatus.pending
    )
    db.add(req)
    db.flush()

    for item in data.items:
        ri = RequestItem(
            request_id=req.id,
            item_name=item.item_name,
            category=item.category,
            quantity_requested=item.quantity_requested,
            is_other=item.is_other,
            notes=item.notes
        )
        db.add(ri)

    # Notify admin(s)
    admins = db.query(User).filter(User.role == "admin").all()
    for admin in admins:
        n = Notification(
            user_id=admin.id,
            title="New Asset Request",
            message=f"New request from {current_user.name} for '{data.event_name}'.",
            type="info"
        )
        db.add(n)

    db.commit()
    db.refresh(req)
    return {"message": "Request submitted", "request_id": req.id}


@router.get("/my")
def my_requests(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    reqs = db.query(Request).filter(Request.user_id == current_user.id).order_by(Request.created_at.desc()).all()
    return [_req_dict(r, db) for r in reqs]


@router.get("/all")
def all_requests(
    status: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin)
):
    q = db.query(Request).order_by(Request.created_at.desc())
    if status:
        q = q.filter(Request.status == status)
    total = q.count()
    reqs = q.offset(skip).limit(limit).all()
    return {"total": total, "requests": [_req_dict(r, db) for r in reqs]}


@router.get("/{request_id}")
def get_request(request_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user.role != "admin" and req.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _req_dict(req, db)


@router.put("/{request_id}/review")
def review_request(
    request_id: int, approval: ApprovalRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in [RequestStatus.pending]:
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = RequestStatus(approval.status)
    req.admin_notes = approval.admin_notes

    # Update item quantities
    for item_approval in approval.items:
        ri = db.query(RequestItem).filter(RequestItem.id == item_approval.request_item_id).first()
        if ri:
            ri.quantity_approved = item_approval.quantity_approved

    # Notify user
    user = db.query(User).filter(User.id == req.user_id).first()
    n = Notification(
        user_id=user.id,
        title=f"Request {approval.status.title()}",
        message=f"Your request for '{req.event_name}' has been {approval.status}. {approval.admin_notes or ''}",
        type="success" if approval.status == "approved" else "error" if approval.status == "rejected" else "warning"
    )
    db.add(n)
    log = AuditLog(action=f"request_{approval.status}", performed_by=admin.id,
                   entity_type="request", entity_id=req.id)
    db.add(log)
    db.commit()

    bg.add_task(send_request_status_email, user.email, user.name, req.id,
                approval.status, req.event_name, approval.admin_notes)
    return {"message": f"Request {approval.status}"}


def _req_dict(r: Request, db: Session):
    venue = db.query(Venue).filter(Venue.id == r.venue_id).first() if r.venue_id else None
    user = db.query(User).filter(User.id == r.user_id).first()
    items = db.query(RequestItem).filter(RequestItem.request_id == r.id).all()
    return {
        "id": r.id,
        "event_name": r.event_name,
        "event_date": r.event_date.isoformat() if r.event_date else None,
        "event_start_time": r.event_start_time,
        "event_end_time": r.event_end_time,
        "expected_return_date": r.expected_return_date.isoformat() if r.expected_return_date else None,
        "purpose": r.purpose,
        "status": r.status,
        "admin_notes": r.admin_notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "venue": {"id": venue.id, "name": venue.name} if venue else None,
        "user": {"id": user.id, "name": user.name, "email": user.email, "department": user.department} if user else None,
        "items": [{
            "id": i.id, "item_name": i.item_name, "category": i.category,
            "quantity_requested": i.quantity_requested, "quantity_approved": i.quantity_approved,
            "is_other": i.is_other, "notes": i.notes
        } for i in items]
    }
