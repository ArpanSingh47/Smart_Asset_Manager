from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.user import Allocation, AllocationStatus, Asset, User, Request, Notification
from app.services.email_service import send_return_reminder_email, send_overdue_flag_email
from app.core.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


def run_reminder_job():
    """Runs daily: sends reminders and flags overdue allocations."""
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        active_allocations = db.query(Allocation).filter(
            Allocation.status == AllocationStatus.allocated
        ).all()

        for alloc in active_allocations:
            request = db.query(Request).filter(Request.id == alloc.request_id).first()
            if not request:
                continue

            event_end = request.event_date
            due = alloc.due_date or (event_end + timedelta(days=1) if event_end else None)
            if not due:
                continue

            user = db.query(User).filter(User.id == request.user_id).first()
            asset = db.query(Asset).filter(Asset.id == alloc.asset_id).first()
            if not user or not asset:
                continue

            # Already sent today?
            already_reminded_today = (
                alloc.last_reminder_sent and
                alloc.last_reminder_sent.date() == now.date()
            )

            if now > due:
                # OVERDUE — flag and escalate
                if not alloc.flagged:
                    alloc.flagged = True
                    alloc.status = AllocationStatus.overdue
                    # Send overdue email
                    send_overdue_flag_email(
                        user.email, user.name,
                        [asset.name], due.strftime("%d %b %Y")
                    )
                    # In-app notification
                    _notify(db, user.id,
                            "🚨 Asset Overdue",
                            f"Your allocated asset '{asset.name}' is overdue. Please return it immediately.",
                            "error")
                elif not already_reminded_today:
                    # Daily escalation after flagging
                    alloc.reminder_count += 1
                    alloc.last_reminder_sent = now
                    send_overdue_flag_email(
                        user.email, user.name,
                        [asset.name], due.strftime("%d %b %Y")
                    )

            elif now > event_end and not already_reminded_today:
                # Event ended but not overdue yet — daily reminder
                alloc.reminder_count += 1
                alloc.last_reminder_sent = now
                send_return_reminder_email(
                    user.email, user.name,
                    [asset.name], due.strftime("%d %b %Y")
                )
                _notify(db, user.id,
                        "📦 Return Reminder",
                        f"Please return '{asset.name}' by {due.strftime('%d %b %Y')}.",
                        "warning")

        db.commit()
        logger.info(f"Reminder job completed at {now}")
    except Exception as e:
        logger.error(f"Reminder job error: {e}")
        db.rollback()
    finally:
        db.close()


def _notify(db: Session, user_id: int, title: str, message: str, type_: str = "info"):
    notif = Notification(user_id=user_id, title=title, message=message, type=type_)
    db.add(notif)
