"""Reporting Engine Service for agricultural PDF generation, CSV timeseries export, and season comparison.

Implements:
1. generate_health_report(db, estate_id, start_date, end_date) -> bytes (PDF)
2. generate_harvest_prediction_report(db, estate_id) -> bytes (PDF)
3. generate_water_usage_report(db, estate_id, start_date, end_date) -> bytes (PDF)
4. export_timeseries_csv(db, estate_id, start_date, end_date) -> str (CSV)
5. generate_season_comparison(db, plot_id) -> Dict[str, Any]
6. Scheduled weekly report archive generator & storage helper
"""

import csv
from datetime import date, datetime, timedelta, timezone
import html
import io
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

try:
    from sqlalchemy import desc, func, select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import selectinload
except ImportError:
    desc = func = select = selectinload = AsyncSession = Any  # type: ignore

# ReportLab imports
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
try:
    from app.services.gdd_service import calculate_etc, predict_harvest_date
except ImportError:
    def calculate_etc(et0: Optional[float], kc: Optional[float]) -> Optional[float]:
        if et0 is None or kc is None:
            return None
        return round(float(et0) * float(kc), 2)

    def predict_harvest_date(
        planting_date: Optional[date],
        gdd_cumulative: float,
        gdd_target_total: float,
        avg_daily_gdd: float = 15.0,
    ) -> Optional[date]:
        if gdd_target_total is None or gdd_target_total <= 0:
            return None
        remaining_gdd = max(0.0, float(gdd_target_total) - float(gdd_cumulative))
        rate = float(avg_daily_gdd) if avg_daily_gdd and avg_daily_gdd > 0 else 15.0
        days_left = round(remaining_gdd / rate)
        return date.today() + timedelta(days=int(days_left))

logger = logging.getLogger(__name__)

# Base storage directory for generated weekly reports
STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage",
    "reports",
)


# =============================================================================
# Custom Numbered Canvas for Professional PDF Page Numbering
# =============================================================================


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and render total page count."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: List[Any] = []

    def showPage(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages: int) -> None:
        """Render running header and footer on every page."""
        self.saveState()
        page_w, page_h = getattr(self, "_pagesize", A4)

        # Top running header line (on pages after the first page)
        if self._pageNumber > 1:
            self.setStrokeColor(colors.HexColor("#047857"))
            self.setLineWidth(0.8)
            self.line(20 * mm, page_h - 15 * mm, page_w - 20 * mm, page_h - 15 * mm)
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#047857"))
            self.drawString(20 * mm, page_h - 13 * mm, "TANI - PLATFORM SAAS MONITORING PERTANIAN")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748b"))
            self.drawRightString(page_w - 20 * mm, page_h - 13 * mm, "Laporan Resmi Operasional Lahan")

        # Bottom running footer on all pages
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(20 * mm, 16 * mm, page_w - 20 * mm, 16 * mm)

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(20 * mm, 11 * mm, "Dicetak otomatis oleh Sistem Cerdas Tani — Rahasia Perusahaan")
        page_str = f"Halaman {self._pageNumber} dari {total_pages}"
        self.drawRightString(page_w - 20 * mm, 11 * mm, page_str)

        self.restoreState()


# =============================================================================
# Helper Style Generator
# =============================================================================


