import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def send_email(to_email: str, subject: str, html_body: str):
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(f"[DEV MOCK EMAIL] To: {to_email} | Subject: {subject}")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL or settings.SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAILS_FROM_EMAIL or settings.SMTP_USER, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

def send_otp_email(to_email: str, name: str, otp: str):
    subject = "Verify your Smart Asset Manager account"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#f8fafc;padding:30px;border-radius:12px;">
      <h2 style="color:#1e3a5f;">Smart Asset Manager</h2>
      <p>Hi {name},</p>
      <p>Your email verification code is:</p>
      <div style="font-size:36px;font-weight:bold;color:#0ea5e9;letter-spacing:8px;padding:20px;background:#e0f2fe;border-radius:8px;text-align:center;">{otp}</div>
      <p>This code expires in 10 minutes.</p>
      <p style="color:#64748b;font-size:13px;">If you didn't register, please ignore this email.</p>
    </div>
    """
    return send_email(to_email, subject, html)

def send_request_status_email(to_email: str, name: str, request_id: int, status: str, event_name: str, notes: str = ""):
    color = "#16a34a" if status == "approved" else "#dc2626" if status == "rejected" else "#d97706"
    subject = f"Request #{request_id} {status.title()} - Smart Asset Manager"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#f8fafc;padding:30px;border-radius:12px;">
      <h2 style="color:#1e3a5f;">Smart Asset Manager</h2>
      <p>Hi {name},</p>
      <p>Your request for <strong>{event_name}</strong> has been <span style="color:{color};font-weight:bold;">{status.upper()}</span>.</p>
      {'<p><strong>Admin Notes:</strong> ' + notes + '</p>' if notes else ''}
      <p style="color:#64748b;font-size:13px;">Login to Smart Asset Manager to view details.</p>
    </div>
    """
    return send_email(to_email, subject, html)

def send_return_reminder_email(to_email: str, name: str, items: list, due_date: str):
    items_html = "".join([f"<li>{item}</li>" for item in items])
    subject = "⚠️ Asset Return Reminder - Smart Asset Manager"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#f8fafc;padding:30px;border-radius:12px;">
      <h2 style="color:#1e3a5f;">Smart Asset Manager</h2>
      <p>Hi {name},</p>
      <p>This is a reminder to return the following assets. Due date: <strong style="color:#dc2626;">{due_date}</strong></p>
      <ul style="color:#1e3a5f;">{items_html}</ul>
      <p>Please return them to the storeroom as soon as possible.</p>
      <p style="color:#64748b;font-size:13px;">Repeated failure to return assets may affect future booking privileges.</p>
    </div>
    """
    return send_email(to_email, subject, html)

def send_overdue_flag_email(to_email: str, name: str, items: list, due_date: str):
    items_html = "".join([f"<li>{item}</li>" for item in items])
    subject = "🚨 OVERDUE: Assets Not Returned - Smart Asset Manager"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#fff1f2;padding:30px;border-radius:12px;border:2px solid #dc2626;">
      <h2 style="color:#dc2626;">OVERDUE NOTICE</h2>
      <p>Hi {name},</p>
      <p>The following assets were due on <strong style="color:#dc2626;">{due_date}</strong> and have NOT been returned:</p>
      <ul style="color:#1e3a5f;">{items_html}</ul>
      <p><strong>Please return these items immediately.</strong></p>
      <p>Contact the storeroom admin if you need assistance.</p>
    </div>
    """
    return send_email(to_email, subject, html)
