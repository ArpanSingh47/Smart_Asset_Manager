import os
import io
import qrcode
from PIL import Image
from fpdf import FPDF
from app.core.config import settings

QR_DIR = "static/qr_codes"
os.makedirs(QR_DIR, exist_ok=True)


def generate_qr_code(asset_code: str, asset_name: str) -> str:
    """Generate QR code PNG and return its file path."""
    scan_url = f"{settings.FRONTEND_URL}/admin/scan?asset={asset_code}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(scan_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    file_path = os.path.join(QR_DIR, f"{asset_code}.png")
    img.save(file_path)
    return f"/static/qr_codes/{asset_code}.png"


def generate_qr_pdf(assets: list, cols: int = 3, rows: int = 4,
                    include_name: bool = True, include_id: bool = True,
                    include_category: bool = True) -> bytes:
    """
    Generate a PDF with QR codes in a grid layout.
    assets: list of dicts with keys: asset_code, name, category, qr_code_url
    cols: number of QR columns per page
    rows: number of QR rows per page
    Returns PDF as bytes.
    """
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)

    page_w, page_h = 210, 297
    margin = 10
    usable_w = page_w - 2 * margin
    usable_h = page_h - 2 * margin

    cell_w = usable_w / cols
    cell_h = usable_h / rows
    qr_size = min(cell_w, cell_h) * 0.6

    per_page = cols * rows
    total = len(assets)
    pages = (total + per_page - 1) // per_page

    for page_idx in range(pages):
        pdf.add_page()
        pdf.set_font("Helvetica", size=7)
        page_assets = assets[page_idx * per_page: (page_idx + 1) * per_page]

        for idx, asset in enumerate(page_assets):
            col = idx % cols
            row = idx // cols
            x = margin + col * cell_w
            y = margin + row * cell_h

            # Draw border
            pdf.set_draw_color(200, 200, 200)
            pdf.rect(x, y, cell_w, cell_h)

            # QR Code image
            qr_path = os.path.join(QR_DIR, f"{asset['asset_code']}.png")
            if os.path.exists(qr_path):
                qr_x = x + (cell_w - qr_size) / 2
                qr_y = y + 2
                pdf.image(qr_path, x=qr_x, y=qr_y, w=qr_size, h=qr_size)

            text_y = y + qr_size + 4
            pdf.set_xy(x, text_y)

            if include_id:
                pdf.set_font("Helvetica", "B", 7)
                pdf.cell(cell_w, 4, asset["asset_code"], align="C", ln=1)
                pdf.set_x(x)

            if include_name:
                pdf.set_font("Helvetica", size=6)
                name = asset["name"][:25] + "..." if len(asset["name"]) > 25 else asset["name"]
                pdf.cell(cell_w, 3.5, name, align="C", ln=1)
                pdf.set_x(x)

            if include_category:
                pdf.set_font("Helvetica", "I", 5.5)
                pdf.cell(cell_w, 3, asset["category"], align="C", ln=1)

    buf = io.BytesIO()
    pdf_bytes = pdf.output()
    return bytes(pdf_bytes)