def _get_report_styles() -> Dict[str, ParagraphStyle]:
    """Build customized typography styles matching Tani design system."""
    base_styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#047857"),
        spaceAfter=10,
    )

    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#475569"),
    )

    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#065f46"),
        spaceBefore=8,
        spaceAfter=6,
    )

    th_style = ParagraphStyle(
        "TableHeader",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1,  # Center
    )

    td_style = ParagraphStyle(
        "TableCell",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1e293b"),
    )

    td_center = ParagraphStyle(
        "TableCellCenter",
        parent=td_style,
        alignment=1,
    )

    td_bold = ParagraphStyle(
        "TableCellBold",
        parent=td_style,
        fontName="Helvetica-Bold",
    )

    badge_green = ParagraphStyle(
        "BadgeGreen",
        parent=td_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#047857"),
        alignment=1,
    )

    badge_yellow = ParagraphStyle(
        "BadgeYellow",
        parent=td_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#b45309"),
        alignment=1,
    )

    badge_orange = ParagraphStyle(
        "BadgeOrange",
        parent=td_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#c2410c"),
        alignment=1,
    )

    badge_red = ParagraphStyle(
        "BadgeRed",
        parent=td_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#b91c1c"),
        alignment=1,
    )

    box_label = ParagraphStyle(
        "BoxLabel",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    box_val = ParagraphStyle(
        "BoxValue",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
    )

    note_style = ParagraphStyle(
        "ReportNote",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )

    return {
        "title": title_style,
        "subtitle": subtitle_style,
        "meta": meta_style,
        "heading": section_heading,
        "th": th_style,
        "td": td_style,
        "td_center": td_center,
        "td_bold": td_bold,
        "badge_green": badge_green,
        "badge_yellow": badge_yellow,
        "badge_orange": badge_orange,
        "badge_red": badge_red,
        "box_label": box_label,
        "box_val": box_val,
        "note": note_style,
    }


def _escape_xml(text: Any) -> str:
    """Escape XML/HTML entities (&, <, >, ", ') safely for ReportLab Paragraph rendering."""
    if text is None:
        return ""
    val = str(text)
    return html.escape(val, quote=True)


def _format_hectares(area: Optional[float]) -> str:
    """Format plot area with adaptive precision and thousand separators."""
    if area is None:
        return "0.0 Ha"
    try:
        val = float(area)
    except (ValueError, TypeError):
        return f"{area} Ha"
    if val <= 0:
        return "0.0 Ha"
    if val < 0.01:
        return f"{val:.4f} Ha"
    if val < 1.0:
        return f"{val:.2f} Ha"
    if val >= 10000.0:
        return f"{val:,.1f} Ha"
    return f"{val:.1f} Ha"


def _build_doc_header(
    title: str,
    estate_name: str,
    location_desc: str,
    date_range_desc: str,
    styles: Dict[str, ParagraphStyle],
    page_width_mm: float = 210.0,
) -> List[Any]:
    """Construct standard executive letterhead for Tani reports."""
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M WIB")

    safe_title = _escape_xml(title)
    safe_estate = _escape_xml(estate_name)
    safe_loc = _escape_xml(location_desc)
    safe_date = _escape_xml(date_range_desc)

    printable_w = max(170.0, page_width_mm - 30.0)
    col1_w = printable_w * 0.70 * mm
    col2_w = printable_w * 0.30 * mm

    header_table_data = [
        [
            Paragraph(f"<b>{safe_title.upper()}</b>", styles["title"]),
            Paragraph(f"<b>Tanggal Cetak:</b> {now_str}<br/><b>Status:</b> Terverifikasi Sistem", styles["meta"]),
        ],
        [
            Paragraph(
                f"<b>Estate:</b> {safe_estate} | <b>Lokasi:</b> {safe_loc}<br/>"
                f"<b>Periode Evaluasi:</b> {safe_date}",
                styles["subtitle"],
            ),
            "",
        ],
    ]

    header_table = Table(header_table_data, colWidths=[col1_w, col2_w])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("SPAN", (0, 1), (1, 1)),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    divider = HRFlowable(
        width="100%",
        thickness=1.5,
        color=colors.HexColor("#047857"),
        spaceBefore=4,
        spaceAfter=10,
    )

    return [header_table, divider]


# =============================================================================
# 1. Laporan Kesehatan Lahan (generate_health_report)
# =============================================================================


async def generate_health_report(
    db: AsyncSession,
    estate_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> bytes:
    """Generate professional PDF Health Report for an estate."""
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex

    # 1. Fetch Estate & Plots
    stmt_estate = (
        select(Estate)
        .options(selectinload(Estate.company))
        .where(Estate.id == estate_id)
    )
    estate = (await db.execute(stmt_estate)).scalar_one_or_none()
    if not estate:
        raise ValueError(f"Estate dengan ID {estate_id} tidak ditemukan.")

    today = date.today()
    if not end_date:
        end_date = today
    if not start_date:
        start_date = end_date - timedelta(days=30)

    # 2. Fetch plots in estate with relationships
    stmt_plots = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .options(
            selectinload(Plot.division),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.alerts),
        )
        .order_by(Plot.name.asc())
    )
    plots = (await db.execute(stmt_plots)).scalars().all()

    # 3. Aggregate Spectral indices & Alerts
    plot_ids = [p.id for p in plots]
    spectral_map: Dict[int, List[SpectralIndex]] = {pid: [] for pid in plot_ids}

    if plot_ids:
        stmt_spec = (
            select(SpectralIndex)
            .where(
                SpectralIndex.plot_id.in_(plot_ids),
                SpectralIndex.observation_date >= start_date,
                SpectralIndex.observation_date <= end_date,
            )
            .order_by(SpectralIndex.observation_date.desc())
        )
        spec_rows = (await db.execute(stmt_spec)).scalars().all()
        for s in spec_rows:
            spectral_map[s.plot_id].append(s)

    # Calculate summary numbers
    total_plots = len(plots)
    total_area = sum(p.area_hectares for p in plots)
    all_ndvis = [
        s.ndvi for s_list in spectral_map.values() for s in s_list if s.ndvi is not None
    ]
    avg_estate_ndvi = round(sum(all_ndvis) / len(all_ndvis), 2) if all_ndvis else 0.0

    # Active alerts in estate
    all_unresolved_alerts = [
        a for p in plots for a in p.alerts if not a.is_resolved
    ]
    red_alerts = len([a for a in all_unresolved_alerts if a.severity == "merah"])
    orange_alerts = len([a for a in all_unresolved_alerts if a.severity == "oranye"])
    yellow_alerts = len([a for a in all_unresolved_alerts if a.severity == "kuning"])

    # 4. Build PDF Document
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = _get_report_styles()
    story: List[Any] = []

    # Document Header
    loc_desc = f"{estate.kabupaten or ''}, {estate.province or ''}".strip(", ")
    if not loc_desc:
        loc_desc = "Indonesia"
    date_desc = f"{start_date.strftime('%d/%m/%Y')} s/d {end_date.strftime('%d/%m/%Y')}"

    story.extend(
        _build_doc_header(
            title="Laporan Kesehatan Lahan & Evaluasi Anomali",
            estate_name=estate.name,
            location_desc=loc_desc,
            date_range_desc=date_desc,
            styles=styles,
        )
    )

    # Summary KPI Cards Table
    kpi_data = [
        [
            Paragraph("TOTAL PETAK", styles["box_label"]),
            Paragraph("TOTAL LUAS (HA)", styles["box_label"]),
            Paragraph("RATA-RATA NDVI", styles["box_label"]),
            Paragraph("ALERT MERAH / KRITIS", styles["box_label"]),
            Paragraph("ALERT ORANYE / KUNING", styles["box_label"]),
        ],
        [
            Paragraph(f"<b>{total_plots}</b>", styles["box_val"]),
            Paragraph(f"<b>{total_area:.1f}</b>", styles["box_val"]),
            Paragraph(f"<b>{avg_estate_ndvi:.2f}</b>", styles["box_val"]),
            Paragraph(f"<font color='#dc2626'><b>{red_alerts}</b></font>", styles["box_val"]),
            Paragraph(f"<font color='#ea580c'><b>{orange_alerts + yellow_alerts}</b></font>", styles["box_val"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[34 * mm, 34 * mm, 36 * mm, 38 * mm, 38 * mm])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    # Section Table Heading
    story.append(Paragraph("RINCIAN KESEHATAN VEGETASI PER PETAK LAHAN", styles["heading"]))

    # Plots Table
    table_headers = [
        Paragraph("Nama Petak & Divisi", styles["th"]),
        Paragraph("Komoditas & Varietas", styles["th"]),
        Paragraph("HST & Fase", styles["th"]),
        Paragraph("Rata NDVI & Status", styles["th"]),
        Paragraph("Alert Aktif", styles["th"]),
        Paragraph("Rekomendasi Agronomis", styles["th"]),
    ]
    table_rows = [table_headers]

    for p in plots:
        div_name = _escape_xml(p.division.name) if p.division else "-"
        var_name = _escape_xml(p.variety.name) if p.variety else "-"
        safe_name = _escape_xml(p.name)
        safe_crop = _escape_xml(p.crop_type.capitalize()) if p.crop_type else "-"
        hst = p.current_hst or 0
        phase = _escape_xml(p.current_phase or "Vegetatif")
        area_str = _format_hectares(p.area_hectares)

        # NDVI for this plot
        p_specs = spectral_map.get(p.id, [])
        p_ndvis = [s.ndvi for s in p_specs if s.ndvi is not None]
        if not p_specs or not p_ndvis:
            health_badge = Paragraph("<b>-</b><br/><font color='#64748b'>(Belum Ada Data)</font>", styles["td_center"])
        else:
            avg_ndvi = round(sum(p_ndvis) / len(p_ndvis), 2)
            # Health status classification
            if avg_ndvi >= 0.65:
                health_badge = Paragraph(f"<b>{avg_ndvi:.2f}</b><br/>(Sangat Sehat)", styles["badge_green"])
            elif avg_ndvi >= 0.45:
                health_badge = Paragraph(f"<b>{avg_ndvi:.2f}</b><br/>(Normal)", styles["badge_green"])
            elif avg_ndvi >= 0.30:
                health_badge = Paragraph(f"<b>{avg_ndvi:.2f}</b><br/>(Waspada/Stres)", styles["badge_yellow"])
            else:
                health_badge = Paragraph(f"<b>{avg_ndvi:.2f}</b><br/>(Kritis/Gundul)", styles["badge_red"])

        # Active Alerts for plot
        active_p_alerts = [a for a in p.alerts if not a.is_resolved]
        if not active_p_alerts:
            alert_cell = Paragraph("<font color='#047857'><b>Nihil (Aman)</b></font>", styles["td_center"])
            rekom_text = "Pertahankan manajemen hara & pengairan terjadwal."
        else:
            alert_items = []
            for a in active_p_alerts[:2]:
                color_hex = "#dc2626" if a.severity == "merah" else ("#ea580c" if a.severity == "oranye" else "#d97706")
                alert_items.append(f"<font color='{color_hex}'>• {_escape_xml(a.title)}</font>")
            alert_cell = Paragraph("<br/>".join(alert_items), styles["td"])
            rekom_text = _escape_xml(active_p_alerts[0].recommendation) if active_p_alerts[0].recommendation else "Inspeksi langsung petak lahan."

        table_rows.append(
            [
                Paragraph(f"<b>{safe_name}</b><br/><font color='#64748b'>{div_name} ({area_str})</font>", styles["td"]),
                Paragraph(f"<b>{safe_crop}</b><br/>{var_name}", styles["td"]),
                Paragraph(f"<b>{hst} HST</b><br/>{phase}", styles["td_center"]),
                health_badge,
                alert_cell,
                Paragraph(rekom_text, styles["td"]),
            ]
        )

    if not plots:
        table_rows.append(
            [
                Paragraph("Belum ada petak lahan terdaftar pada estate ini.", styles["td_center"]),
                "", "", "", "", "",
            ]
        )

    plots_table = Table(
        table_rows,
        colWidths=[32 * mm, 26 * mm, 22 * mm, 24 * mm, 32 * mm, 44 * mm],
        repeatRows=1,
    )
    table_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if not plots:
        table_styles.append(("SPAN", (0, 1), (-1, 1)))
        table_styles.append(("ALIGN", (0, 1), (-1, 1), "CENTER"))
    plots_table.setStyle(TableStyle(table_styles))
    story.append(plots_table)
    story.append(Spacer(1, 10))

    # Agronomic Guidelines Footer
    guidelines = [
        Paragraph("<b>Catatan Agronomis & Petunjuk Tindak Lanjut Lapangan:</b>", styles["heading"]),
        Paragraph(
            "1. <b>Stres Nitrogen:</b> Petak dengan indeks NDRE rendah pada fase Vegetatif Aktif memerlukan aplikasi urea / NPK susulan.<br/>"
            "2. <b>Stres Air / Cekaman Kekeringan:</b> Petak dengan penurunan NDWI memerlukan pengecekan pintu air irigasi tersier segera.<br/>"
            "3. <b>Anomali Kanopi:</b> Penurunan NDVI drastis mengindikasikan potensi serangan OPT hama wereng / penggerek atau rebah.",
            styles["note"],
        ),
    ]
    story.append(KeepTogether(guidelines))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


# =============================================================================
# 2. Laporan Prediksi Panen (generate_harvest_prediction_report)
# =============================================================================


async def generate_harvest_prediction_report(
    db: AsyncSession,
    estate_id: int,
) -> bytes:
    """Generate professional PDF Harvest Prediction Report for an estate."""
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot

    stmt_estate = (
        select(Estate)
        .options(selectinload(Estate.company))
        .where(Estate.id == estate_id)
    )
    estate = (await db.execute(stmt_estate)).scalar_one_or_none()
    if not estate:
        raise ValueError(f"Estate dengan ID {estate_id} tidak ditemukan.")

    today = date.today()

    # Fetch plots and active seasons
    stmt_plots = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .options(
            selectinload(Plot.division),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.seasons),
            selectinload(Plot.gdd_records),
        )
        .order_by(Plot.name.asc())
    )
    plots = (await db.execute(stmt_plots)).scalars().all()

    # Collect predictions
    report_items = []
    total_area_ha = 0.0
    total_est_yield_tons = 0.0
    ready_harvest_count = 0

    for p in plots:
        var = p.variety
        cycle_days = var.cycle_days if var else 115
        hst = p.current_hst or 0
        planting_dt = p.planting_date or (today - timedelta(days=hst))

        # Target GDD
        gdd_target_total = 0.0
        if var and var.phases:
            targets = [ph.gdd_target for ph in var.phases if ph.gdd_target]
            if targets:
                gdd_target_total = max(targets)
        if gdd_target_total <= 0:
            gdd_target_total = 1400.0 if p.crop_type == "padi" else 1600.0

        # Latest GDD
        latest_gdd = 0.0
        pred_date = None
        if p.gdd_records:
            latest_rec = p.gdd_records[0]
            latest_gdd = latest_rec.gdd_cumulative
            pred_date = latest_rec.predicted_harvest_date

        if not pred_date:
            pred_date = predict_harvest_date(planting_dt, latest_gdd, gdd_target_total)

        progress_pct = min(100.0, round((latest_gdd / gdd_target_total) * 100.0, 1)) if gdd_target_total > 0 else 0.0

        # Active planting season yield estimate
        active_season = next((s for s in p.seasons if s.status == "active"), None)
        yield_rate = (
            active_season.yield_estimate_ton_per_ha
            if (active_season and active_season.yield_estimate_ton_per_ha)
            else (6.2 if p.crop_type == "padi" else 7.5)
        )
        plot_tonnage = round(yield_rate * p.area_hectares, 1)

        total_area_ha += p.area_hectares
        total_est_yield_tons += plot_tonnage

        # Check if ready within 14 days or already >= 100% GDD
        days_to_harvest = (pred_date - today).days if pred_date else 999
        if days_to_harvest <= 14 or progress_pct >= 95.0:
            ready_harvest_count += 1

        report_items.append(
            {
                "plot": p,
                "variety": var.name if var else "-",
                "hst": hst,
                "cycle_days": cycle_days,
                "latest_gdd": latest_gdd,
                "target_gdd": gdd_target_total,
                "progress_pct": progress_pct,
                "pred_date": pred_date,
                "days_to_harvest": days_to_harvest,
                "yield_rate": yield_rate,
                "plot_tonnage": plot_tonnage,
            }
        )

    # Sort report_items by predicted harvest date ascending
    report_items.sort(key=lambda x: (x["pred_date"] or date.max))

    # Build PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = _get_report_styles()
    story: List[Any] = []

    loc_desc = f"{estate.kabupaten or ''}, {estate.province or ''}".strip(", ")
    if not loc_desc:
        loc_desc = "Indonesia"

    story.extend(
        _build_doc_header(
            title="Laporan Prediksi Panen & Progres Termal GDD",
            estate_name=estate.name,
            location_desc=loc_desc,
            date_range_desc=f"Proyeksi per {today.strftime('%d %B %Y')}",
            styles=styles,
        )
    )

    # Executive Summary Cards
    kpi_data = [
        [
            Paragraph("TOTAL PETAK AKTIF", styles["box_label"]),
            Paragraph("LUAS KANTONG PANEN", styles["box_label"]),
            Paragraph("ESTIMASI TOTAL HASIL", styles["box_label"]),
            Paragraph("SIAP PANEN (<=14 HARI)", styles["box_label"]),
        ],
        [
            Paragraph(f"<b>{len(plots)}</b>", styles["box_val"]),
            Paragraph(f"<b>{total_area_ha:.1f} Ha</b>", styles["box_val"]),
            Paragraph(f"<font color='#047857'><b>{total_est_yield_tons:,.1f} Ton</b></font>", styles["box_val"]),
            Paragraph(f"<font color='#b45309'><b>{ready_harvest_count} Petak</b></font>", styles["box_val"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[45 * mm, 45 * mm, 45 * mm, 45 * mm])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("DAFTAR JADWAL PREDIKSI PANEN PETAK LAHAN", styles["heading"]))

    # Table
    table_headers = [
        Paragraph("Petak & Divisi", styles["th"]),
        Paragraph("Komoditas / Varietas", styles["th"]),
        Paragraph("Luas", styles["th"]),
        Paragraph("HST / Siklus", styles["th"]),
        Paragraph("Akumulasi GDD", styles["th"]),
        Paragraph("Progres GDD", styles["th"]),
        Paragraph("Prediksi Panen", styles["th"]),
        Paragraph("Estimasi Tonase", styles["th"]),
    ]
    table_rows = [table_headers]

    for item in report_items:
        p = item["plot"]
        div_name = p.division.name if p.division else "-"
        pred_str = item["pred_date"].strftime("%d/%m/%Y") if item["pred_date"] else "TBD"
        days_left = item["days_to_harvest"]

        if days_left <= 7:
            pred_cell = Paragraph(f"<font color='#b91c1c'><b>{pred_str}</b></font><br/>({days_left} hari lagi)", styles["td_center"])
        elif days_left <= 14:
            pred_cell = Paragraph(f"<font color='#ea580c'><b>{pred_str}</b></font><br/>({days_left} hari lagi)", styles["td_center"])
        else:
            pred_cell = Paragraph(f"<b>{pred_str}</b><br/>({days_left} hari lagi)", styles["td_center"])

        pct_val = item["progress_pct"]
        pct_cell = Paragraph(f"<b>{pct_val:.1f}%</b>", styles["badge_green"] if pct_val >= 90 else styles["td_center"])

        safe_p_name = _escape_xml(p.name)
        safe_div = _escape_xml(div_name)
        safe_crop = _escape_xml(p.crop_type.capitalize()) if p.crop_type else "-"
        safe_var = _escape_xml(item['variety'])
        safe_area = _format_hectares(p.area_hectares)

        table_rows.append(
            [
                Paragraph(f"<b>{safe_p_name}</b><br/><font color='#64748b'>{safe_div}</font>", styles["td"]),
                Paragraph(f"<b>{safe_crop}</b><br/>{safe_var}", styles["td"]),
                Paragraph(safe_area, styles["td_center"]),
                Paragraph(f"{item['hst']} / {item['cycle_days']} hr", styles["td_center"]),
                Paragraph(f"{item['latest_gdd']:.0f} / {item['target_gdd']:.0f}", styles["td_center"]),
                pct_cell,
                pred_cell,
                Paragraph(f"<b>{item['plot_tonnage']:.1f} Ton</b><br/>({item['yield_rate']:.1f} T/Ha)", styles["td_center"]),
            ]
        )

    if not report_items:
        table_rows.append(
            [
                Paragraph("Belum ada petak lahan atau proyeksi panen aktif.", styles["td_center"]),
                "", "", "", "", "", "", "",
            ]
        )

    harvest_table = Table(
        table_rows,
        colWidths=[28 * mm, 26 * mm, 16 * mm, 20 * mm, 24 * mm, 18 * mm, 26 * mm, 22 * mm],
        repeatRows=1,
    )
    harvest_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if not report_items:
        harvest_styles.append(("SPAN", (0, 1), (-1, 1)))
        harvest_styles.append(("ALIGN", (0, 1), (-1, 1), "CENTER"))
    harvest_table.setStyle(TableStyle(harvest_styles))
    story.append(harvest_table)
    story.append(Spacer(1, 10))

    # SOP Pra-Panen
    sop_section = [
        Paragraph("<b>Standar Operasional Prosedur (SOP) Persiapan Pra-Panen:</b>", styles["heading"]),
        Paragraph(
            "1. <b>Pengeringan Lahan (7-10 Hari Pra-Panen):</b> Hentikan irigasi dan buang genangan air untuk mempercepat pemasakan malai gabah secara serempak dan mempermudah operasional combine harvester.<br/>"
            "2. <b>Kalibrasi Alat & Logistik:</b> Pastikan mesin perontok / combine harvester dan terpal pengeringan siap operasi.<br/>"
            "3. <b>Kadar Air Ideal:</b> Panen gabah disarankan pada kadar air rontok 21-24% untuk meminimalisir butir patah dan kehilangan hasil.",
            styles["note"],
        ),
    ]
    story.append(KeepTogether(sop_section))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


# =============================================================================
# 3. Laporan Kebutuhan Air (generate_water_usage_report)
# =============================================================================


async def generate_water_usage_report(
    db: AsyncSession,
    estate_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> bytes:
    """Generate professional PDF Water Usage & Irrigation Management Report."""
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot
    from app.models.weather_data import WeatherData

    stmt_estate = (
        select(Estate)
        .options(selectinload(Estate.company))
        .where(Estate.id == estate_id)
    )
    estate = (await db.execute(stmt_estate)).scalar_one_or_none()
    if not estate:
        raise ValueError(f"Estate dengan ID {estate_id} tidak ditemukan.")

    today = date.today()
    if not end_date:
        end_date = today
    if not start_date:
        start_date = end_date - timedelta(days=7)

    # Weather observations for estate (ET0 and rainfall)
    stmt_weather = (
        select(WeatherData)
        .where(
            WeatherData.estate_id == estate_id,
            WeatherData.observation_date >= start_date,
            WeatherData.observation_date <= end_date,
        )
        .order_by(WeatherData.observation_date.desc())
    )
    weather_records = (await db.execute(stmt_weather)).scalars().all()

    avg_et0 = 4.2  # default Penman-Monteith tropics
    total_rainfall = 0.0
    if weather_records:
        et0_vals = [w.et0_mm for w in weather_records if w.et0_mm is not None]
        if et0_vals:
            avg_et0 = round(sum(et0_vals) / len(et0_vals), 2)
        total_rainfall = round(
            sum(w.rainfall_mm for w in weather_records if w.rainfall_mm is not None), 1
        )

    num_days = max(1, (end_date - start_date).days + 1)

    # Fetch plots in estate
    stmt_plots = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .options(
            selectinload(Plot.division),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.gdd_records),
        )
        .order_by(Plot.name.asc())
    )
    plots = (await db.execute(stmt_plots)).scalars().all()

    # Calculate irrigation requirements per plot
    plot_water_data = []
    total_estate_water_m3 = 0.0

    for p in plots:
        phase_name = p.current_phase or "Vegetatif"
        # Find active Kc from variety phase
        kc = 1.05  # Default mid-season rice Kc
        if p.variety and p.variety.phases:
            matching_phase = next(
                (ph for ph in p.variety.phases if ph.phase_name.lower() in phase_name.lower()),
                None,
            )
            if matching_phase and matching_phase.kc_value:
                kc = matching_phase.kc_value
            elif p.crop_type == "jagung":
                kc = 0.95

        etc_daily = calculate_etc(avg_et0, kc) or 4.0
        # 1 mm of water over 1 hectare = 10 m³
        daily_volume_m3 = etc_daily * 10.0 * p.area_hectares
        period_volume_m3 = daily_volume_m3 * num_days
        total_estate_water_m3 += period_volume_m3

        # Irrigation Recommendation
        if "bunting" in phase_name.lower() or "generatif" in phase_name.lower() or "bunga" in phase_name.lower():
            recom_irr = "Genangan stabil 3-5 cm. Fase kritis hara & polen."
        elif "matang" in phase_name.lower() or "pemasakan" in phase_name.lower() or "panen" in phase_name.lower():
            recom_irr = "Kurangi debit; keringkan petak 7 hari sebelum panen."
        elif "awal" in phase_name.lower() or "semai" in phase_name.lower():
            recom_irr = "Irigasi macak-macak dangkal 1-2 cm."
        else:
            recom_irr = "Irigasi intermiten berselang (AWD) 3-5 cm."

        plot_water_data.append(
            {
                "plot": p,
                "area_ha": p.area_hectares,
                "phase": phase_name,
                "kc": kc,
                "etc_daily": etc_daily,
                "period_m3": period_volume_m3,
                "recommendation": recom_irr,
            }
        )

    # Water balance status
    net_water_deficit_mm = round((avg_et0 * num_days) - total_rainfall, 1)
    if net_water_deficit_mm > 15:
        balance_status = f"Defisit Air ({net_water_deficit_mm:.1f} mm)"
        balance_color = "#dc2626"
    elif net_water_deficit_mm < -15:
        balance_status = f"Surplus Hujan ({-net_water_deficit_mm:.1f} mm)"
        balance_color = "#047857"
    else:
        balance_status = "Kebutuhan Berimbang"
        balance_color = "#0284c7"

    # Build PDF Document
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = _get_report_styles()
    story: List[Any] = []

    loc_desc = f"{estate.kabupaten or ''}, {estate.province or ''}".strip(", ")
    if not loc_desc:
        loc_desc = "Indonesia"
    date_desc = f"{start_date.strftime('%d/%m/%Y')} s/d {end_date.strftime('%d/%m/%Y')} ({num_days} Hari)"

    story.extend(
        _build_doc_header(
            title="Laporan Kebutuhan Air & Manajemen Irigasi",
            estate_name=estate.name,
            location_desc=loc_desc,
            date_range_desc=date_desc,
            styles=styles,
        )
    )

    # Water KPI Summary Cards
    kpi_data = [
        [
            Paragraph("RATA-RATA ET0 KEBUN", styles["box_label"]),
            Paragraph("CURAH HUJAN PERIODE", styles["box_label"]),
            Paragraph("TOTAL KEBUTUHAN AIR", styles["box_label"]),
            Paragraph("STATUS NERACA AIR", styles["box_label"]),
        ],
        [
            Paragraph(f"<b>{avg_et0:.2f} mm/hari</b>", styles["box_val"]),
            Paragraph(f"<b>{total_rainfall:.1f} mm</b>", styles["box_val"]),
            Paragraph(f"<font color='#047857'><b>{total_estate_water_m3:,.0f} m³</b></font>", styles["box_val"]),
            Paragraph(f"<font color='{balance_color}'><b>{balance_status}</b></font>", styles["box_val"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[45 * mm, 45 * mm, 45 * mm, 45 * mm])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("RINCIAN ESTIMASI KEBUTUHAN IRIGASI PER PETAK LAHAN", styles["heading"]))

    # Table
    table_headers = [
        Paragraph("Nama Petak & Divisi", styles["th"]),
        Paragraph("Luas", styles["th"]),
        Paragraph("Fase Fenologi", styles["th"]),
        Paragraph("Kc", styles["th"]),
        Paragraph("ETc Harian", styles["th"]),
        Paragraph("Volume Kebutuhan", styles["th"]),
        Paragraph("Rekomendasi Debit & Pola Irigasi", styles["th"]),
    ]
    table_rows = [table_headers]

    for item in plot_water_data:
        p = item["plot"]
        div_name = p.division.name if p.division else "-"
        safe_p_name = _escape_xml(p.name)
        safe_div = _escape_xml(div_name)
        safe_phase = _escape_xml(item['phase'])
        safe_recom = _escape_xml(item['recommendation'])
        safe_area = _format_hectares(item['area_ha'])

        table_rows.append(
            [
                Paragraph(f"<b>{safe_p_name}</b><br/><font color='#64748b'>{safe_div}</font>", styles["td"]),
                Paragraph(safe_area, styles["td_center"]),
                Paragraph(safe_phase, styles["td"]),
                Paragraph(f"{item['kc']:.2f}", styles["td_center"]),
                Paragraph(f"<b>{item['etc_daily']:.2f}</b> mm", styles["td_center"]),
                Paragraph(f"<b>{item['period_m3']:,.0f} m³</b>", styles["td_center"]),
                Paragraph(safe_recom, styles["td"]),
            ]
        )

    if not plot_water_data:
        table_rows.append(
            [
                Paragraph("Belum ada petak lahan atau data kebutuhan irigasi terdaftar.", styles["td_center"]),
                "", "", "", "", "", "",
            ]
        )

    water_table = Table(
        table_rows,
        colWidths=[32 * mm, 18 * mm, 26 * mm, 14 * mm, 22 * mm, 24 * mm, 44 * mm],
        repeatRows=1,
    )
    water_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if not plot_water_data:
        water_styles.append(("SPAN", (0, 1), (-1, 1)))
        water_styles.append(("ALIGN", (0, 1), (-1, 1), "CENTER"))
    water_table.setStyle(TableStyle(water_styles))
    story.append(water_table)
    story.append(Spacer(1, 10))

    # Irrigation Wisdom Guidelines
    guide_section = [
        Paragraph("<b>Petunjuk Manajemen Irigasi Hemat Air (Alternate Wetting and Drying - AWD):</b>", styles["heading"]),
        Paragraph(
            "1. <b>Metode AWD (Basah-Kering Berselang):</b> Pada fase vegetatif aktif, biarkan muka air tanah turun hingga 10-15 cm di bawah permukaan tanah sebelum dialiri kembali hingga tinggi genangan 3-5 cm. Ini menghemat hingga 30% air tanpa menurunkan hasil gabah.<br/>"
            "2. <b>Fase Bunting s/d Pengisian Bulir:</b> Tanaman sangat peka kekeringan. Petak wajib dipertahankan tergenang dangkal 3-5 cm.<br/>"
            "3. <b>Pemanfaatan Curah Hujan:</b> Tutup pintu pengeluaran tersier saat hujan lebat untuk menampung presipitasi alami.",
            styles["note"],
        ),
    ]
    story.append(KeepTogether(guide_section))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


# =============================================================================
# 4. Export CSV Time-Series Data (export_timeseries_csv)
# =============================================================================


async def export_timeseries_csv(
    db: AsyncSession,
    estate_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> str:
    """Generate consolidated multi-parameter time-series dataset in CSV format."""
    from app.models.division import Division
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    from app.models.weather_data import WeatherData

    today = date.today()
    if not end_date:
        end_date = today
    if not start_date:
        start_date = end_date - timedelta(days=90)

    # 1. Fetch plots in estate
    stmt_plots = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .options(
            selectinload(Plot.division),
            selectinload(Plot.variety),
        )
        .order_by(Plot.name.asc())
    )
    plots = (await db.execute(stmt_plots)).scalars().all()
    plot_ids = [p.id for p in plots]
    plot_map = {p.id: p for p in plots}

    if not plot_ids:
        # Return empty CSV with header
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Tanggal", "Nama Petak", "Divisi", "Komoditas", "Varietas", "HST",
                "Fase Fenologi", "NDVI", "NDRE", "NDWI", "SAVI", "SAR VV dB",
                "SAR VH dB", "Tmax (C)", "Tmin (C)", "Hujan (mm)", "ET0 (mm)",
                "ETc (mm)", "GDD Harian", "GDD Kumulatif",
            ]
        )
        return output.getvalue()

    # 2. Fetch Weather Data for Estate in range
    stmt_weather = (
        select(WeatherData)
        .where(
            WeatherData.estate_id == estate_id,
            WeatherData.observation_date >= start_date,
            WeatherData.observation_date <= end_date,
        )
        .order_by(WeatherData.observation_date.asc())
    )
    weather_records = (await db.execute(stmt_weather)).scalars().all()
    weather_by_date: Dict[date, WeatherData] = {w.observation_date: w for w in weather_records}

    # 3. Fetch Spectral indices for plots in range
    stmt_spec = (
        select(SpectralIndex)
        .where(
            SpectralIndex.plot_id.in_(plot_ids),
            SpectralIndex.observation_date >= start_date,
            SpectralIndex.observation_date <= end_date,
        )
        .order_by(SpectralIndex.observation_date.asc())
    )
    spec_records = (await db.execute(stmt_spec)).scalars().all()
    spec_by_plot_date: Dict[Tuple[int, date], SpectralIndex] = {
        (s.plot_id, s.observation_date): s for s in spec_records
    }

    # 4. Fetch GDD records for plots in range
    stmt_gdd = (
        select(GddAccumulation)
        .where(
            GddAccumulation.plot_id.in_(plot_ids),
            GddAccumulation.observation_date >= start_date,
            GddAccumulation.observation_date <= end_date,
        )
        .order_by(GddAccumulation.observation_date.asc())
    )
    gdd_records = (await db.execute(stmt_gdd)).scalars().all()
    gdd_by_plot_date: Dict[Tuple[int, date], GddAccumulation] = {
        (g.plot_id, g.observation_date): g for g in gdd_records
    }

    # Collect all unique dates across observations
    all_dates = set(weather_by_date.keys())
    all_dates.update(d for _, d in spec_by_plot_date.keys())
    all_dates.update(d for _, d in gdd_by_plot_date.keys())

    if not all_dates:
        # Generate full date sequence between start and end
        cur = start_date
        while cur <= end_date:
            all_dates.add(cur)
            cur += timedelta(days=1)

    sorted_dates = sorted(all_dates)

    # 5. Build CSV Rows
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Tanggal",
            "Nama Petak",
            "Divisi",
            "Komoditas",
            "Varietas",
            "HST",
            "Fase Fenologi",
            "NDVI",
            "NDRE",
            "NDWI",
            "SAVI",
            "SAR VV dB",
            "SAR VH dB",
            "Tmax (C)",
            "Tmin (C)",
            "Hujan (mm)",
            "ET0 (mm)",
            "ETc (mm)",
            "GDD Harian",
            "GDD Kumulatif",
        ]
    )

    for obs_date in sorted_dates:
        w_rec = weather_by_date.get(obs_date)
        tmax = f"{w_rec.temp_max_c:.1f}" if (w_rec and w_rec.temp_max_c is not None) else ""
        tmin = f"{w_rec.temp_min_c:.1f}" if (w_rec and w_rec.temp_min_c is not None) else ""
        rain = f"{w_rec.rainfall_mm:.1f}" if (w_rec and w_rec.rainfall_mm is not None) else ""
        et0 = f"{w_rec.et0_mm:.2f}" if (w_rec and w_rec.et0_mm is not None) else ""

        for p in plots:
            div_name = p.division.name if p.division else ""
            var_name = p.variety.name if p.variety else ""

            # Calculate HST for this observation date
            hst = ""
            if p.planting_date:
                days_since = (obs_date - p.planting_date).days
                hst = str(max(0, days_since))

            spec = spec_by_plot_date.get((p.id, obs_date))
            ndvi = f"{spec.ndvi:.4f}" if (spec and spec.ndvi is not None) else ""
            ndre = f"{spec.ndre:.4f}" if (spec and spec.ndre is not None) else ""
            ndwi = f"{spec.ndwi:.4f}" if (spec and spec.ndwi is not None) else ""
            savi = f"{spec.savi:.4f}" if (spec and spec.savi is not None) else ""
            vv = f"{spec.sar_vv_db:.2f}" if (spec and spec.sar_vv_db is not None) else ""
            vh = f"{spec.sar_vh_db:.2f}" if (spec and spec.sar_vh_db is not None) else ""

            gdd = gdd_by_plot_date.get((p.id, obs_date))
            phase = gdd.predicted_phase if (gdd and gdd.predicted_phase) else (p.current_phase or "")
            etc = f"{gdd.etc_mm:.2f}" if (gdd and gdd.etc_mm is not None) else ""
            gdd_daily = f"{gdd.gdd_daily:.2f}" if (gdd and gdd.gdd_daily is not None) else ""
            gdd_cum = f"{gdd.gdd_cumulative:.2f}" if (gdd and gdd.gdd_cumulative is not None) else ""

            writer.writerow(
                [
                    obs_date.isoformat(),
                    p.name,
                    div_name,
                    p.crop_type,
                    var_name,
                    hst,
                    phase,
                    ndvi,
                    ndre,
                    ndwi,
                    savi,
                    vv,
                    vh,
                    tmax,
                    tmin,
                    rain,
                    et0,
                    etc,
                    gdd_daily,
                    gdd_cum,
                ]
            )

    return output.getvalue()


