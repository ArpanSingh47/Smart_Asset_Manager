from datetime import datetime, timedelta
import os
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.core.security import get_password_hash
from app.models.user import (
    Base, User, UserRole, Venue, Asset, AssetStatus, AssetCondition,
    Request, RequestItem, RequestStatus, Allocation, AllocationStatus, Notification
)
from app.services.qr_service import generate_qr_code

# The 16 standard equipment types from NewRequest dropdown (3 units each = 48 assets total)
ITEM_SPECS = [
    # Audio (4 types * 3 = 12 assets)
    ("AUD", "Microphone (Wired)", "Audio", "Dynamic wired cardioid handheld vocal microphone with 5m XLR cable", AssetCondition.good),
    ("AUD", "Microphone (Wireless)", "Audio", "UHF cordless handheld microphone system with wireless receiver", AssetCondition.new),
    ("AUD", "Speaker / PA System", "Audio", "Active portable PA sound speaker with Bluetooth and XLR inputs", AssetCondition.good),
    ("AUD", "Amplifier", "Audio", "Stereo power audio amplifier with multi-channel mixer control", AssetCondition.good),

    # Lighting (2 types * 3 = 6 assets)
    ("LGT", "Spotlight", "Lighting", "High-intensity stage LED follow spotlight with adjustable focus", AssetCondition.good),
    ("LGT", "LED Panel Light", "Lighting", "Flat stage wash LED panel light with RGBW DMX control", AssetCondition.good),

    # Electrical (1 type * 3 = 3 assets)
    ("ELC", "Extension Cord (Power)", "Electrical", "Heavy duty industrial 30m 4-socket power extension cord with surge protection", AssetCondition.fair),

    # AV Equipment (4 types * 3 = 12 assets)
    ("AV", "Projector", "AV Equipment", "Full HD 1080p 4500 Lumens multimedia laser projector with HDMI/VGA", AssetCondition.good),
    ("AV", "Projection Screen", "AV Equipment", "Portable 100-inch diagonal tripod stand matte white projection screen", AssetCondition.good),
    ("AV", "HDMI Cable", "AV Equipment", "High-speed 10m braided 4K UHD video HDMI 2.1 cable", AssetCondition.new),
    ("AV", "Laptop Stand", "AV Equipment", "Ergonomic foldable aluminum presentation laptop stand", AssetCondition.good),

    # Furniture (3 types * 3 = 9 assets)
    ("FUR", "Folding Chair", "Furniture", "Cushioned metal frame banquet folding chair with fabric seat", AssetCondition.good),
    ("FUR", "Table (Rectangle)", "Furniture", "6-foot foldable heavy-duty conference utility table", AssetCondition.good),
    ("FUR", "Podium / Lectern", "Furniture", "Dark oak presentation podium with gooseneck microphone socket", AssetCondition.good),

    # Stage (2 types * 3 = 6 assets)
    ("STG", "Stage Platform", "Stage", "Modular 4x4 ft heavy duty height-adjustable stage riser platform", AssetCondition.good),
    ("STG", "Backdrop / Banner Stand", "Stage", "Adjustable 8x10 ft event backdrop and flex banner frame stand", AssetCondition.good),
]

def sync_venues(db: Session):
    venues_data = [
        {"name": "Virangana Rani LaxmiBai Auditorium", "capacity": 1200, "location": "Auditorium Complex", "facilities": ["Full Stage Lighting", "Acoustic Panels", "Central AC", "Green Rooms", "Dual Projectors"]},
        {"name": "Cenate Hall", "capacity": 300, "location": "Administrative Block", "facilities": ["Smart Podium", "Video Conferencing", "Surround Sound", "Central AC"]},
        {"name": "Lecture Hall Complex L1 UIET", "capacity": 150, "location": "LHC Ground Floor, UIET", "facilities": ["Interactive Projector", "PA System", "Tiered Seating", "AC"]},
        {"name": "Open Air Theatre UIET", "capacity": 800, "location": "UIET Campus Lawns", "facilities": ["Open Stage", "Floodlights", "High-power Audio Ports"]},
        {"name": "Conferrence Room CSE-AI Building UIET", "capacity": 50, "location": "CSE-AI Building, 1st Floor, UIET", "facilities": ["Conference Table", "Video Conferencing Screen", "Mic per seat", "AC"]},
        {"name": "Seminar Room UIET 4", "capacity": 80, "location": "UIET Academic Block 4", "facilities": ["Smart Board", "Projector", "Sound System", "AC"]},
        {"name": "Lecture Hall SBM", "capacity": 120, "location": "School of Business Management (SBM)", "facilities": ["Audio Visual Setup", "Podium Mic", "Projector Screen", "AC"]}
    ]
    for vd in venues_data:
        existing = db.query(Venue).filter(Venue.name == vd["name"]).first()
        if not existing:
            db.add(Venue(name=vd["name"], capacity=vd["capacity"], location=vd["location"], facilities=vd["facilities"], is_active=True))
    db.commit()

