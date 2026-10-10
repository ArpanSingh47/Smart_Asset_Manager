# Smart Asset Manager — Setup Guide

## Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 14+

---

## 1. Database Setup (PostgreSQL)
```sql
CREATE DATABASE smart_asset_manager;
```

## 2. Backend Setup
```bash
cd backend

# Copy and configure .env
cp .env.example .env
# Edit .env — set DATABASE_URL, GEMINI_API_KEY, SMTP credentials

# Activate virtual environment
.\venv\Scripts\activate       # Windows
source venv/bin/activate      # Mac/Linux

# Install dependencies (already done)
pip install -r requirements.txt

# Start the backend
uvicorn main:app --reload --port 8000
```

## 3. Frontend Setup
```bash
cd frontend
npm install   # Already done
npm run dev   # Starts at http://localhost:5173
```

## 4. Pre-configured Demo Accounts
The database is auto-seeded with realistic university data on first startup:
- **👑 Store Room Administrator (Super Admin)**:
  - Email: `admin@smartasset.edu`
  - Password: `Admin@123`
- **🎓 Faculty User**:
  - Email: `faculty@smartasset.edu`
  - Password: `User@123`
- **🎓 Student Council User**:
  - Email: `aman@smartasset.edu`
  - Password: `User@123`

*(You can also use the one-click **⚡ Quick Demo Login** buttons directly on the login page)*

## 5. Access the App
- **Web App**: http://localhost:5173/ (or http://localhost:5173/login)
- **API Docs (Swagger UI)**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

## Key Features
- ✅ Self-registration with OTP email verification
- ✅ Role-based portals (Admin / User)
- ✅ Asset request workflow with approval
- ✅ QR code generation for each asset
- ✅ Mobile camera-based QR scanning for allocation/return
- ✅ Bulk CSV/Excel import with configurable QR PDF export
- ✅ Daily reminder emails + overdue flagging (runs 8 AM daily)
- ✅ Sammy AI assistant powered by Google Gemini
- ✅ In-app + email notifications