# =============================================================================
# 4.1 Laporan Deret Waktu Telemetri & Agroklimat Petak (generate_plot_telemetry_report)
# =============================================================================


async def generate_plot_telemetry_report(
    db: AsyncSession,
    plot_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    orientation: str = "portrait",
) -> bytes:
    """Generate professional agronomy PDF report for a single plot's telemetry and agroclimate.

    Supports:
    - Multi-page layout, portrait/landscape orientation
    - Dynamic pagination (handles 5 vs 50+ observations cleanly with repeated table headers)
    - Institutional header, plot metadata profile, KPI cards
    - Satellite telemetry table (NDVI, NDRE, NDWI, SAVI, SAR VV/VH, status)
    - Weather summary table (Tmin, Tmax, Rainfall, ET0)
    - Resilient to special characters, XML/HTML entities, emojis, ultra-long plot names
    - Boundary cases: 0 telemetry points, microscopic plots (<0.01 Ha), massive plots (>10,000 Ha), null metrics
    """
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    from app.models.weather_data import WeatherData

    # 1. Fetch Plot with related Division, Estate, Variety
    stmt_plot = (
        select(Plot)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.alerts),
        )
        .where(Plot.id == plot_id)
    )
    plot = (await db.execute(stmt_plot)).scalar_one_or_none()
    if not plot:
        raise ValueError(f"Petak lahan dengan ID {plot_id} tidak ditemukan.")

    today = date.today()
    if not end_date:
        end_date = today
    if not start_date:
        start_date = end_date - timedelta(days=60)

    division = plot.division
    estate = division.estate if division else None

    # 2. Fetch Spectral Index observations for plot
    stmt_spec = (
        select(SpectralIndex)
        .where(
            SpectralIndex.plot_id == plot_id,
            SpectralIndex.observation_date >= start_date,
            SpectralIndex.observation_date <= end_date,
        )
        .order_by(SpectralIndex.observation_date.desc())
    )
    spec_rows = (await db.execute(stmt_spec)).scalars().all()

    # 3. Fetch Weather observations for estate
    weather_rows = []
    if estate:
        stmt_w = (
            select(WeatherData)
            .where(
                WeatherData.estate_id == estate.id,
                WeatherData.observation_date >= start_date,
                WeatherData.observation_date <= end_date,
            )
            .order_by(WeatherData.observation_date.desc())
        )
        weather_rows = (await db.execute(stmt_w)).scalars().all()

    # Summary metrics
    ndvis = [s.ndvi for s in spec_rows if s.ndvi is not None]
    ndres = [s.ndre for s in spec_rows if s.ndre is not None]
    ndwis = [s.ndwi for s in spec_rows if s.ndwi is not None]
    rains = [w.rainfall_mm for w in weather_rows if w.rainfall_mm is not None]

    avg_ndvi = round(sum(ndvis) / len(ndvis), 3) if ndvis else None
    peak_ndvi = round(max(ndvis), 3) if ndvis else None
    avg_ndwi = round(sum(ndwis) / len(ndwis), 3) if ndwis else None
    total_rain = round(sum(rains), 1) if rains else 0.0

    # 4. Document Setup
    is_landscape = (str(orientation).lower() == "landscape")
    pagesize = landscape(A4) if is_landscape else A4
    page_w_mm = 297.0 if is_landscape else 210.0
    printable_w_mm = 267.0 if is_landscape else 180.0

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = _get_report_styles()
    story: List[Any] = []

    # Header
    estate_name = estate.name if estate else "Estate Tani"
    loc_desc = f"{estate.kabupaten or ''}, {estate.province or ''}".strip(", ") if estate else "Indonesia"
    if not loc_desc:
        loc_desc = "Indonesia"
    date_desc = f"{start_date.strftime('%d/%m/%Y')} s/d {end_date.strftime('%d/%m/%Y')}"

    story.extend(
        _build_doc_header(
            title="Laporan Deret Waktu Telemetri & Agroklimat",
            estate_name=estate_name,
            location_desc=loc_desc,
            date_range_desc=date_desc,
            styles=styles,
            page_width_mm=page_w_mm,
        )
    )

    # Plot Metadata Block
    safe_plot_name = _escape_xml(plot.name)
    safe_div_name = _escape_xml(division.name) if division else "-"
    safe_crop = _escape_xml(plot.crop_type.capitalize()) if plot.crop_type else "-"
    safe_var = _escape_xml(plot.variety.name) if plot.variety else "-"
    area_str = _format_hectares(plot.area_hectares)
    hst_str = f"{plot.current_hst or 0} HST"
    phase_str = _escape_xml(plot.current_phase or "Vegetatif")
    plant_str = plot.planting_date.strftime("%d/%m/%Y") if plot.planting_date else "-"

    col_meta = printable_w_mm / 4.0 * mm
    meta_table_data = [
        [
            Paragraph(f"<b>Nama Petak:</b> {safe_plot_name}", styles["td"]),
            Paragraph(f"<b>Divisi / Blok:</b> {safe_div_name}", styles["td"]),
            Paragraph(f"<b>Komoditas:</b> {safe_crop}", styles["td"]),
            Paragraph(f"<b>Varietas:</b> {safe_var}", styles["td"]),
        ],
        [
            Paragraph(f"<b>Luas Lahan:</b> {area_str}", styles["td"]),
            Paragraph(f"<b>Tgl Tanam:</b> {plant_str}", styles["td"]),
            Paragraph(f"<b>Umur Tanaman:</b> {hst_str}", styles["td"]),
            Paragraph(f"<b>Fase Fenologi:</b> {phase_str}", styles["td"]),
        ],
    ]
    meta_table = Table(meta_table_data, colWidths=[col_meta] * 4)
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # KPI Summary Cards
    col_kpi = printable_w_mm / 5.0 * mm
    kpi_ndvi_str = f"{avg_ndvi:.3f}" if avg_ndvi is not None else "-"
    kpi_peak_str = f"{peak_ndvi:.3f}" if peak_ndvi is not None else "-"
    kpi_ndwi_str = f"{avg_ndwi:.3f}" if avg_ndwi is not None else "-"

    kpi_data = [
        [
            Paragraph("TOTAL OBSERVASI", styles["box_label"]),
            Paragraph("RATA-RATA NDVI", styles["box_label"]),
            Paragraph("PUNCAK NDVI", styles["box_label"]),
            Paragraph("RATA-RATA NDWI", styles["box_label"]),
            Paragraph("TOTAL HUJAN", styles["box_label"]),
        ],
        [
            Paragraph(f"<b>{len(spec_rows)} Rekaman</b>", styles["box_val"]),
            Paragraph(f"<b>{kpi_ndvi_str}</b>", styles["box_val"]),
            Paragraph(f"<font color='#047857'><b>{kpi_peak_str}</b></font>", styles["box_val"]),
            Paragraph(f"<b>{kpi_ndwi_str}</b>", styles["box_val"]),
            Paragraph(f"<b>{total_rain:.1f} mm</b>", styles["box_val"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[col_kpi] * 5)
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    # Satellite Telemetry Table
    story.append(Paragraph("DERET WAKTU TELEMETRI SATELIT (SENTINEL-2 & SENTINEL-1 SAR)", styles["heading"]))

    if is_landscape:
        spec_col_widths = [26 * mm, 24 * mm, 16 * mm, 24 * mm, 24 * mm, 24 * mm, 24 * mm, 26 * mm, 26 * mm, 53 * mm]
        spec_headers = [
            Paragraph("Tanggal", styles["th"]),
            Paragraph("Satelit", styles["th"]),
            Paragraph("HST", styles["th"]),
            Paragraph("NDVI", styles["th"]),
            Paragraph("NDRE", styles["th"]),
            Paragraph("NDWI", styles["th"]),
            Paragraph("SAVI", styles["th"]),
            Paragraph("SAR VV dB", styles["th"]),
            Paragraph("SAR VH dB", styles["th"]),
            Paragraph("Status Kanopi", styles["th"]),
        ]
    else:
        spec_col_widths = [24 * mm, 14 * mm, 20 * mm, 20 * mm, 20 * mm, 20 * mm, 20 * mm, 20 * mm, 22 * mm]
        spec_headers = [
            Paragraph("Tanggal", styles["th"]),
            Paragraph("HST", styles["th"]),
            Paragraph("NDVI", styles["th"]),
            Paragraph("NDRE", styles["th"]),
            Paragraph("NDWI", styles["th"]),
            Paragraph("SAVI", styles["th"]),
            Paragraph("SAR VV", styles["th"]),
            Paragraph("SAR VH", styles["th"]),
            Paragraph("Status", styles["th"]),
        ]

    spec_table_rows = [spec_headers]

    if not spec_rows:
        empty_msg = "Belum ada rekaman telemetri satelit pada rentang tanggal ini."
        empty_row = [Paragraph(empty_msg, styles["td_center"])] + [""] * (len(spec_headers) - 1)
        spec_table_rows.append(empty_row)
    else:
        for s in spec_rows:
            obs_str = s.observation_date.strftime("%d/%m/%Y")
            obs_hst = str(max(0, (s.observation_date - plot.planting_date).days)) if plot.planting_date else "-"
            sat_name = _escape_xml(s.satellite or "sentinel-2")
            ndvi_val = f"{s.ndvi:.4f}" if s.ndvi is not None else "-"
            ndre_val = f"{s.ndre:.4f}" if s.ndre is not None else "-"
            ndwi_val = f"{s.ndwi:.4f}" if s.ndwi is not None else "-"
            savi_val = f"{s.savi:.4f}" if s.savi is not None else "-"
            vv_val = f"{s.sar_vv_db:.1f}" if s.sar_vv_db is not None else "-"
            vh_val = f"{s.sar_vh_db:.1f}" if s.sar_vh_db is not None else "-"

            if s.ndvi is None:
                status_p = Paragraph("-", styles["td_center"])
            elif s.ndvi >= 0.65:
                status_p = Paragraph("Sangat Sehat", styles["badge_green"])
            elif s.ndvi >= 0.45:
                status_p = Paragraph("Normal", styles["badge_green"])
            elif s.ndvi >= 0.30:
                status_p = Paragraph("Stres Ringan", styles["badge_yellow"])
            else:
                status_p = Paragraph("Kritis/Gundul", styles["badge_red"])

            if is_landscape:
                row = [
                    Paragraph(obs_str, styles["td_center"]),
                    Paragraph(sat_name, styles["td_center"]),
                    Paragraph(obs_hst, styles["td_center"]),
                    Paragraph(ndvi_val, styles["td_center"]),
                    Paragraph(ndre_val, styles["td_center"]),
                    Paragraph(ndwi_val, styles["td_center"]),
                    Paragraph(savi_val, styles["td_center"]),
                    Paragraph(vv_val, styles["td_center"]),
                    Paragraph(vh_val, styles["td_center"]),
                    status_p,
                ]
            else:
                row = [
                    Paragraph(obs_str, styles["td_center"]),
                    Paragraph(obs_hst, styles["td_center"]),
                    Paragraph(ndvi_val, styles["td_center"]),
                    Paragraph(ndre_val, styles["td_center"]),
                    Paragraph(ndwi_val, styles["td_center"]),
                    Paragraph(savi_val, styles["td_center"]),
                    Paragraph(vv_val, styles["td_center"]),
                    Paragraph(vh_val, styles["td_center"]),
                    status_p,
                ]
            spec_table_rows.append(row)

    spec_table = Table(spec_table_rows, colWidths=spec_col_widths, repeatRows=1)
    table_style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]
    if not spec_rows:
        table_style_commands.append(("SPAN", (0, 1), (-1, 1)))
        table_style_commands.append(("ALIGN", (0, 1), (-1, 1), "CENTER"))

    spec_table.setStyle(TableStyle(table_style_commands))
    story.append(spec_table)
    story.append(Spacer(1, 10))

    # Weather Summary Table
    story.append(Paragraph("RINGKASAN AGROKLIMAT & CUACA HARIAN", styles["heading"]))

    w_col_widths = [printable_w_mm / 5.0 * mm] * 5
    w_headers = [
        Paragraph("Tanggal", styles["th"]),
        Paragraph("Suhu Min (°C)", styles["th"]),
        Paragraph("Suhu Max (°C)", styles["th"]),
        Paragraph("Curah Hujan (mm)", styles["th"]),
        Paragraph("Evapotranspirasi ET0 (mm)", styles["th"]),
    ]
    w_table_rows = [w_headers]

    if not weather_rows:
        empty_w_msg = "Belum ada rekaman data agroklimat / cuaca pada rentang tanggal ini."
        w_table_rows.append([Paragraph(empty_w_msg, styles["td_center"]), "", "", "", ""])
    else:
        for w in weather_rows[:30]:  # Up to 30 most recent weather observations
            w_date_str = w.observation_date.strftime("%d/%m/%Y")
            w_tmin = f"{w.temp_min_c:.1f}" if w.temp_min_c is not None else "-"
            w_tmax = f"{w.temp_max_c:.1f}" if w.temp_max_c is not None else "-"
            w_rain = f"{w.rainfall_mm:.1f}" if w.rainfall_mm is not None else "-"
            w_et0 = f"{w.et0_mm:.2f}" if w.et0_mm is not None else "-"

            w_table_rows.append(
                [
                    Paragraph(w_date_str, styles["td_center"]),
                    Paragraph(w_tmin, styles["td_center"]),
                    Paragraph(w_tmax, styles["td_center"]),
                    Paragraph(w_rain, styles["td_center"]),
                    Paragraph(w_et0, styles["td_center"]),
                ]
            )

    w_table = Table(w_table_rows, colWidths=w_col_widths, repeatRows=1)
    w_style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]
    if not weather_rows:
        w_style_commands.append(("SPAN", (0, 1), (-1, 1)))
        w_style_commands.append(("ALIGN", (0, 1), (-1, 1), "CENTER"))

    w_table.setStyle(TableStyle(w_style_commands))
    story.append(w_table)
    story.append(Spacer(1, 10))

    # Interpretation footer
    footer_notes = [
        Paragraph("<b>Petunjuk Interpretasi Data Agronomi:</b>", styles["heading"]),
        Paragraph(
            "1. <b>NDVI (Normalized Difference Vegetation Index):</b> Indikator kerapatan biomassa hijau. Nilai &ge; 0.65 mencerminkan kanopi puncak sehat.<br/>"
            "2. <b>NDRE (Red-Edge Index):</b> Detektor dini klorofil dan stres nitrogen pada daun lapisan atas tanaman.<br/>"
            "3. <b>NDWI (Water Index):</b> Mengukur kecukupan hidrasi sel daun. Nilai turun drastis mendeteksi cekaman kekeringan pra-gejala visual.<br/>"
            "4. <b>SAR VV/VH:</b> Hamburan balik radar gelombang mikro Sentinel-1 untuk memantau struktur tegakan tanaman tanpa terganggu awan.",
            styles["note"],
        ),
    ]
    story.append(KeepTogether(footer_notes))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


# =============================================================================
# 4.2 Ekspor CSV Telemetri Deret Waktu Petak Lahan (export_plot_telemetry_csv)
# =============================================================================


async def export_plot_telemetry_csv(
    db: AsyncSession,
    plot_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    include_bom: bool = True,
) -> str:
    """Export standard agricultural telemetry time-series dataset for a single plot in CSV format.

    Headers:
    tanggal, hst, ndvi, ndre, ndwi, savi, bsi, suhu_min, suhu_max, curah_hujan, et0

    Compliance:
    - Standard snake_case agronomic headers
    - UTF-8 BOM encoding for Microsoft Excel compatibility
    - Decimal formatting with appropriate precision
    - Safe handling for 0 telemetry observations and null values
    """
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    from app.models.weather_data import WeatherData

    stmt_plot = (
        select(Plot)
        .options(selectinload(Plot.division).selectinload(Division.estate))
        .where(Plot.id == plot_id)
    )
    plot = (await db.execute(stmt_plot)).scalar_one_or_none()
    if not plot:
        raise ValueError(f"Petak lahan dengan ID {plot_id} tidak ditemukan.")

    today = date.today()
    if not end_date:
        end_date = today
    if not start_date:
        start_date = end_date - timedelta(days=90)

    estate_id = plot.division.estate_id if (plot.division and plot.division.estate_id) else None

    # Fetch Spectral Index for plot
    stmt_spec = (
        select(SpectralIndex)
        .where(
            SpectralIndex.plot_id == plot_id,
            SpectralIndex.observation_date >= start_date,
            SpectralIndex.observation_date <= end_date,
        )
        .order_by(SpectralIndex.observation_date.asc())
    )
    spec_records = (await db.execute(stmt_spec)).scalars().all()
    spec_by_date = {s.observation_date: s for s in spec_records}

    # Fetch Weather Data for Estate
    weather_by_date = {}
    if estate_id:
        stmt_weather = (
            select(WeatherData)
            .where(
                WeatherData.estate_id == estate_id,
                WeatherData.observation_date >= start_date,
                WeatherData.observation_date <= end_date,
            )
            .order_by(WeatherData.observation_date.asc())
        )
        w_records = (await db.execute(stmt_weather)).scalars().all()
        weather_by_date = {w.observation_date: w for w in w_records}

    all_dates = sorted(set(spec_by_date.keys()).union(set(weather_by_date.keys())))

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["tanggal", "hst", "ndvi", "ndre", "ndwi", "savi", "bsi", "suhu_min", "suhu_max", "curah_hujan", "et0"]
    )

    for obs_date in all_dates:
        # HST
        hst_val = ""
        if plot.planting_date:
            days_diff = (obs_date - plot.planting_date).days
            hst_val = str(max(0, days_diff))

        # Satellite indices
        s = spec_by_date.get(obs_date)
        ndvi = f"{s.ndvi:.4f}" if (s and s.ndvi is not None) else ""
        ndre = f"{s.ndre:.4f}" if (s and s.ndre is not None) else ""
        ndwi = f"{s.ndwi:.4f}" if (s and s.ndwi is not None) else ""
        savi = f"{s.savi:.4f}" if (s and s.savi is not None) else ""
        bsi = f"{s.bsi:.4f}" if (s and s.bsi is not None) else ""

        # Weather
        w = weather_by_date.get(obs_date)
        tmin = f"{w.temp_min_c:.1f}" if (w and w.temp_min_c is not None) else ""
        tmax = f"{w.temp_max_c:.1f}" if (w and w.temp_max_c is not None) else ""
        rain = f"{w.rainfall_mm:.1f}" if (w and w.rainfall_mm is not None) else ""
        et0 = f"{w.et0_mm:.2f}" if (w and w.et0_mm is not None) else ""

        writer.writerow(
            [
                obs_date.isoformat(),
                hst_val,
                ndvi,
                ndre,
                ndwi,
                savi,
                bsi,
                tmin,
                tmax,
                rain,
                et0,
            ]
        )

    content = output.getvalue()
    if include_bom:
        return "\ufeff" + content
    return content