def build_inventory_and_requests(db: Session, admin_id: int, faculty_id: int, student_id: int, venues: list):
    """Wipe previous asset allocations and build complete 48-item inventory (16 items x 3 units each)"""
    # 1. Clear previous allocations, request items, requests, notifications, and assets
    db.query(Allocation).delete()
    db.query(RequestItem).delete()
    db.query(Request).delete()
    db.query(Notification).delete()
    db.query(Asset).delete()
    db.commit()

    os.makedirs("static/qr_codes", exist_ok=True)

    # 2. Generate 48 assets (3 units for each of the 16 item types)
    assets = {}
    counters = {}

    for prefix, base_name, category, description, cond in ITEM_SPECS:
        for unit in range(1, 4):  # 3 nos each
            count = counters.get(prefix, 0) + 1
            counters[prefix] = count
            code = f"{prefix}-{count:03d}"
            name = f"{base_name} #{unit}"
            qr_url = generate_qr_code(code, name)

            asset = Asset(
                asset_code=code,
                name=name,
                category=category,
                description=description,
                status=AssetStatus.available,
                condition=cond,
                qr_code_url=qr_url,
                created_at=datetime.utcnow() - timedelta(days=2)
            )
            db.add(asset)
            assets[code] = asset

    db.flush()

    # 3. Create realistic sample requests and allocations with the new assets
    # Request 1: Approved & Allocated for Faculty (Tech Symposium)
    v0_id = venues[0].id if venues else None
    v1_id = venues[1].id if len(venues) > 1 else v0_id
    v3_id = venues[3].id if len(venues) > 3 else v0_id

    req1 = Request(
        user_id=faculty_id,
        venue_id=v0_id,
        event_name="National AI & Robotics Symposium 2026",
        event_date=datetime.utcnow() + timedelta(days=2),
        event_start_time="09:30",
        event_end_time="17:00",
        expected_return_date=datetime.utcnow() + timedelta(days=3),
        purpose="Annual technical fest keynote sessions and robotics demonstrations",
        status=RequestStatus.approved,
        admin_notes="Approved all requested equipment. QR codes allocated."
    )
    db.add(req1)
    db.flush()

    db.add(RequestItem(request_id=req1.id, item_name="Microphone (Wireless)", category="Audio", quantity_requested=2, quantity_approved=2, asset_id=assets["AUD-004"].id))
    db.add(RequestItem(request_id=req1.id, item_name="Projector", category="AV Equipment", quantity_requested=1, quantity_approved=1, asset_id=assets["AV-001"].id))
    db.add(RequestItem(request_id=req1.id, item_name="LED Panel Light", category="Lighting", quantity_requested=1, quantity_approved=1, asset_id=assets["LGT-004"].id))
    db.flush()

    # Active allocations for Req 1
    alloc1 = Allocation(
        request_id=req1.id,
        asset_id=assets["AV-001"].id, # Projector #1
        allocated_by=admin_id,
        allocated_at=datetime.utcnow() - timedelta(days=1),
        due_date=datetime.utcnow() + timedelta(days=2),
        status=AllocationStatus.allocated,
        flagged=False
    )
    alloc2 = Allocation(
        request_id=req1.id,
        asset_id=assets["AUD-004"].id, # Microphone (Wireless) #1
        allocated_by=admin_id,
        allocated_at=datetime.utcnow() - timedelta(days=1),
        due_date=datetime.utcnow() + timedelta(days=2),
        status=AllocationStatus.allocated,
        flagged=False
    )
    alloc3 = Allocation(
        request_id=req1.id,
        asset_id=assets["LGT-004"].id, # LED Panel Light #1
        allocated_by=admin_id,
        allocated_at=datetime.utcnow() - timedelta(days=1),
        due_date=datetime.utcnow() + timedelta(days=2),
        status=AllocationStatus.allocated,
        flagged=False
    )
    db.add_all([alloc1, alloc2, alloc3])
    assets["AV-001"].status = AssetStatus.in_use
    assets["AUD-004"].status = AssetStatus.in_use
    assets["LGT-004"].status = AssetStatus.in_use

    # Request 2: Overdue Request for Student Council (Acoustic Night)
    req2 = Request(
        user_id=student_id,
        venue_id=v3_id,
        event_name="Inter-College Acoustic Music Night",
        event_date=datetime.utcnow() - timedelta(days=3),
        event_start_time="18:00",
        event_end_time="22:00",
        expected_return_date=datetime.utcnow() - timedelta(days=2),
        purpose="Live acoustic music performance by student council club bands",
        status=RequestStatus.approved,
        admin_notes="Issued speaker system and spotlight."
    )
    db.add(req2)
    db.flush()

    db.add(RequestItem(request_id=req2.id, item_name="Speaker / PA System", category="Audio", quantity_requested=1, quantity_approved=1, asset_id=assets["AUD-007"].id))
    db.add(RequestItem(request_id=req2.id, item_name="Spotlight", category="Lighting", quantity_requested=1, quantity_approved=1, asset_id=assets["LGT-001"].id))
    db.flush()

    # Overdue allocations for Req 2
    alloc_overdue1 = Allocation(
        request_id=req2.id,
        asset_id=assets["AUD-007"].id, # Speaker / PA System #1
        allocated_by=admin_id,
        allocated_at=datetime.utcnow() - timedelta(days=4),
        due_date=datetime.utcnow() - timedelta(days=2),
        status=AllocationStatus.overdue,
        flagged=True,
        reminder_count=2,
        last_reminder_sent=datetime.utcnow() - timedelta(days=1)
    )
    alloc_overdue2 = Allocation(
        request_id=req2.id,
        asset_id=assets["LGT-001"].id, # Spotlight #1
        allocated_by=admin_id,
        allocated_at=datetime.utcnow() - timedelta(days=4),
        due_date=datetime.utcnow() - timedelta(days=2),
        status=AllocationStatus.overdue,
        flagged=True,
        reminder_count=1,
        last_reminder_sent=datetime.utcnow() - timedelta(days=1)
    )
    db.add_all([alloc_overdue1, alloc_overdue2])
    assets["AUD-007"].status = AssetStatus.in_use
    assets["LGT-001"].status = AssetStatus.in_use

    # Request 3: Pending Request for Faculty
    req3 = Request(
        user_id=faculty_id,
        venue_id=v1_id,
        event_name="Guest Lecture on Quantum Computing",
        event_date=datetime.utcnow() + timedelta(days=5),
        event_start_time="10:00",
        event_end_time="12:30",
        expected_return_date=datetime.utcnow() + timedelta(days=5),
        purpose="Lecture by visiting researcher from IISc Bangalore",
        status=RequestStatus.pending
    )
    db.add(req3)
    db.flush()

    db.add(RequestItem(request_id=req3.id, item_name="Podium / Lectern", category="Furniture", quantity_requested=1))
    db.add(RequestItem(request_id=req3.id, item_name="Microphone (Wired)", category="Audio", quantity_requested=1))
    db.add(RequestItem(request_id=req3.id, item_name="Backdrop / Banner Stand", category="Stage", quantity_requested=1))

    # Notifications
    db.add(Notification(
        user_id=faculty_id,
        title="Request Approved",
        message="Your request for 'National AI & Robotics Symposium 2026' has been approved with active equipment allocations.",
        type="success"
    ))
    db.add(Notification(
        user_id=student_id,
        title="⚠️ Asset Return Overdue",
        message="Speaker / PA System #1 and Spotlight #1 were due 2 days ago. Please return them to the Central Store immediately.",
        type="warning"
    ))

    db.commit()
    print("Asset inventory rebuilt successfully: 48 items catalogued across 6 categories!")

