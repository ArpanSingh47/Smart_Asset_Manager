from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.user import (Asset, AssetStatus, Request, RequestStatus,
                              Allocation, AllocationStatus, User, Notification)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/admin")
def admin_dashboard(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    # Asset stats
    total_assets = db.query(Asset).count()
    available = db.query(Asset).filter(Asset.status == AssetStatus.available).count()
    in_use = db.query(Asset).filter(Asset.status == AssetStatus.in_use).count()
    maintenance = db.query(Asset).filter(Asset.status == AssetStatus.maintenance).count()
    retired = db.query(Asset).filter(Asset.status == AssetStatus.retired).count()

    # Request stats
    total_requests = db.query(Request).count()
    pending_requests = db.query(Request).filter(Request.status == RequestStatus.pending).count()
    approved_requests = db.query(Request).filter(Request.status == RequestStatus.approved).count()

    # Allocation stats
    active_allocs = db.query(Allocation).filter(Allocation.status == AllocationStatus.allocated).count()
    overdue_allocs = db.query(Allocation).filter(Allocation.flagged == True).count()
    returned = db.query(Allocation).filter(Allocation.status == AllocationStatus.returned).count()

    # Users
    total_users = db.query(User).filter(User.role == "user").count()

    # Category breakdown
    cat_data = db.query(Asset.category, func.count(Asset.id)).group_by(Asset.category).all()

    # Recent requests
    recent = db.query(Request).order_by(Request.created_at.desc()).limit(5).all()
    recent_requests = []
    for r in recent:
        user = db.query(User).filter(User.id == r.user_id).first()
        recent_requests.append({
            "id": r.id,
            "event_name": r.event_name,
            "status": r.status,
            "user_name": user.name if user else "",
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    # Flagged allocations
    flagged = db.query(Allocation).filter(Allocation.flagged == True).limit(10).all()
    flagged_list = []
    for a in flagged:
        asset = db.query(Asset).filter(Asset.id == a.asset_id).first()
        req = db.query(Request).filter(Request.id == a.request_id).first()
        user = db.query(User).filter(User.id == req.user_id).first() if req else None
        flagged_list.append({
            "allocation_id": a.id,
            "asset_code": asset.asset_code if asset else "",
            "asset_name": asset.name if asset else "",
            "user_name": user.name if user else "",
            "user_email": user.email if user else "",
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "reminder_count": a.reminder_count
        })

    return {
        "assets": {
            "total": total_assets, "available": available,
            "in_use": in_use, "maintenance": maintenance, "retired": retired
        },
        "requests": {
            "total": total_requests, "pending": pending_requests, "approved": approved_requests
        },
        "allocations": {
            "active": active_allocs, "overdue": overdue_allocs, "returned": returned
        },
        "users": total_users,
        "category_breakdown": [{"category": c[0], "count": c[1]} for c in cat_data],
        "recent_requests": recent_requests,
        "flagged_allocations": flagged_list
    }


@router.get("/user")
def user_dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    my_requests = db.query(Request).filter(Request.user_id == current_user.id).all()
    pending = sum(1 for r in my_requests if r.status == RequestStatus.pending)
    approved = sum(1 for r in my_requests if r.status == RequestStatus.approved)
    completed = sum(1 for r in my_requests if r.status == RequestStatus.completed)
    return {
        "total_requests": len(my_requests),
        "pending": pending,
        "approved": approved,
        "completed": completed
    }


@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(20).all()
    return [{"id": n.id, "title": n.title, "message": n.message,
             "type": n.type, "is_read": n.is_read, "created_at": n.created_at.isoformat()} for n in notifs]


@router.put("/notifications/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"message": "Marked as read"}
