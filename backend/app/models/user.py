import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Boolean, Text, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class AssetStatus(str, enum.Enum):
    available = "available"
    in_use = "in_use"
    maintenance = "maintenance"
    retired = "retired"


class AssetCondition(str, enum.Enum):
    new = "new"
    good = "good"
    fair = "fair"
    damaged = "damaged"
    lost = "lost"


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    partially_approved = "partially_approved"
    rejected = "rejected"
    completed = "completed"
    cancelled = "cancelled"


class AllocationStatus(str, enum.Enum):
    allocated = "allocated"
    returned = "returned"
    overdue = "overdue"
    lost = "lost"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.user)
    department = Column(String(100))
    phone = Column(String(20))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    otp_code = Column(String(6))
    otp_expires = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    requests = relationship("Request", back_populates="user")
    notifications = relationship("Notification", back_populates="user")


class Venue(Base):
    __tablename__ = "venues"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    capacity = Column(Integer)
    location = Column(String(200))
    facilities = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    requests = relationship("Request", back_populates="venue")


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text)
    status = Column(SAEnum(AssetStatus), default=AssetStatus.available)
    condition = Column(SAEnum(AssetCondition), default=AssetCondition.good)
    qr_code_url = Column(String(500))
    image_url = Column(String(500))
    purchase_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    allocations = relationship("Allocation", back_populates="asset")
    request_items = relationship("RequestItem", back_populates="asset")


class Request(Base):
    __tablename__ = "requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    venue_id = Column(Integer, ForeignKey("venues.id"))
    event_name = Column(String(200), nullable=False)
    event_date = Column(DateTime, nullable=False)
    event_start_time = Column(String(10))
    event_end_time = Column(String(10))
    expected_return_date = Column(DateTime)
    purpose = Column(Text)
    status = Column(SAEnum(RequestStatus), default=RequestStatus.pending)
    admin_notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="requests")
    venue = relationship("Venue", back_populates="requests")
    items = relationship("RequestItem", back_populates="request", cascade="all, delete-orphan")
    allocations = relationship("Allocation", back_populates="request")


class RequestItem(Base):
    __tablename__ = "request_items"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    category = Column(String(100))
    item_name = Column(String(200), nullable=False)
    quantity_requested = Column(Integer, default=1)
    quantity_approved = Column(Integer, default=0)
    is_other = Column(Boolean, default=False)
    notes = Column(Text)

    request = relationship("Request", back_populates="items")
    asset = relationship("Asset", back_populates="request_items")


class Allocation(Base):
    __tablename__ = "allocations"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    allocated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    allocated_at = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime)
    returned_at = Column(DateTime)
    return_condition = Column(SAEnum(AssetCondition))
    status = Column(SAEnum(AllocationStatus), default=AllocationStatus.allocated)
    reminder_count = Column(Integer, default=0)
    last_reminder_sent = Column(DateTime)
    flagged = Column(Boolean, default=False)
    return_notes = Column(Text)

    request = relationship("Request", back_populates="allocations")
    asset = relationship("Asset", back_populates="allocations")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False)
    performed_by = Column(Integer, ForeignKey("users.id"))
    entity_type = Column(String(50))
    entity_id = Column(Integer)
    details = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)
