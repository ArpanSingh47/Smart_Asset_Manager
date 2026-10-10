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

    # Equipment Catalog breakdown (Base items and unit counts)
    item_counts = {}
    for a in db.query(Asset).order_by(Asset.category, Asset.name).all():
        base = a.name.split(" #")[0] if " #" in a.name else a.name
        key = f"{base} [{a.category}]"
        item_counts[key] = item_counts.get(key, 0) + 1
    catalog_lines = "\n".join([f"  - {k}: {v} units" for k, v in item_counts.items()])

    return f"""DATABASE SUMMARY (Live from Smart Asset Manager DB):
- Total Assets: {total_assets}
  - Available: {available}
  - Currently in Use: {in_use}
  - Maintenance: {maintenance}
  - Retired: {retired}
- Asset Categories: {cat_text}
- Catalog Stock by Item (3 units each):
{catalog_lines}
- Total Requests: {total_requests} (Pending review: {pending}, Approved: {approved})
- Total Allocations: {total_allocations} (Active allocated: {active_alloc}, Overdue / Flagged: {overdue})
- Registered Users: {total_users}
- Overdue & Flagged Items:{flagged_text if flagged_text else ' None'}
"""

def fallback_sammy_response(question: str, db: Session) -> str:
    """Intelligent database-backed response generator when Gemini API key is missing or offline."""
    q = question.lower().strip()
    
    total_assets = db.query(Asset).count()
    available = db.query(Asset).filter(Asset.status == AssetStatus.available).count()
    in_use = db.query(Asset).filter(Asset.status == AssetStatus.in_use).count()
    maintenance = db.query(Asset).filter(Asset.status == AssetStatus.maintenance).count()
    pending = db.query(Request).filter(Request.status == RequestStatus.pending).count()
    approved = db.query(Request).filter(Request.status == RequestStatus.approved).count()
    overdue_allocs = db.query(Allocation).filter(Allocation.flagged == True).all()

    # 1. Greetings & Identity
    if q in ["hi", "hello", "hey", "hola", "greetings"] or "who are you" in q or "what can you do" in q or "help" in q:
        return (
            "👋 Hello! I'm **Sammy**, your AI Assistant for the Smart Asset Manager portal.\n\n"
            "I have real-time access to the store database, asset catalog, requests, and current borrower allocations.\n\n"
            "**Here are questions you can ask me:**\n"
            "• *How many assets are currently in use or available?*\n"
            "• *Which assets are overdue or flagged right now?*\n"
            "• *Do we have any microphones, speakers, or projectors in stock?*\n"
            "• *Are there any pending requests awaiting admin review?*\n"
            "• *Show me the asset breakdown by category.*"
        )

    # 2. Overdue & Flagged items
    if "overdue" in q or "flagged" in q or "late" in q or "return" in q:
        if not overdue_allocs:
            return "Good news! There are currently **no overdue or flagged asset allocations** in the database. All borrowed items are either returned or within their allowed duration."
        details = []
        for a in overdue_allocs:
            asset = db.query(Asset).filter(Asset.id == a.asset_id).first()
            req = db.query(Request).filter(Request.id == a.request_id).first()
            user = db.query(User).filter(User.id == req.user_id).first() if req else None
            due_str = a.due_date.strftime("%d %b %Y") if a.due_date else "N/A"
            details.append(f"• **{asset.name if asset else 'Asset'}** [{asset.asset_code if asset else ''}] — Issued to **{user.name if user else 'Unknown'}** ({user.email if user else ''}), Due Date: **{due_str}** (Reminders sent: {a.reminder_count})")
        return f"Currently, there are **{len(overdue_allocs)} overdue item(s)** flagged in the system:\n\n" + "\n".join(details) + "\n\n💡 You can click the **'Send Reminder'** button on the Admin Dashboard to notify these borrowers via email and in-portal alert."

    # 3. In-use / allocated items
    if "in use" in q or "allocated" in q or "borrowed" in q or "who has" in q:
        in_use_assets = db.query(Asset).filter(Asset.status == AssetStatus.in_use).all()
        if not in_use_assets:
            return "There are currently **0 assets in use**. All inventory items are available in the store room."
        names = "\n".join([f"• **{a.name}** [`{a.asset_code}`] ({a.category})" for a in in_use_assets])
        return f"There are currently **{in_use} asset(s)** in use:\n\n{names}"

    # 4. Available stock
    if "available" in q or "free" in q or "ready" in q:
        return f"We currently have **{available} available assets** ready for allocation out of **{total_assets} total catalogued items** in the store."

    # 5. Pending & Approved Requests
    if "pending" in q or "request" in q or "review" in q:
        pending_reqs = db.query(Request).filter(Request.status == RequestStatus.pending).all()
        if not pending_reqs:
            return f"There are **0 pending requests** (Total requests: {db.query(Request).count()}, Approved: {approved}). All user requests have been processed!"
        req_lines = [f"• #{r.id}: **{r.event_name}** (Event Date: {r.event_date.strftime('%d %b %Y') if r.event_date else 'N/A'}, Expected Return: {r.expected_return_date.strftime('%d %b %Y') if r.expected_return_date else 'N/A'})" for r in pending_reqs]
        return f"There are **{len(pending_reqs)} pending asset request(s)** awaiting review:\n\n" + "\n".join(req_lines) + "\n\nHead over to the **Requests** tab to scan QR codes and approve them."

    # 6. Category breakdown
    if "category" in q or "categories" in q:
        cats = db.query(Asset.category, func.count(Asset.id)).group_by(Asset.category).all()
        cat_lines = [f"• **{c[0]}**: {c[1]} items" for c in cats]
        return "Here is the asset breakdown by category:\n\n" + "\n".join(cat_lines)

    # 7. Specific asset lookup by keyword / name / code
    keywords = {
        "mic": "Microphone",
        "microphone": "Microphone",
        "speaker": "Speaker",
        "pa": "Speaker",
        "amplifier": "Amplifier",
        "amp": "Amplifier",
        "screen": "Projection Screen",
        "projector": "Projector",
        "cable": "Cable",
        "hdmi": "HDMI",
        "cord": "Extension Cord",
        "laptop": "Laptop Stand",
        "stand": "Stand",
        "chair": "Chair",
        "table": "Table",
        "podium": "Podium",
        "lectern": "Podium",
        "light": "Light",
        "spotlight": "Spotlight",
        "led": "LED Panel Light",
        "stage": "Stage",
        "platform": "Stage Platform",
        "backdrop": "Backdrop",
        "banner": "Banner"
    }

    matching_kw = None
    for kw, val in keywords.items():
        if kw in q:
            matching_kw = val
            break

    if matching_kw:
        matching_assets = db.query(Asset).filter(
            (Asset.name.ilike(f"%{matching_kw}%")) |
            (Asset.category.ilike(f"%{matching_kw}%"))
        ).all()
        if matching_assets:
            avail_count = sum(1 for a in matching_assets if a.status == AssetStatus.available)
            in_use_count = sum(1 for a in matching_assets if a.status == AssetStatus.in_use)
            items_summary = []
            for a in matching_assets[:8]:
                status_badge = "Available" if a.status == AssetStatus.available else "In Use" if a.status == AssetStatus.in_use else a.status.value.title()
                cond_str = (a.condition.value if hasattr(a.condition, 'value') else str(a.condition)).replace('AssetCondition.', '').title()
                items_summary.append(f"• **{a.name}** [`{a.asset_code}`] — Status: **{status_badge}** (Condition: {cond_str})")
            more = f"\n*...and {len(matching_assets) - 8} more unit(s)*" if len(matching_assets) > 8 else ""
            return (
                f"We currently have **{len(matching_assets)} item(s)** matching **'{matching_kw}'** in stock:\n"
                f"• Available: **{avail_count}**\n"
                f"• In Use: **{in_use_count}**\n\n"
                + "\n".join(items_summary) + more
            )

    # Check for direct asset code query (e.g. AUD-001)
    for part in q.upper().split():
        code_asset = db.query(Asset).filter(Asset.asset_code == part.strip('?,.')).first()
        if code_asset:
            status_badge = "Available" if code_asset.status == AssetStatus.available else "In Use" if code_asset.status == AssetStatus.in_use else code_asset.status.value.title()
            cond_str = (code_asset.condition.value if hasattr(code_asset.condition, 'value') else str(code_asset.condition)).replace('AssetCondition.', '').title()
            return f"Found asset **{code_asset.name}** [`{code_asset.asset_code}`]:\n• Category: **{code_asset.category}**\n• Status: **{status_badge}**\n• Condition: **{cond_str}**\n• Description: {code_asset.description or 'No description'}"

    # 8. Default live overview
    ctx = get_db_context(db)
    return f"👋 Here is the latest live database summary from Smart Asset Manager:\n\n{ctx}\nFeel free to ask me about specific assets, overdue items, or pending requests!"


def ask_sammy(question: str, db: Session) -> str:
    import concurrent.futures

    # 1. If an actual Google AI Studio API key is configured (starts with "AIzaSy"), attempt Gemini with strict timeout
    api_key = settings.GEMINI_API_KEY
    if api_key and api_key.startswith("AIzaSy") and len(api_key) > 20:
        context = get_db_context(db)
        prompt = f"{SYSTEM_PROMPT}\n\n{context}\n\nUser Question: {question}"

        def _call_gemini():
            try:
                client = genai.Client(api_key=api_key)
                for model_name in ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"]:
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=prompt
                        )
                        if response and response.text:
                            return response.text.strip()
                    except Exception as model_err:
                        logger.debug(f"Gemini model {model_name} error: {model_err}")
                        continue
            except Exception as e:
                logger.warning(f"Gemini setup error: {e}")
            return None

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_call_gemini)
                result = future.result(timeout=3.5)
                if result:
                    return result
        except concurrent.futures.TimeoutError:
            logger.warning("Gemini API call timed out after 3.5s; serving via local database engine.")
        except Exception as e:
            logger.warning(f"Gemini API execution error ({e}); serving via local database engine.")

    # 2. Fast, resilient, comprehensive local database engine
    return fallback_sammy_response(question, db)
