from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler
import os, logging

from app.core.database import engine
from app.models.user import Base
from app.api.routes import auth, assets, requests, allocations, venues, dashboard, ai
from app.jobs.reminder_job import run_reminder_job

logging.basicConfig(level=logging.INFO)

# Create tables
Base.metadata.create_all(bind=engine)

# Static files
os.makedirs("static/qr_codes", exist_ok=True)

# Auto-seed if empty
try:
    from app.core.database import SessionLocal
    from app.models.user import User
    from seed_data import seed, sync_venues
    with SessionLocal() as _db:
        sync_venues(_db)
        if _db.query(User).count() == 0:
            seed()
except Exception as _e:
    logging.warning(f"Auto-seed warning: {_e}")

app = FastAPI(
    title="Smart Asset Manager API",
    description="University Asset Management System with AI Assistant (Sammy)",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for QR codes
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routes
app.include_router(auth.router)
app.include_router(assets.router)
app.include_router(requests.router)
app.include_router(allocations.router)
app.include_router(venues.router)
app.include_router(dashboard.router)
app.include_router(ai.router)

# Scheduler - runs daily at 8:00 AM
scheduler = BackgroundScheduler()
scheduler.add_job(run_reminder_job, "cron", hour=8, minute=0)
scheduler.start()

@app.get("/")
def root():
    return {"message": "Smart Asset Manager API", "version": "1.0.0", "ai_assistant": "Sammy"}

@app.get("/health")
def health():
    return {"status": "ok"}
