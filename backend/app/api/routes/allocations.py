from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.user import (Allocation, AllocationStatus, Asset, AssetStatus,
                              AssetCondition, Request, RequestStatus, User,
                              Notification, AuditLog)
from app.services.email_service import send_return_reminder_email, send_overdue_flag_email

router = APIRouter(prefix="/api/allocations", tags=["allocations"])


class AllocateRequest(BaseModel):
    asset_code: str
    request_id: int
    due_date: Optional[str] = None


class ReturnRequest(BaseModel):
    asset_code: str
    return_condition: str = "good"
    return_notes: str = ""


class ReminderRequest(BaseModel):
    allocation_id: int


@router.post("/allocate")
def allocate_asset(data: AllocateRequest, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    asset = db.query(Asset).filter(Asset.asset_code == data.asset_code).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.status == AssetStatus.in_use:
        raise HTTPException(status_code=409, detail=f"Asset {asset.asset_code} is already allocated")
    if asset.status == AssetStatus.maintenance:
        raise HTTPException(status_code=409, detail=f"Asset is under maintenance")

    req = db.query(Request).filter(Request.id == data.request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in [RequestStatus.approved, RequestStatus.partially_approved]:
        raise HTTPException(status_code=400, detail="Request not approved")

    due = datetime.fromisoformat(data.due_date) if data.due_date else req.expected_return_date

    alloc = Allocation(
        request_id=req.id,
        asset_id=asset.id,
        allocated_by=admin.id,
        due_date=due,
        status=AllocationStatus.allocated
    )
    db.add(alloc)
    asset.status = AssetStatus.in_use

    user = db.query(User).filter(User.id == req.user_id).first()
    notif = Notification(
        user_id=user.id,
        title="Asset Allocated",
        message=f"'{asset.name}' ({asset.asset_code}) has been allocated for '{req.event_name}'.",
        type="success"
    )
    db.add(notif)
    log = AuditLog(action="asset_allocated", performed_by=admin.id,
                   entity_type="allocation", entity_id=None,
                   details={"asset": asset.asset_code, "request": req.id})
    db.add(log)
    db.commit()
    return {
        "message": "Asset allocated",
        "asset": {"code": asset.asset_code, "name": asset.name},
        "request": {"id": req.id, "event": req.event_name},
        "due_date": due.isoformat() if due else None
    }


@router.post("/return")
def return_asset(data: ReturnRequest, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    asset = db.query(Asset).filter(Asset.asset_code == data.asset_code).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    alloc = db.query(Allocation).filter(
        Allocation.asset_id == asset.id,
        Allocation.status.in_([AllocationStatus.allocated, AllocationStatus.overdue])
    ).order_by(Allocation.allocated_at.desc()).first()

    if not alloc:
        raise HTTPException(status_code=404, detail="No active allocation found for this asset")

    alloc.status = AllocationStatus.returned
    alloc.returned_at = datetime.utcnow()
    alloc.return_condition = data.return_condition
    alloc.return_notes = data.return_notes
    alloc.flagged = False

    if data.return_condition in ["damaged", "lost"]:
        asset.status = AssetStatus.maintenance
        asset.condition = data.return_condition
    else:
        asset.status = AssetStatus.available
        asset.condition = data.return_condition

    req = db.query(Request).filter(Request.id == alloc.request_id).first()
    user = db.query(User).filter(User.id == req.user_id).first() if req else None
    if user:
        notif = Notification(
            user_id=user.id,
            title="Asset Returned",
            message=f"'{asset.name}' has been marked as returned. Thank you!",
            type="success"
        )
        db.add(notif)

    log = AuditLog(action="asset_returned", performed_by=admin.id,
                   entity_type="allocation", entity_id=alloc.id,
                   details={"asset": asset.asset_code, "condition": data.return_condition})
    db.add(log)
    db.commit()
    return {"message": "Asset returned", "condition": data.return_condition}


@router.post("/send-reminder")
def send_reminder(data: ReminderRequest, bg: BackgroundTasks, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    alloc = db.query(Allocation).filter(Allocation.id == data.allocation_id).first()
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")

    asset = db.query(Asset).filter(Asset.id == alloc.asset_id).first()
    req = db.query(Request).filter(Request.id == alloc.request_id).first()
    user = db.query(User).filter(User.id == req.user_id).first() if req else None

    if not user or not asset:
        raise HTTPException(status_code=404, detail="User or asset not found")

    due_str = alloc.due_date.strftime("%d %b %Y") if alloc.due_date else "N/A"
    bg.add_task(send_overdue_flag_email if alloc.flagged else send_return_reminder_email,
                user.email, user.name, [asset.name], due_str)

    notif = Notification(
        user_id=user.id,
        title="Return Reminder",
        message=f"Admin has sent a reminder to return '{asset.name}'.",
        type="warning"
    )
    db.add(notif)
    alloc.reminder_count += 1
    alloc.last_reminder_sent = datetime.utcnow()
    db.commit()
    return {"message": "Reminder sent"}


@router.get("/flagged")
def get_flagged(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    flagged = db.query(Allocation).filter(Allocation.flagged == True).all()
    return [_alloc_dict(a, db) for a in flagged]


@router.get("/active")
def get_active(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    active = db.query(Allocation).filter(Allocation.status == AllocationStatus.allocated).all()
    return [_alloc_dict(a, db) for a in active]


def _alloc_dict(a: Allocation, db: Session):
    asset = db.query(Asset).filter(Asset.id == a.asset_id).first()
    req = db.query(Request).filter(Request.id == a.request_id).first()
    user = db.query(User).filter(User.id == req.user_id).first() if req else None
    return {
        "id": a.id,
        "asset": {"code": asset.asset_code, "name": asset.name, "category": asset.category} if asset else None,
        "request": {"id": req.id, "event_name": req.event_name} if req else None,
        "user": {"name": user.name, "email": user.email, "department": user.department} if user else None,
        "allocated_at": a.allocated_at.isoformat() if a.allocated_at else None,
        "due_date": a.due_date.isoformat() if a.due_date else None,
        "returned_at": a.returned_at.isoformat() if a.returned_at else None,
        "status": a.status,
        "flagged": a.flagged,
        "reminder_count": a.reminder_count,
    }
