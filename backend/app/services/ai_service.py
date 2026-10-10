from google import genai
from google.genai import types
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.user import Asset, Request, Allocation, User, AssetStatus, AllocationStatus, RequestStatus
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are Sammy, the AI assistant for Smart Asset Manager — a university asset management portal.
You help the store room administrator answer questions about assets, requests, allocations, and usage statistics.
You have access to the database summary provided to you in each message.
Be concise, friendly, and professional. Address yourself as "Sammy".
If data is not in the provided context, say so honestly.
Do NOT make up data. Only use what's provided.
"""

def get_db_context(db: Session) -> str:
    """Build a text summary of the current DB state for Sammy."""
    total_assets = db.query(Asset).count()
    available = db.query(Asset).filter(Asset.status == AssetStatus.available).count()
    in_use = db.query(Asset).filter(Asset.status == AssetStatus.in_use).count()
    maintenance = db.query(Asset).filter(Asset.status == AssetStatus.maintenance).count()
    retired = db.query(Asset).filter(Asset.status == AssetStatus.retired).count()

    total_requests = db.query(Request).count()
    pending = db.query(Request).filter(Request.status == RequestStatus.pending).count()
    approved = db.query(Request).filter(Request.status == RequestStatus.approved).count()

    total_allocations = db.query(Allocation).count()
    overdue = db.query(Allocation).filter(Allocation.flagged == True).count()
    active_alloc = db.query(Allocation).filter(Allocation.status == AllocationStatus.allocated).count()

    total_users = db.query(User).filter(User.role == "user").count()

    # Flagged allocations details
    flagged = db.query(Allocation).filter(Allocation.flagged == True).limit(10).all()
    flagged_text = ""
    for f in flagged:
        asset = db.query(Asset).filter(Asset.id == f.asset_id).first()
        req = db.query(Request).filter(Request.id == f.request_id).first()
        user = db.query(User).filter(User.id == req.user_id).first() if req else None
        due_str = f.due_date.strftime("%d %b %Y") if f.due_date else "N/A"
        flagged_text += f"\n- {asset.name if asset else 'Unknown'} [{asset.asset_code if asset else ''}] (Due: {due_str}, Issued to: {user.name if user else 'Unknown'}, Reminders sent: {f.reminder_count})"

    # Categories breakdown
    cats = db.query(Asset.category, func.count(Asset.id)).group_by(Asset.category).all()
    cat_text = ", ".join([f"{c[0]}: {c[1]}" for c in cats])

    return f"""DATABASE SUMMARY (Live from Smart Asset Manager DB):
- Total Assets: {total_assets}
  - Available: {available}
  - Currently in Use: {in_use}
  - Maintenance: {maintenance}
  - Retired: {retired}
- Asset Categories: {cat_text}
- Total Requests: {total_requests} (Pending review: {pending}, Approved: {approved})
- Total Allocations: {total_allocations} (Active allocated: {active_alloc}, Overdue / Flagged: {overdue})
- Registered Users: {total_users}
- Overdue & Flagged Items:{flagged_text if flagged_text else ' None'}
"""

def fallback_sammy_response(question: str, db: Session) -> str:
    """Intelligent database-backed response generator when Gemini API key is missing or offline."""
    q = question.lower()
    
    total_assets = db.query(Asset).count()
    available = db.query(Asset).filter(Asset.status == AssetStatus.available).count()
    in_use = db.query(Asset).filter(Asset.status == AssetStatus.in_use).count()
    maintenance = db.query(Asset).filter(Asset.status == AssetStatus.maintenance).count()
    pending = db.query(Request).filter(Request.status == RequestStatus.pending).count()
    approved = db.query(Request).filter(Request.status == RequestStatus.approved).count()
    overdue_allocs = db.query(Allocation).filter(Allocation.flagged == True).all()

    if "overdue" in q or "flagged" in q or "return" in q:
        if not overdue_allocs:
            return "Good news! There are currently no overdue or flagged asset allocations in the database. All borrowed items are either returned or within their allowed duration."
        details = []
        for a in overdue_allocs:
            asset = db.query(Asset).filter(Asset.id == a.asset_id).first()
            req = db.query(Request).filter(Request.id == a.request_id).first()
            user = db.query(User).filter(User.id == req.user_id).first() if req else None
            due_str = a.due_date.strftime("%d %b %Y") if a.due_date else "N/A"
            details.append(f"• **{asset.name if asset else 'Asset'}** ({asset.asset_code if asset else ''}) — Issued to **{user.name if user else 'Unknown'}** ({user.email if user else ''}), Due Date: **{due_str}** (Reminders sent: {a.reminder_count})")
        return f"Currently, there are **{len(overdue_allocs)} overdue items** flagged in the system:\n\n" + "\n".join(details) + "\n\n💡 You can click the **'Send Reminder'** button on the Admin Dashboard to notify these borrowers via email and in-portal alert."

    elif "in use" in q or "allocated" in q or "borrowed" in q:
        in_use_assets = db.query(Asset).filter(Asset.status == AssetStatus.in_use).all()
        names = ", ".join([f"{a.name} ({a.asset_code})" for a in in_use_assets]) if in_use_assets else "None"
        return f"There are currently **{in_use} asset(s)** in use:\n{names}"

    elif "available" in q or "free" in q:
        return f"We currently have **{available} available assets** out of {total_assets} total catalogued assets ready for allocation."

    elif "pending" in q or "request" in q:
        pending_reqs = db.query(Request).filter(Request.status == RequestStatus.pending).all()
        if not pending_reqs:
            return f"There are **{pending} pending requests**. All user requests have been processed!"
        req_lines = [f"• #{r.id}: **{r.event_name}** (Event Date: {r.event_date.strftime('%d %b %Y') if r.event_date else 'N/A'})" for r in pending_reqs]
        return f"There are **{len(pending_reqs)} pending asset request(s)** awaiting your review:\n\n" + "\n".join(req_lines) + "\n\nHead over to the **Requests** tab to review and approve them."

    elif "category" in q or "categories" in q:
        cats = db.query(Asset.category, func.count(Asset.id)).group_by(Asset.category).all()
        cat_lines = [f"• **{c[0]}**: {c[1]} items" for c in cats]
        return "Here is the asset breakdown by category:\n\n" + "\n".join(cat_lines)

    else:
        ctx = get_db_context(db)
        return f"👋 Hi! Here is the latest live database summary from Smart Asset Manager:\n\n{ctx}\nFeel free to ask me about specific assets, overdue items, or pending requests!"

def ask_sammy(question: str, db: Session) -> str:
    # 1. If real Gemini API key is configured, use Gemini
    api_key = settings.GEMINI_API_KEY
    if api_key and api_key != "your-gemini-api-key-here" and len(api_key) > 10:
        try:
            context = get_db_context(db)
            client = genai.Client(api_key=api_key)
            prompt = f"{SYSTEM_PROMPT}\n\n{context}\n\nUser Question: {question}"
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            if response and response.text:
                return response.text
        except Exception as e:
            logger.warning(f"Gemini API request failed, falling back to local reasoning: {e}")

    # 2. Local database reasoning fallback
    return fallback_sammy_response(question, db)