def seed(force_rebuild: bool = False):
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        sync_venues(db)

        # 1. Ensure Admin User
        admin = db.query(User).filter(User.email == "admin@smartasset.edu").first()
        if not admin:
            admin = User(
                name="Dr. Rajesh Sharma",
                email="admin@smartasset.edu",
                hashed_password=get_password_hash("Admin@123"),
                role=UserRole.admin,
                department="Central Stores & Asset Management",
                phone="+91 98765 00001",
                is_active=True,
                is_verified=True
            )
            db.add(admin)

        # 2. Ensure Regular Faculty User
        faculty = db.query(User).filter(User.email == "faculty@smartasset.edu").first()
        if not faculty:
            faculty = User(
                name="Prof. Priya Verma",
                email="faculty@smartasset.edu",
                hashed_password=get_password_hash("User@123"),
                role=UserRole.user,
                department="Computer Science & Engineering",
                phone="+91 98765 00002",
                is_active=True,
                is_verified=True
            )
            db.add(faculty)

        # 3. Ensure Student Council User
        student = db.query(User).filter(User.email == "student@smartasset.edu").first()
        if not student:
            # check legacy email
            student = db.query(User).filter(User.email == "aman@smartasset.edu").first()
        if not student:
            student = User(
                name="Aman Gupta (Student Council)",
                email="student@smartasset.edu",
                hashed_password=get_password_hash("User@123"),
                role=UserRole.user,
                department="Student Welfare",
                phone="+91 98765 00003",
                is_active=True,
                is_verified=True
            )
            db.add(student)

        db.commit()
        db.refresh(admin)
        db.refresh(faculty)
        db.refresh(student)

        venues = db.query(Venue).filter(Venue.is_active == True).all()

        # Check if assets need rebuilding
        asset_count = db.query(Asset).count()
        if asset_count != 48 or force_rebuild:
            print(f"Current asset count: {asset_count}. Rebuilding catalog to 48 standard assets (16 items x 3 nos)...")
            build_inventory_and_requests(db, admin.id, faculty.id, student.id, venues)
        else:
            print("Database already contains complete 48-item asset inventory.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed(force_rebuild=True)
