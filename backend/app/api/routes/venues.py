from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.user import Venue

router = APIRouter(prefix="/api/venues", tags=["venues"])


class VenueCreate(BaseModel):
    name: str
    capacity: Optional[int] = None
    location: str = ""
    facilities: list = []


@router.get("")
def list_venues(db: Session = Depends(get_db)):
    venues = db.query(Venue).filter(Venue.is_active == True).all()
    return [_v(v) for v in venues]


@router.post("")
def create_venue(data: VenueCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    v = Venue(**data.dict())
    db.add(v)
    db.commit()
    db.refresh(v)
    return _v(v)


@router.put("/{venue_id}")
def update_venue(venue_id: int, data: VenueCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    v = db.query(Venue).filter(Venue.id == venue_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    for field, val in data.dict().items():
        setattr(v, field, val)
    db.commit()
    db.refresh(v)
    return _v(v)


@router.delete("/{venue_id}")
def delete_venue(venue_id: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    v = db.query(Venue).filter(Venue.id == venue_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    v.is_active = False
    db.commit()
    return {"message": "Venue deactivated"}


def _v(v: Venue):
    return {
        "id": v.id, "name": v.name, "capacity": v.capacity,
        "location": v.location, "facilities": v.facilities
    }
