import io, os, pandas as pd
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.user import Asset, AssetStatus, AssetCondition, AuditLog
from app.services.qr_service import generate_qr_code, generate_qr_pdf
import re

router = APIRouter(prefix="/api/assets", tags=["assets"])

def make_asset_code(category: str, db: Session) -> str:
    prefix = re.sub(r'[^A-Z]', '', category.upper())[:3] or "AST"
    count = db.query(Asset).filter(Asset.category == category).count() + 1
    return f"{prefix}-{count:03d}"

class AssetCreate(BaseModel):
    name: str
    category: str
    description: str = ""
    condition: str = "good"

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    condition: Optional[str] = None
    status: Optional[str] = None


@router.get("")
def list_assets(
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin)
):
    q = db.query(Asset)
    if category:
        q = q.filter(Asset.category == category)
    if status:
        q = q.filter(Asset.status == status)
    if search:
        q = q.filter(Asset.name.ilike(f"%{search}%") | Asset.asset_code.ilike(f"%{search}%"))
    total = q.count()
    assets = q.offset(skip).limit(limit).all()
    return {"total": total, "assets": [_asset_dict(a) for a in assets]}


@router.get("/public")
def list_assets_public(db: Session = Depends(get_db)):
    """For user request form dropdowns - returns categories and available assets"""
    from sqlalchemy import func
    cats = db.query(Asset.category, func.count(Asset.id)).group_by(Asset.category).all()
    return {"categories": [{"name": c[0], "count": c[1]} for c in cats]}


@router.get("/by-code/{asset_code}")
def get_asset_by_code(asset_code: str, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    asset = db.query(Asset).filter(Asset.asset_code == asset_code).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_dict(asset)


@router.get("/{asset_id}")
def get_asset(asset_id: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_dict(asset)


@router.post("")
def create_asset(data: AssetCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    code = make_asset_code(data.category, db)
    asset = Asset(
        asset_code=code,
        name=data.name,
        category=data.category,
        description=data.description,
        condition=data.condition,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    qr_url = generate_qr_code(asset.asset_code, asset.name)
    asset.qr_code_url = qr_url
    _audit(db, admin.id, "asset_created", "asset", asset.id, {"name": asset.name})
    db.commit()
    db.refresh(asset)
    return _asset_dict(asset)


@router.put("/{asset_id}")
def update_asset(asset_id: int, data: AssetUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, val in data.dict(exclude_none=True).items():
        setattr(asset, field, val)
    _audit(db, admin.id, "asset_updated", "asset", asset.id, data.dict(exclude_none=True))
    db.commit()
    db.refresh(asset)
    return _asset_dict(asset)


@router.post("/bulk-import")
async def bulk_import(file: UploadFile = File(...), db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot parse file: {e}")

    required_cols = {"name", "category", "condition"}
    missing = required_cols - set(df.columns.str.lower())
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing}")

    df.columns = df.columns.str.lower()
    results = {"created": 0, "errors": [], "warnings": []}
    created_assets = []

    for idx, row in df.iterrows():
        try:
            name = str(row["name"]).strip()
            category = str(row["category"]).strip()
            condition = str(row.get("condition", "good")).strip().lower()
            description = str(row.get("description", "")).strip()
            qty = int(row.get("quantity", 1))

            if not name or not category:
                results["errors"].append(f"Row {idx+2}: name/category missing")
                continue
            if condition not in ["new", "good", "fair", "damaged"]:
                results["warnings"].append(f"Row {idx+2}: invalid condition '{condition}', using 'good'")
                condition = "good"

            for i in range(max(1, qty)):
                code = make_asset_code(category, db)
                asset = Asset(
                    asset_code=code, name=name, category=category,
                    description=description, condition=condition
                )
                db.add(asset)
                db.flush()
                qr_url = generate_qr_code(asset.asset_code, asset.name)
                asset.qr_code_url = qr_url
                created_assets.append({
                    "asset_code": asset.asset_code,
                    "name": asset.name,
                    "category": asset.category
                })
                results["created"] += 1

        except Exception as e:
            results["errors"].append(f"Row {idx+2}: {str(e)}")

    _audit(db, admin.id, "bulk_import", "asset", None, {"created": results["created"]})
    db.commit()
    results["assets"] = created_assets
    return results


@router.post("/generate-qr-pdf")
def generate_pdf(
    asset_ids: list[int],
    cols: int = Query(3, ge=1, le=8),
    rows: int = Query(4, ge=1, le=12),
    include_name: bool = True,
    include_id: bool = True,
    include_category: bool = True,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin)
):
    assets = db.query(Asset).filter(Asset.id.in_(asset_ids)).all()
    if not assets:
        raise HTTPException(status_code=404, detail="No assets found")
    asset_dicts = [{"asset_code": a.asset_code, "name": a.name, "category": a.category} for a in assets]
    pdf_bytes = generate_qr_pdf(asset_dicts, cols=cols, rows=rows,
                                  include_name=include_name, include_id=include_id,
                                  include_category=include_category)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=qr_labels.pdf"})


@router.post("/generate-qr-pdf-all")
def generate_pdf_all(
    cols: int = Query(3, ge=1, le=8),
    rows: int = Query(4, ge=1, le=12),
    include_name: bool = True,
    include_id: bool = True,
    include_category: bool = True,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin)
):
    assets = db.query(Asset).all()
    asset_dicts = [{"asset_code": a.asset_code, "name": a.name, "category": a.category} for a in assets]
    pdf_bytes = generate_qr_pdf(asset_dicts, cols=cols, rows=rows,
                                  include_name=include_name, include_id=include_id,
                                  include_category=include_category)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=all_qr_labels.pdf"})


def _asset_dict(a: Asset):
    return {
        "id": a.id, "asset_code": a.asset_code, "name": a.name,
        "category": a.category, "description": a.description,
        "status": a.status, "condition": a.condition,
        "qr_code_url": a.qr_code_url, "created_at": a.created_at
    }

def _audit(db, user_id, action, entity_type, entity_id, details):
    log = AuditLog(action=action, performed_by=user_id, entity_type=entity_type,
                   entity_id=entity_id, details=details)
    db.add(log)