async def generate_season_comparison(
    db: AsyncSession,
    plot_id: int,
) -> Dict[str, Any]:
    """Compare performance metrics across planting seasons for a single plot."""
    from app.models.division import Division
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.planting_season import PlantingSeason
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    from app.models.weather_data import WeatherData

    stmt_plot = (
        select(Plot)
        .where(Plot.id == plot_id)
        .options(
            selectinload(Plot.division).selectinload(Division.estate),
            selectinload(Plot.variety),
            selectinload(Plot.seasons).selectinload(PlantingSeason.variety),
            selectinload(Plot.alerts),
        )
    )
    plot = (await db.execute(stmt_plot)).scalar_one_or_none()
    if not plot:
        raise ValueError(f"Petak lahan dengan ID {plot_id} tidak ditemukan.")

    seasons = sorted(plot.seasons, key=lambda s: s.planting_date, reverse=True)

    today = date.today()
    estate_id = plot.division.estate_id if (plot.division and plot.division.estate_id) else None

    # Process metrics for each planting season
    season_metrics: List[Dict[str, Any]] = []

    for s in seasons:
        end_dt = s.harvest_date or today
        duration_days = max(1, (end_dt - s.planting_date).days)

        # Spectral indices in season range
        stmt_s_spec = (
            select(SpectralIndex)
            .where(
                SpectralIndex.plot_id == plot_id,
                SpectralIndex.observation_date >= s.planting_date,
                SpectralIndex.observation_date <= end_dt,
            )
        )
        s_specs = (await db.execute(stmt_s_spec)).scalars().all()

        ndvis = [sp.ndvi for sp in s_specs if sp.ndvi is not None]
        ndres = [sp.ndre for sp in s_specs if sp.ndre is not None]
        ndwis = [sp.ndwi for sp in s_specs if sp.ndwi is not None]

        avg_ndvi = round(sum(ndvis) / len(ndvis), 3) if ndvis else None
        peak_ndvi = round(max(ndvis), 3) if ndvis else None
        avg_ndre = round(sum(ndres) / len(ndres), 3) if ndres else None
        avg_ndwi = round(sum(ndwis) / len(ndwis), 3) if ndwis else None

        # Weather & GDD in season range
        total_rain = None
        if estate_id:
            stmt_w = (
                select(func.sum(WeatherData.rainfall_mm))
                .where(
                    WeatherData.estate_id == estate_id,
                    WeatherData.observation_date >= s.planting_date,
                    WeatherData.observation_date <= end_dt,
                )
            )
            rain_sum = await db.scalar(stmt_w)
            total_rain = round(float(rain_sum), 1) if rain_sum is not None else None

        # GDD in season range
        stmt_gdd = (
            select(func.sum(GddAccumulation.gdd_daily))
            .where(
                GddAccumulation.plot_id == plot_id,
                GddAccumulation.observation_date >= s.planting_date,
                GddAccumulation.observation_date <= end_dt,
            )
        )
        gdd_sum = await db.scalar(stmt_gdd)
        total_gdd = round(float(gdd_sum), 1) if gdd_sum is not None else None

        # Alerts count during this season
        s_alerts = [
            a for a in plot.alerts
            if (a.created_at.date() >= s.planting_date and a.created_at.date() <= end_dt)
        ]

        metric = {
            "season_id": s.id,
            "plot_id": plot.id,
            "plot_name": plot.name,
            "variety_name": s.variety.name if s.variety else (plot.variety.name if plot.variety else None),
            "crop_type": plot.crop_type,
            "status": s.status,
            "planting_date": s.planting_date,
            "harvest_date": s.harvest_date,
            "duration_days": duration_days,
            "yield_ton_per_ha": s.yield_estimate_ton_per_ha,
            "avg_ndvi": avg_ndvi,
            "peak_ndvi": peak_ndvi,
            "avg_ndre": avg_ndre,
            "avg_ndwi": avg_ndwi,
            "total_rainfall_mm": total_rain,
            "total_gdd": total_gdd,
            "total_alerts": len(s_alerts),
            "notes": s.notes,
        }
        season_metrics.append(metric)

    # Separate current season (active) vs historical
    current_season = next((m for m in season_metrics if m["status"] == "active"), None)
    if not current_season and season_metrics:
        current_season = season_metrics[0]
        historical_seasons = season_metrics[1:]
    else:
        historical_seasons = [m for m in season_metrics if m["season_id"] != (current_season["season_id"] if current_season else -1)]

    # Generate agronomic comparative insights
    insights: List[str] = []
    if current_season and historical_seasons:
        prev_season = historical_seasons[0]
        # NDVI Peak comparison
        if current_season.get("peak_ndvi") and prev_season.get("peak_ndvi"):
            c_p = current_season["peak_ndvi"]
            p_p = prev_season["peak_ndvi"]
            diff_pct = round(((c_p - p_p) / p_p) * 100.0, 1)
            if diff_pct > 0:
                insights.append(f"Puncak kehijauan kanopi (NDVI {c_p:.2f}) meningkat {diff_pct:+}% dibanding musim tanam sebelumnya (NDVI {p_p:.2f}).")
            else:
                insights.append(f"Puncak kehijauan kanopi (NDVI {c_p:.2f}) mengalami penurunan {abs(diff_pct):.1f}% dibanding musim sebelumnya.")

        # Yield comparison if available
        if current_season.get("yield_ton_per_ha") and prev_season.get("yield_ton_per_ha"):
            c_y = current_season["yield_ton_per_ha"]
            p_y = prev_season["yield_ton_per_ha"]
            diff_y = round(((c_y - p_y) / p_y) * 100.0, 1)
            insights.append(f"Estimasi hasil panen ({c_y:.1f} Ton/Ha) tercatat {diff_y:+}% dibandingkan capaian musim lalu ({p_y:.1f} Ton/Ha).")

        # Rainfall comparison
        if current_season.get("total_rainfall_mm") and prev_season.get("total_rainfall_mm"):
            c_r = current_season["total_rainfall_mm"]
            p_r = prev_season["total_rainfall_mm"]
            insights.append(f"Akumulasi curah hujan musim ini tercatat {c_r:.1f} mm vs {p_r:.1f} mm pada musim sebelumnya.")

        # Alerts comparison
        c_a = current_season.get("total_alerts", 0)
        p_a = prev_season.get("total_alerts", 0)
        if c_a < p_a:
            insights.append(f"Tingkat anomali/alert lapangan berkurang dari {p_a} insiden pada musim lalu menjadi {c_a} insiden pada musim ini.")
    elif current_season:
        insights.append("Petak sedang menjalani siklus musim tanam pertama yang tercatat di sistem Tani.")
    else:
        insights.append("Belum ada data musim tanam aktif untuk petak ini.")

    return {
        "plot_id": plot.id,
        "plot_name": plot.name,
        "crop_type": plot.crop_type,
        "area_hectares": plot.area_hectares,
        "current_season": current_season,
        "historical_seasons": historical_seasons,
        "comparison_insights": insights,
    }


