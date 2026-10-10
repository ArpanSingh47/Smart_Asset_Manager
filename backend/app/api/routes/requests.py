from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.user import (Request, RequestItem, RequestStatus, Venue, Asset,
                              AssetStatus, Allocation, AllocationStatus,
                              Notification, AuditLog, User)
from app.services.email_service import send_request_status_email
from app.services.qr_service import generate_qr_code
import re

router = APIRouter(prefix="/api/requests", tags=["requests"])


def _make_code(category: str, db: Session) -> str:
    prefix = re.sub(r'[^A-Z]', '', (category or "AST").upper())[:3] or "AST"
    count = db.query(Asset).filter(Asset.category == category).count() + 1
    return f"{prefix}-{count:03d}"


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
    asset_codes: List[str] = []


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

    req.admin_notes = approval.admin_notes
    allocated_summary_list = []
    declined_summary_list = []

    # If the admin chose rejected directly:
    if approval.status == "rejected":
        req.status = RequestStatus.rejected
        for item_approval in approval.items:
            ri = db.query(RequestItem).filter(RequestItem.id == item_approval.request_item_id).first()
            if ri:
                ri.quantity_approved = 0
                declined_summary_list.append(f"{ri.item_name} ({ri.quantity_requested})")
    else:
        # Process each item: only items with scanned QR codes are approved!
        for item_approval in approval.items:
            ri = db.query(RequestItem).filter(RequestItem.id == item_approval.request_item_id).first()
            scanned_codes = [c.strip() for c in (item_approval.asset_codes or []) if c.strip()]

            # If no QR codes were scanned for this item -> decline it
            if not scanned_codes:
                if ri:
                    ri.quantity_approved = 0
                    declined_summary_list.append(f"{ri.item_name} ({ri.quantity_requested} requested)")
                continue

            # First, validate that none of the scanned codes are already in_use elsewhere
            for code in scanned_codes:
                existing_asset = db.query(Asset).filter(Asset.asset_code == code).first()
                if existing_asset and existing_asset.status == AssetStatus.in_use:
                    existing_alloc = db.query(Allocation).filter(
                        Allocation.request_id == req.id,
                        Allocation.asset_id == existing_asset.id
                    ).first()
                    if not existing_alloc:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Product '{existing_asset.name}' ({existing_asset.asset_code}) is already in use and cannot be allocated."
                        )

            # Set quantity approved strictly to number of scanned codes (up to quantity_requested)
            if ri:
                ri.quantity_approved = len(scanned_codes)
                if len(scanned_codes) < ri.quantity_requested:
                    declined_summary_list.append(f"{ri.quantity_requested - len(scanned_codes)}x {ri.item_name}")

            for code in scanned_codes:
                # Find or register asset so it appears in the assets page
                asset = db.query(Asset).filter(Asset.asset_code == code).first()
                if not asset:
                    # Auto-register newly scanned asset into inventory
                    item_name = ri.item_name if ri else "Asset"
                    item_cat = (ri.category if ri and ri.category else "Other")
                    asset = Asset(
                        asset_code=code,
                        name=f"{item_name} [{code}]",
                        category=item_cat,
                        description=f"Registered upon request approval for #{req.id} ({req.event_name})",
                        status=AssetStatus.available
                    )
                    db.add(asset)
                    db.flush()
                    try:
                        qr_url = generate_qr_code(asset.asset_code, asset.name)
                        asset.qr_code_url = qr_url
                    except Exception:
                        pass
                    _log_asset = AuditLog(action="asset_created", performed_by=admin.id,
                                          entity_type="asset", entity_id=asset.id,
                                          details={"name": asset.name, "code": asset.asset_code})
                    db.add(_log_asset)

                # Link item to asset if not linked
                if ri and not ri.asset_id:
                    ri.asset_id = asset.id

                # Create allocation for this request
                due = req.expected_return_date or (req.event_date + timedelta(days=1) if req.event_date else None)
                existing_alloc = db.query(Allocation).filter(
                    Allocation.request_id == req.id,
                    Allocation.asset_id == asset.id
                ).first()

                if not existing_alloc:
                    alloc = Allocation(
                        request_id=req.id,
                        asset_id=asset.id,
                        allocated_by=admin.id,
                        due_date=due,
                        status=AllocationStatus.allocated
                    )
                    db.add(alloc)

                asset.status = AssetStatus.in_use

                # Audit log entry for allocated asset
                _log_alloc = AuditLog(
                    action="asset_allocated",
                    performed_by=admin.id,
                    entity_type="asset",
                    entity_id=asset.id,
                    details={"request_id": req.id, "event_name": req.event_name, "asset_code": asset.asset_code}
                )
                db.add(_log_alloc)
                allocated_summary_list.append(f"{asset.name} ({asset.asset_code})")

        # Determine overall request status based on scanned vs requested units
        total_requested = sum(i.quantity_requested for i in req.items)
        total_approved = sum((i.quantity_approved or 0) for i in req.items)

        if total_approved == 0:
            req.status = RequestStatus.rejected
        elif total_approved < total_requested:
            req.status = RequestStatus.partially_approved
        else:
            req.status = RequestStatus.approved

    # Notify user with full allocation details
    user = db.query(User).filter(User.id == req.user_id).first()
    alloc_details = f" Allocated: {', '.join(allocated_summary_list)}." if allocated_summary_list else ""
    declined_details = f" Declined (not scanned): {', '.join(declined_summary_list)}." if declined_summary_list else ""
    n = Notification(
        user_id=user.id,
        title=f"Request {req.status.value.replace('_', ' ').title()}",
        message=f"Your request for '{req.event_name}' has been {req.status.value.replace('_', ' ')}.{alloc_details}{declined_details} {approval.admin_notes or ''}".strip(),
        type="success" if req.status == RequestStatus.approved else "error" if req.status == RequestStatus.rejected else "warning"
    )
    db.add(n)
    log = AuditLog(action=f"request_{req.status.value}", performed_by=admin.id,
                   entity_type="request", entity_id=req.id)
    db.add(log)
    db.commit()

    bg.add_task(send_request_status_email, user.email, user.name, req.id,
                req.status.value, req.event_name, approval.admin_notes)
    return {"message": f"Request {req.status.value}"}


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
