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

def seed():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # Check if already seeded
        if db.query(User).filter(User.email == "admin@smartasset.edu").first():
            print("Database already contains seed data.")
            return

        print("Seeding database with initial data...")

        # 1. Admin User
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

        # 2. Regular Faculty User
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

        # 3. Student Council User
        student = User(
            name="Aman Gupta (Student Council)",
            email="aman@smartasset.edu",
            hashed_password=get_password_hash("User@123"),
            role=UserRole.user,
            department="Student Welfare",
            phone="+91 98765 00003",
            is_active=True,
            is_verified=True
        )
        db.add(student)
        db.flush()

        # 4. Venues (Non-portable resources)
        venues_data = [
            {
                "name": "Main University Auditorium",
                "capacity": 1200,
                "location": "Central Academic Block, Ground Floor",
                "facilities": ["Full Stage Lighting", "Acoustic Panels", "Central AC", "Green Rooms", "Dual Projectors"]
            },
            {
                "name": "Sir C.V. Raman Seminar Hall",
                "capacity": 250,
                "location": "Science Block B, 2nd Floor",
                "facilities": ["Smart Podium", "Video Conferencing", "Surround Sound"]
            },
            {
                "name": "Open Air Amphitheatre",
                "capacity": 800,
                "location": "Student Activity Center Lawn",
                "facilities": ["Open Stage", "Floodlights", "High-power Audio Ports"]
            },
            {
                "name": "Executive Council Room",
                "capacity": 45,
                "location": "Administrative Building, 1st Floor",
                "facilities": ["U-Shape Seating", "Motorized Screen", "Mic per seat"]
            }
        ]

        venues = []
        for vd in venues_data:
            v = Venue(
                name=vd["name"],
                capacity=vd["capacity"],
                location=vd["location"],
                facilities=vd["facilities"],
                is_active=True
            )
            db.add(v)
            venues.append(v)
        db.flush()

        # 5. Portable Assets
        os.makedirs("static/qr_codes", exist_ok=True)
        assets_data = [
            ("AUD-001", "Shure SLX Cordless Handheld Mic #1", "Audio", "Wireless UHF microphone with dual receiver", AssetStatus.in_use, AssetCondition.good),
            ("AUD-002", "Shure SLX Cordless Handheld Mic #2", "Audio", "Wireless UHF microphone with dual receiver", AssetStatus.available, AssetCondition.new),
            ("AUD-003", "Sennheiser Wireless Collar / Lavalier Mic", "Audio", "Lapel mic with bodypack transmitter", AssetStatus.available, AssetCondition.good),
            ("AUD-004", "JBL EON One Compact Portable PA Speaker", "Audio", "Battery-powered Bluetooth PA with 4-channel mixer", AssetStatus.in_use, AssetCondition.good),
            ("LGT-001", "Stage Floodlight LED Par Can 54x3W #1", "Lighting", "RGBW DMX-controllable stage wash light", AssetStatus.available, AssetCondition.good),
            ("LGT-002", "Stage Floodlight LED Par Can 54x3W #2", "Lighting", "RGBW DMX-controllable stage wash light", AssetStatus.in_use, AssetCondition.good),
            ("LGT-003", "Traditional Brass Lighting Lamp (5-tier)", "Lighting", "Inauguration lamp with brass stand", AssetStatus.available, AssetCondition.good),
            ("FUR-001", "VIP Banquet Chairs Set (Pack of 20)", "Furniture", "Cushioned stackable banquet chairs with maroon fabric", AssetStatus.available, AssetCondition.good),
            ("FUR-002", "Executive Wooden Podium with Lamp", "Furniture", "Movable dark oak lectern with gooseneck lamp socket", AssetStatus.available, AssetCondition.good),
            ("AV-001", "Epson PowerLite 4K HD Laser Projector", "AV Equipment", "5000 Lumens WUXGA laser projector with HDMI", AssetStatus.in_use, AssetCondition.good),
            ("AV-002", "Tripod Projection Screen 100-inch", "AV Equipment", "Portable roll-up matte white screen", AssetStatus.available, AssetCondition.good),
            ("ELC-001", "Heavy Duty Industrial Extension Cord 30m", "Electrical", "4-socket extension with surge protector", AssetStatus.available, AssetCondition.fair),
        ]

        assets = {}
        for code, name, cat, desc, status, cond in assets_data:
            qr_url = generate_qr_code(code, name)
            asset = Asset(
                asset_code=code,
                name=name,
                category=cat,
                description=desc,
                status=status,
                condition=cond,
                qr_code_url=qr_url
            )
            db.add(asset)
            assets[code] = asset
        db.flush()

        # 6. Sample Requests & Allocations
        # Request 1: Approved & Allocated for Faculty (Tech Symposium)
        req1 = Request(
            user_id=faculty.id,
            venue_id=venues[0].id,
            event_name="National AI & Robotics Symposium 2026",
            event_date=datetime.utcnow() + timedelta(days=2),
            event_start_time="09:30",
            event_end_time="17:00",
            expected_return_date=datetime.utcnow() + timedelta(days=3),
            purpose="Annual technical fest keynote sessions and robotics demonstrations",
            status=RequestStatus.approved,
            admin_notes="Approved all requested sound and visual equipment."
        )
        db.add(req1)
        db.flush()

        item1 = RequestItem(request_id=req1.id, item_name="Cordless Handheld Mic", category="Audio", quantity_requested=2, quantity_approved=2)
        item2 = RequestItem(request_id=req1.id, item_name="Epson 4K Projector", category="AV Equipment", quantity_requested=1, quantity_approved=1)
        item3 = RequestItem(request_id=req1.id, item_name="LED Stage Lighting", category="Lighting", quantity_requested=2, quantity_approved=2)
        db.add_all([item1, item2, item3])
        db.flush()

        # Allocations for Req 1 (Normal active allocation)
        alloc1 = Allocation(
            request_id=req1.id,
            asset_id=assets["AUD-001"].id,
            allocated_by=admin.id,
            allocated_at=datetime.utcnow() - timedelta(days=1),
            due_date=datetime.utcnow() + timedelta(days=2),
            status=AllocationStatus.allocated,
            flagged=False
        )
        alloc2 = Allocation(
            request_id=req1.id,
            asset_id=assets["AV-001"].id,
            allocated_by=admin.id,
            allocated_at=datetime.utcnow() - timedelta(days=1),
            due_date=datetime.utcnow() + timedelta(days=2),
            status=AllocationStatus.allocated,
            flagged=False
        )
        db.add_all([alloc1, alloc2])

        # Request 2: Overdue Request for Student Council (Cultural Night)
        # Demonstrates the overdue flagging and "Send Reminder" button requirement!
        req2 = Request(
            user_id=student.id,
            venue_id=venues[2].id,
            event_name="Inter-College Acoustic Music Night",
            event_date=datetime.utcnow() - timedelta(days=3),
            event_start_time="18:00",
            event_end_time="22:00",
            expected_return_date=datetime.utcnow() - timedelta(days=2),
            purpose="Live performance by campus student bands",
            status=RequestStatus.approved,
            admin_notes="Issued JBL speaker and stage floodlight."
        )
        db.add(req2)
        db.flush()

        # Overdue / Flagged Allocation
        alloc_overdue1 = Allocation(
            request_id=req2.id,
            asset_id=assets["AUD-004"].id, # JBL PA Speaker
            allocated_by=admin.id,
            allocated_at=datetime.utcnow() - timedelta(days=4),
            due_date=datetime.utcnow() - timedelta(days=2),
            status=AllocationStatus.overdue,
            flagged=True,
            reminder_count=1,
            last_reminder_sent=datetime.utcnow() - timedelta(days=1)
        )
        alloc_overdue2 = Allocation(
            request_id=req2.id,
            asset_id=assets["LGT-002"].id, # Stage Floodlight #2
            allocated_by=admin.id,
            allocated_at=datetime.utcnow() - timedelta(days=4),
            due_date=datetime.utcnow() - timedelta(days=2),
            status=AllocationStatus.overdue,
            flagged=True,
            reminder_count=2,
            last_reminder_sent=datetime.utcnow() - timedelta(days=1)
        )
        db.add_all([alloc_overdue1, alloc_overdue2])

        # Request 3: Pending Request (shows user dropdown list + extra items requirement)
        req3 = Request(
            user_id=faculty.id,
            venue_id=venues[1].id,
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

        db.add(RequestItem(request_id=req3.id, item_name="Wireless Collar Mic", category="Audio", quantity_requested=1, is_other=False))
        db.add(RequestItem(request_id=req3.id, item_name="Podium with Lamp", category="Furniture", quantity_requested=1, is_other=False))
        db.add(RequestItem(request_id=req3.id, item_name="Laser Presenter with Air Mouse", category="AV Equipment", quantity_requested=1, is_other=True, notes="Special handheld pointer for slides"))

        # Welcome notifications
        db.add(Notification(
            user_id=faculty.id,
            title="Request Approved",
            message="Your request for 'National AI & Robotics Symposium 2026' has been approved. QR-based allocation is active.",
            type="success"
        ))
        db.add(Notification(
            user_id=student.id,
            title="⚠️ Asset Return Overdue",
            message="JBL EON One Speaker and Stage Floodlight were due 2 days ago. Please return them to the Central Store immediately.",
            type="warning"
        ))

        db.commit()
        print("Database successfully seeded with realistic sample data!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed()