# =============================================================================
# 6. Scheduled Report Archive Generator & Storage Helper
# =============================================================================


async def save_report_archive(
    db: AsyncSession,
    estate_id: int,
    report_type: str,
    title: str,
    file_bytes: bytes,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> Any:
    """Save generated PDF/CSV file to storage disk and persist record in database."""
    from app.models.generated_report import GeneratedReport

    os.makedirs(STORAGE_DIR, exist_ok=True)

    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    ext = "pdf" if report_type != "timeseries_csv" else "csv"
    file_name = f"Laporan_{report_type.capitalize()}_Estate_{estate_id}_{timestamp_str}.{ext}"
    file_path = os.path.join(STORAGE_DIR, file_name)

    # Write file to disk
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    report_record = GeneratedReport(
        estate_id=estate_id,
        report_type=report_type,
        title=title,
        file_name=file_name,
        file_path=file_path,
        file_size_bytes=len(file_bytes),
        period_start=period_start,
        period_end=period_end,
    )
    db.add(report_record)
    await db.commit()
    await db.refresh(report_record)
    return report_record


async def generate_and_save_weekly_reports(db: AsyncSession) -> Dict[str, Any]:
    """Scheduled job runner: generate weekly health & water reports for all estates."""
    from app.models.estate import Estate

    stmt = select(Estate).order_by(Estate.name.asc())
    estates = (await db.execute(stmt)).scalars().all()

    today = date.today()
    start_date = today - timedelta(days=7)
    generated_count = 0

    for est in estates:
        try:
            # 1. Weekly Health Report
            health_pdf = await generate_health_report(
                db, est.id, start_date=start_date, end_date=today
            )
            await save_report_archive(
                db,
                estate_id=est.id,
                report_type="health",
                title=f"Laporan Kesehatan Lahan Mingguan — {est.name}",
                file_bytes=health_pdf,
                period_start=start_date,
                period_end=today,
            )
            generated_count += 1

            # 2. Weekly Water Usage Report
            water_pdf = await generate_water_usage_report(
                db, est.id, start_date=start_date, end_date=today
            )
            await save_report_archive(
                db,
                estate_id=est.id,
                report_type="water_usage",
                title=f"Laporan Kebutuhan Air Mingguan — {est.name}",
                file_bytes=water_pdf,
                period_start=start_date,
                period_end=today,
            )
            generated_count += 1
            logger.info("Generated automated weekly reports for estate %s (ID %d)", est.name, est.id)

        except Exception as exc:
            logger.error("Failed to generate weekly report for estate ID %d: %s", est.id, str(exc), exc_info=True)

    return {
        "status": "success",
        "estates_processed": len(estates),
        "reports_created": generated_count,
        "period": f"{start_date.isoformat()} to {today.isoformat()}",
    }
