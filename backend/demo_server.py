"""
Standalone Local Mock API Server for TANDUR Precision Agriculture SaaS.
Integrated with Bengkoxxx1.kml spatial dataset for real Pacitan farm telemetry.
Runs on http://localhost:8000.
"""

import csv
from datetime import date, datetime, timedelta, timezone
import html
import http.server
import io
import json
import logging
import os
import re
import sys
import urllib.parse

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("demo_server")

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Import Digital Agronomy Engine Services (DAG-07 & DAG-08)
try:
    from app.services.soilgrids_service import get_soil_characteristics
    from app.services.elevation_service import get_bengkok_1_elevation_profile, calculate_terrain_metrics
    from app.services.planting_window_service import simulate_planting_window
    from app.services.hydrology_service import get_terrace_hydrology, hydrology_service
    from app.services.sar_service import get_sar_backscatter_telemetry
    from app.services.vrn_service import calculate_vrn_prescription
    from app.utils.drone_kml_generator import generate_drone_mission_kml
    HAS_AGRONOMY = True
    logger.info("AGRONOMY: Successfully imported all Digital Agronomy modules.")
except Exception as _agro_err:
    logger.warning(f"Digital Agronomy modules import issue: {_agro_err}")
    HAS_AGRONOMY = False

# Try to import ReportLab
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    HAS_REPORTLAB = True
except Exception as e:
    logger.warning(f"ReportLab not available: {e}")
    HAS_REPORTLAB = False

PORT = 8000

# =====================================================================
# BENGKOXXX1.KML REAL GEOMETRY DATASET
# =====================================================================

BENGKOK_COORDINATES = [
    [111.0632475, -8.0841799],
    [111.0632340, -8.0842242],
    [111.0632402, -8.0842685],
    [111.0632726, -8.0843325],
    [111.0633705, -8.0843500],
    [111.0634159, -8.0843384],
    [111.0634699, -8.0843861],
    [111.0635063, -8.0844383],
    [111.0635559, -8.0844782],
    [111.0635870, -8.0845081],
    [111.0636082, -8.0845603],
    [111.0636878, -8.0845655],
    [111.0637463, -8.0845530],
    [111.0638206, -8.0844833],
    [111.0638406, -8.0844343],
    [111.0638884, -8.0843512],
    [111.0640268, -8.0842306],
    [111.0640465, -8.0841431],
    [111.0640695, -8.0840409],
    [111.0640333, -8.0839697],
    [111.0637347, -8.0840335],
    [111.0634638, -8.0840518],
    [111.0633133, -8.0840826],
    [111.0632475, -8.0841799],
]

# Load real Google Earth Engine telemetry for Bengkok 1
REAL_GEE_DATA = None
try:
    gee_json_path = os.path.join(os.path.dirname(__file__), "real_gee_telemetry.json")
    if os.path.exists(gee_json_path):
        with open(gee_json_path, "r", encoding="utf-8") as f:
            REAL_GEE_DATA = json.load(f)
            logger.info("LIVE GEE: Successfully loaded real Sentinel-2 and Sentinel-1 telemetry for Bengkok 1")
except Exception as _gee_err:
    logger.warning("Could not load real_gee_telemetry.json: %s", _gee_err)

# =====================================================================
# IN-MEMORY SEED DATASETS
# =====================================================================

COMPANIES = [
    {
        "id": 1,
        "name": "PT Agro Cerdas Nusantara",
        "address": "Jl. Ir. H. Djuanda No. 369, Bandung, Jawa Barat",
        "estate_count": 1,
        "division_count": 1,
        "petak_count": 1,
        "created_at": "2026-01-01T00:00:00Z",
    },
]

ESTATES = [
    {
        "id": 1,
        "company_id": 1,
        "company_name": "PT Agro Cerdas Nusantara",
        "name": "Kebun Bengkok (Pacitan)",
        "province": "Jawa Timur",
        "kabupaten": "Pacitan",
        "latitude": -8.0843,
        "longitude": 111.0636,
        "division_count": 1,
        "petak_count": 1,
        "created_at": "2026-01-15T08:00:00Z",
    },
]

DIVISIONS = [
    {
        "id": 1,
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "company_id": 1,
        "company_name": "PT Agro Cerdas Nusantara",
        "name": "Divisi Bengkok Utama",
        "petak_count": 1,
        "created_at": "2026-01-15T08:30:00Z",
    },
]

VARIETIES = [
    {
        "id": 1,
        "crop_type": "padi",
        "name": "Inpari 32 HDB",
        "cycle_days": 120,
        "t_base": 10.0,
        "created_at": "2026-01-01T00:00:00Z",
        "phases": [
            {"id": 1, "variety_id": 1, "phase_code": "VEG-1", "phase_name": "Vegetatif Awal", "hst_start": 0, "hst_end": 20, "ndvi_expected_min": 0.20, "ndvi_expected_max": 0.45, "ndre_threshold": 0.22, "kc_value": 1.05, "gdd_target": 350.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 2, "variety_id": 1, "phase_code": "VEG-2", "phase_name": "Vegetatif Aktif", "hst_start": 21, "hst_end": 40, "ndvi_expected_min": 0.45, "ndvi_expected_max": 0.75, "ndre_threshold": 0.32, "kc_value": 1.15, "gdd_target": 650.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 3, "variety_id": 1, "phase_code": "INI-M", "phase_name": "Inisiasi Malai", "hst_start": 41, "hst_end": 55, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.75, "ndre_threshold": 0.35, "kc_value": 1.20, "gdd_target": 850.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 4, "variety_id": 1, "phase_code": "BOOT", "phase_name": "Bunting (Booting)", "hst_start": 56, "hst_end": 70, "ndvi_expected_min": 0.70, "ndvi_expected_max": 0.88, "ndre_threshold": 0.40, "kc_value": 1.25, "gdd_target": 1050.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 5, "variety_id": 1, "phase_code": "HEAD", "phase_name": "Berbunga (Heading)", "hst_start": 71, "hst_end": 85, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.42, "kc_value": 1.20, "gdd_target": 1250.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 6, "variety_id": 1, "phase_code": "GRAIN", "phase_name": "Pengisian Bulir", "hst_start": 86, "hst_end": 105, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.75, "ndre_threshold": 0.35, "kc_value": 1.05, "gdd_target": 1600.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 7, "variety_id": 1, "phase_code": "MATUR", "phase_name": "Masak Fisiologis", "hst_start": 106, "hst_end": 120, "ndvi_expected_min": 0.30, "ndvi_expected_max": 0.50, "ndre_threshold": 0.25, "kc_value": 0.90, "gdd_target": 1950.0, "created_at": "2026-01-01T00:00:00Z"},
        ],
    },
    {
        "id": 2,
        "crop_type": "jagung",
        "name": "Pioneer P35",
        "cycle_days": 105,
        "t_base": 10.0,
        "created_at": "2026-01-01T00:00:00Z",
        "phases": [
            {"id": 6, "variety_id": 2, "phase_code": "VEG_AWAL", "phase_name": "Vegetatif (V3-V6)", "hst_start": 0, "hst_end": 30, "ndvi_expected_min": 0.20, "ndvi_expected_max": 0.50, "ndre_threshold": 0.25, "kc_value": 0.70, "gdd_target": 400.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 7, "variety_id": 2, "phase_code": "VEG_LANJUT", "phase_name": "Vegetatif Lanjut (V12-VT)", "hst_start": 31, "hst_end": 55, "ndvi_expected_min": 0.50, "ndvi_expected_max": 0.82, "ndre_threshold": 0.35, "kc_value": 1.15, "gdd_target": 850.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 8, "variety_id": 2, "phase_code": "REPRODUKTIF", "phase_name": "Silking & Blister (R1-R2)", "hst_start": 56, "hst_end": 75, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.40, "kc_value": 1.20, "gdd_target": 1250.0, "created_at": "2026-01-01T00:00:00Z"},
            {"id": 9, "variety_id": 2, "phase_code": "PEMATANGAN", "phase_name": "Dent & Black Layer (R5-R6)", "hst_start": 76, "hst_end": 105, "ndvi_expected_min": 0.35, "ndvi_expected_max": 0.65, "ndre_threshold": 0.25, "kc_value": 0.60, "gdd_target": 1650.0, "created_at": "2026-01-01T00:00:00Z"},
        ],
    },
]

PLOTS = [
    {
        "id": 1,
        "division_id": 1,
        "division_name": "Divisi Bengkok Utama",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "company_id": 1,
        "company_name": "PT Agro Cerdas Nusantara",
        "variety_id": None,
        "variety_name": "-",
        "name": "Bengkok 1 (KML Utama)",
        "crop_type": "padi",
        "area_hectares": 0.37,
        "planting_date": None,
        "status": "Bera / Belum Ditanami",
        "current_hst": 0,
        "current_phase": "Bera",
        "latest_ndvi": 0.2716,
        "latest_ndre": 0.1783,
        "latest_ndwi": -0.1352,
        "latest_savi": 0.2105,
        "latest_bsi": 0.1951,
        "sar_vv_db": -10.67,
        "sar_vh_db": -20.22,
        "ndvi_status": "Bera / Lahan Terbuka (Bare Soil)",
        "active_alert_count": 0,
        "created_at": "2026-06-15T06:00:00Z",
        "polygon": {
            "type": "Polygon",
            "coordinates": [BENGKOK_COORDINATES],
        },
    },
]

SEASONS = [
    {
        "id": 1,
        "plot_id": 1,
        "variety_id": 1,
        "variety_name": "Inpari 32 HDB",
        "crop_type": "padi",
        "planting_date": "2026-01-10",
        "harvest_date": "2026-05-15",
        "status": "harvested",
        "yield_estimate_ton_per_ha": 6.4,
        "notes": "Musim Rendengan sebelumnya (telah dipanen). Saat ini lahan sedang dalam fase bera / persiapan tanam.",
        "created_at": "2026-01-10T07:00:00Z",
    },
]

ALERTS = [
    {
        "id": 101,
        "plot_id": 1,
        "plot_name": "Bengkok 1 (KML Utama)",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "crop_type": "padi",
        "alert_type": "pest_anomaly",
        "severity": "merah",
        "title": "CRITICAL: Indikasi Serangan Penggerek Batang (Sundep/Beluk)",
        "description": "Laporan pengamatan lapangan mendeteksi gejala sundep pada anakan padi dengan intensitas serangan berat di sektor barat petak.",
        "recommendation": "Terapkan isolasi karantina radius 50m. Aplikasi insektisida sistemik sesuai rekomendasi POPT dan pantau ambang kendali.",
        "trigger_values": {"pest_type": "penggerek_batang", "severity": "berat", "quarantine_radius_m": 50},
        "is_read": False,
        "is_resolved": False,
        "created_at": "2026-09-06T14:30:00Z",
        "resolved_at": None,
    },
    {
        "id": 102,
        "plot_id": 1,
        "plot_name": "Bengkok 1 (KML Utama)",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "crop_type": "padi",
        "alert_type": "water_stress",
        "severity": "oranye",
        "title": "WARNING: Cekaman Air Defisit Lengas Tanah 42%",
        "description": "Kadar lengas tanah berada di bawah ambang kapasitas lapang kritis akibat ketiadaan presipitasi selama 7 hari berturut-turut.",
        "recommendation": "Jadwalkan pemompaan irigasi berselang (intermittent irrigation) minimal 4 jam untuk mengembalikan kelengasan tanah.",
        "trigger_values": {"soil_moisture_pct": 18.5, "deficit_pct": 42.0, "et0_mm": 4.82},
        "is_read": False,
        "is_resolved": False,
        "created_at": "2026-09-05T08:15:00Z",
        "resolved_at": None,
    },
    {
        "id": 103,
        "plot_id": 1,
        "plot_name": "Bengkok 1 (KML Utama)",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "crop_type": "padi",
        "alert_type": "nitrogen_stress",
        "severity": "kuning",
        "title": "WARNING: Defisiensi Nitrogen Kanopi (NDRE Turun)",
        "description": "Indeks Red-Edge (NDRE: 0.178) mengindikasikan penurunan konsentrasi klorofil kanopi tanaman pada fase vegetatif aktif.",
        "recommendation": "Lakukan pemupukan susulan Urea Petro (35 kg/ha) atau NPK Phonska Plus dengan metode sebar merata.",
        "trigger_values": {"ndre": 0.178, "ndvi": 0.271, "chlorophyll_deficit": "medium"},
        "is_read": False,
        "is_resolved": False,
        "created_at": "2026-09-04T11:20:00Z",
        "resolved_at": None,
    },
    {
        "id": 104,
        "plot_id": 1,
        "plot_name": "Bengkok 1 (KML Utama)",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "crop_type": "padi",
        "alert_type": "harvest_ready",
        "severity": "hijau_tua",
        "title": "INFO: Fase Masak Fisiologis Tercapai (Akumulasi GDD > 1600)",
        "description": "Akumulasi unit termal GDD telah melampaui 1600 °C-hari, bulir menguning > 90% dan kadar air gabah berkisar 21-24%.",
        "recommendation": "Siapkan jadwal pemanenan combine harvester dan koordinasikan logistik pengeringan gabah KA 14% SNI.",
        "trigger_values": {"gdd_cumulative": 1650.0, "yellowing_pct": 92.0},
        "is_read": True,
        "is_resolved": True,
        "created_at": "2026-09-02T07:00:00Z",
        "resolved_at": "2026-09-03T10:00:00Z",
    },
    {
        "id": 100,
        "plot_id": 1,
        "plot_name": "Bengkok 1 (KML Utama)",
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "crop_type": "padi",
        "alert_type": "fallow_land",
        "severity": "biru",
        "title": "INFO: Status Lahan Bera / Persiapan Olah Tanah",
        "description": "Telemetri satelit Sentinel-2 & Sentinel-1 via Google Earth Engine mencatat NDVI 0.2716 dan BSI 0.1951. Petak dalam kondisi terbuka tanpa tanaman aktif.",
        "recommendation": "Lakukan persiapan pengolahan tanah (tillage) dan daftarkan musim tanam baru saat bibit mulai ditanam.",
        "trigger_values": {"ndvi": 0.2716, "ndwi": -0.1352, "bsi": 0.1951, "source": "Google Earth Engine Live"},
        "is_read": False,
        "is_resolved": False,
        "created_at": "2026-09-04T10:00:00Z",
        "resolved_at": None,
    },
]

REPORTS_HISTORY = [
    {
        "id": 1,
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "report_type": "health",
        "title": "Laporan Status Lahan & Indeks Spektral Petak Bengkok 1",
        "file_name": "Laporan_Status_Lahan_Bengkok_1.pdf",
        "file_size_bytes": 148200,
        "period_start": "2026-08-25",
        "period_end": "2026-09-04",
        "created_at": "2026-09-04T18:00:00Z",
        "download_url": "/api/reports/download/1",
    },
    {
        "id": 2,
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "report_type": "harvest_prediction",
        "title": "Status Kalender Tanam & Rencana Musim Baru (Pacitan)",
        "file_name": "Rencana_Musim_Tanam_Bengkok_1.pdf",
        "file_size_bytes": 112450,
        "period_start": "2026-09-01",
        "period_end": "2026-09-30",
        "created_at": "2026-09-01T08:00:00Z",
        "download_url": "/api/reports/download/2",
    },
    {
        "id": 3,
        "estate_id": 1,
        "estate_name": "Kebun Bengkok (Pacitan)",
        "report_type": "water_usage",
        "title": "Analisis Agroklimat & Neraca Air Pra-Tanam (FAO-56)",
        "file_name": "Laporan_Neraca_Air_Bengkok_1.pdf",
        "file_size_bytes": 189300,
        "period_start": "2026-08-01",
        "period_end": "2026-08-31",
        "created_at": "2026-09-01T09:30:00Z",
        "download_url": "/api/reports/download/3",
    },
]

# =====================================================================
# PRECISION OPERATIONS IN-MEMORY DATASETS (OPS-01 / OPS-02)
# =====================================================================

SAPROTAN_ITEMS = [
    {
        "id": 1,
        "name": "Virtako 300 SC",
        "category": "pestisida",
        "active_ingredient": "Klorantraniliprol 100 g/l + Tiametoksam 200 g/l",
        "phi_days": 14,
        "unit": "liter",
        "unit_cost": 215000.0,
        "stock_qty": 12.0,
    },
    {
        "id": 2,
        "name": "Urea Petro",
        "category": "pupuk_makro",
        "active_ingredient": "Nitrogen 46%",
        "phi_days": 0,
        "unit": "kg",
        "unit_cost": 6500.0,
        "stock_qty": 250.0,
    },
    {
        "id": 3,
        "name": "NPK Phonska Plus",
        "category": "pupuk_makro",
        "active_ingredient": "N 15% - P2O5 15% - K2O 15% + S 9% + Zn 2000ppm",
        "phi_days": 0,
        "unit": "kg",
        "unit_cost": 8500.0,
        "stock_qty": 300.0,
    },
    {
        "id": 4,
        "name": "Score 250 EC",
        "category": "pestisida",
        "active_ingredient": "Difenokonazol 250 g/l",
        "phi_days": 21,
        "unit": "liter",
        "unit_cost": 175000.0,
        "stock_qty": 8.0,
    },
    {
        "id": 5,
        "name": "Benih Inpari 32 HDB Bersertifikat",
        "category": "benih",
        "active_ingredient": "Varietas Unggul Bersertifikat",
        "phi_days": 0,
        "unit": "kg",
        "unit_cost": 16000.0,
        "stock_qty": 50.0,
    },
]

LABOR_LOGS = [
    {
        "id": 1,
        "plot_id": 1,
        "activity_date": "2026-08-28",
        "task_type": "olah_tanah",
        "labor_count": 2,
        "hours_worked": 8.0,
        "wage_rate_per_day": 120000.0,
        "is_contract": False,
        "total_cost": 240000.0,
        "notes": "Olah Tanah I (Bajak Singkal Traktor)",
        "created_at": "2026-08-28T17:00:00Z",
    },
    {
        "id": 2,
        "plot_id": 1,
        "activity_date": "2026-09-01",
        "task_type": "perbaikan_galengan",
        "labor_count": 3,
        "hours_worked": 8.0,
        "wage_rate_per_day": 90000.0,
        "is_contract": False,
        "total_cost": 270000.0,
        "notes": "Perbaikan Galengan & Pematang Terasiring",
        "created_at": "2026-09-01T17:00:00Z",
    },
    {
        "id": 3,
        "plot_id": 1,
        "activity_date": "2026-09-04",
        "task_type": "pelumpuran",
        "labor_count": 2,
        "hours_worked": 8.0,
        "wage_rate_per_day": 120000.0,
        "is_contract": False,
        "total_cost": 240000.0,
        "notes": "Pelumpuran (Puddling) & Perataan Tanah II",
        "created_at": "2026-09-04T17:00:00Z",
    },
]

IRRIGATION_LOGS = [
    {
        "id": 1,
        "plot_id": 1,
        "water_source": "pompa_diesel",
        "water_volume_m3": 120.0,
        "pump_duration_hours": 4.5,
        "fuel_liters": 9.0,
        "fuel_cost": 135000.0,
        "started_at": "2026-08-22T06:30:00Z",
        "ended_at": "2026-08-22T11:00:00Z",
        "created_at": "2026-08-22T11:30:00Z",
    },
    {
        "id": 2,
        "plot_id": 1,
        "water_source": "irigasi_tersier",
        "water_volume_m3": 200.0,
        "pump_duration_hours": 0.0,
        "fuel_liters": 0.0,
        "fuel_cost": 0.0,
        "started_at": "2026-08-30T07:00:00Z",
        "ended_at": "2026-08-30T17:00:00Z",
        "created_at": "2026-08-30T17:30:00Z",
    },
]

SAPROTAN_APPLICATIONS = [
    {
        "id": 1,
        "plot_id": 1,
        "item_id": 2,
        "item_name": "Urea Petro",
        "category": "pupuk_makro",
        "application_date": "2026-08-28",
        "quantity_used": 35.0,
        "unit": "kg",
        "unit_cost": 6500.0,
        "total_cost": 227500.0,
        "created_at": "2026-08-28T10:00:00Z",
    },
    {
        "id": 2,
        "plot_id": 1,
        "item_id": 3,
        "item_name": "NPK Phonska Plus",
        "category": "pupuk_makro",
        "application_date": "2026-08-28",
        "quantity_used": 40.0,
        "unit": "kg",
        "unit_cost": 8500.0,
        "total_cost": 340000.0,
        "created_at": "2026-08-28T10:30:00Z",
    },
]

PEST_SCOUTING_REPORTS = [
    {
        "id": 1,
        "plot_id": 1,
        "observation_date": "2026-09-04T09:15:00Z",
        "pest_type": "wereng_coklat",
        "severity": "sedang",
        "latitude": -8.08425,
        "longitude": 111.06345,
        "photo_url": None,
        "action_taken": "Pemasangan likat kuning dan pengeringan berkala",
        "created_at": "2026-09-04T09:30:00Z",
    },
    {
        "id": 2,
        "plot_id": 1,
        "observation_date": "2026-09-06T14:30:00Z",
        "pest_type": "penggerek_batang",
        "severity": "berat",
        "latitude": -8.08440,
        "longitude": 111.06375,
        "photo_url": None,
        "action_taken": "Deteksi sundep/beluk aktif. Rekomendasi karantina 50m & sanitasi petak",
        "created_at": "2026-09-06T15:00:00Z",
    },
]

POST_HARVEST_LOGS = []

CURRENT_USER = {
    "id": 1,
    "email": "admin@tani.ag",
    "name": "Dr. Ir. Agronom Tani",
    "role": "superadmin",
    "company_id": 1,
    "created_at": "2026-01-01T00:00:00Z",
}


def generate_pdf_document(title: str, subtitle: str, table_rows: list, recommendation: str = None) -> bytes:
    """Generates a styled agricultural PDF using ReportLab or fallback."""
    if not HAS_REPORTLAB:
        stream = (
            b"%PDF-1.4\n"
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj\n"
            b"4 0 obj << /Length 50 >> stream\n"
            b"BT /F1 12 Tf 50 750 Td (TANDUR Precision Agriculture Report) Tj ET\n"
            b"endstream\nendobj\n"
            b"xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
            b"0000000115 00000 n \n0000000214 00000 n \ntrailer << /Size 5 /Root 1 0 R >>\n"
            b"startxref\n314\n%%EOF\n"
        )
        return stream

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b><font size=16 color='#1b4332'>{html.escape(title)}</font></b>", styles["Title"]))
    story.append(Paragraph(f"<font size=10 color='#4a5568'>{html.escape(subtitle)}</font>", styles["Normal"]))
    story.append(Spacer(1, 15))

    if table_rows:
        th_style = ParagraphStyle(
            "TH_Style_Custom",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.whitesmoke,
            alignment=1,
        )
        td_style = ParagraphStyle(
            "TD_Style_Custom",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1e293b"),
            alignment=0,
        )
        formatted_rows = []
        for r_idx, row in enumerate(table_rows):
            f_row = []
            for col_val in row:
                st = th_style if r_idx == 0 else td_style
                f_row.append(Paragraph(html.escape(str(col_val)), st))
            formatted_rows.append(f_row)

        t = Table(formatted_rows)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1b4332')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d8d8d8')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#ffffff'), colors.HexColor('#f8fafc')]),
        ]))
        story.append(t)

    if recommendation:
        story.append(Spacer(1, 15))
        story.append(Paragraph("<b><font size=11 color='#1b4332'>Rekomendasi Agronomi & Arahan Olah Tanah:</font></b>", styles["Normal"]))
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<font size=9 color='#2d3748'>{html.escape(recommendation)}</font>", styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()


def generate_timeseries_csv(estate_id: int = 1, start_date: str = None, end_date: str = None, include_cost: bool = True) -> bytes:
    """Generates standard CSV with UTF-8 BOM reflecting Bengkok 1 telemetry and operational cost logs."""
    output = io.StringIO()
    output.write("\ufeff")  # BOM for Excel
    writer = csv.writer(output)
    headers = [
        "Tanggal", "Plot_ID", "Nama_Petak", "Status_Lahan", "Varietas", "HST",
        "Fase", "NDVI", "NDRE", "NDWI", "SAVI", "BSI", "SAR_VV_dB", "SAR_VH_dB", "ET0_fao56_mm", "ETc_mm", "Curah_Hujan_mm", "Suhu_Max_C"
    ]
    if include_cost:
        headers.extend([
            "Biaya_Tenaga_Kerja_Rp", "Biaya_Saprotan_Rp", "Biaya_BBM_Irigasi_Rp", "Total_Biaya_Operasional_Rp"
        ])
    writer.writerow(headers)

    today = date.today()
    try:
        e_date = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
    except Exception:
        e_date = today
    try:
        s_date = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else (e_date - timedelta(days=14))
    except Exception:
        s_date = e_date - timedelta(days=14)

    if s_date > e_date:
        s_date, e_date = e_date, s_date

    delta_days = min(max((e_date - s_date).days, 0), 180)
    obs_list = REAL_GEE_DATA.get("sentinel_2_observations", []) if REAL_GEE_DATA else []
    for i in range(delta_days, -1, -1):
        d = e_date - timedelta(days=i)
        d_str = d.isoformat()
        matched_obs = next((o for o in obs_list if o.get("date") == d_str), None)
        ndvi = matched_obs["ndvi"] if matched_obs else round(0.2716 + ((i % 10) * 0.001), 4)
        ndre = matched_obs["ndre"] if matched_obs else 0.1783
        ndwi = matched_obs["ndwi"] if matched_obs else -0.1352
        savi = matched_obs["savi"] if matched_obs else 0.2105
        bsi = matched_obs["bsi"] if matched_obs else 0.1951

        row = [
            d_str,
            1,
            "Bengkok 1 (KML Utama)",
            "Belum Ditanami (Bera)",
            "-",
            0,
            "Bera / Lahan Terbuka",
            ndvi,
            ndre,
            ndwi,
            savi,
            bsi,
            -10.67,
            -20.22,
            4.65,
            0.00,
            5.2 if i % 4 == 0 else 0.0,
            31.8,
        ]
        if include_cost:
            labor_cost = sum(l.get("total_wage", 0) for l in LABOR_LOGS if l.get("log_date") == d_str)
            sap_cost = sum(s.get("total_cost", 0) for s in SAPROTAN_APPLICATIONS if s.get("application_date") == d_str)
            irr_cost = sum(r.get("fuel_cost", 0) for r in IRRIGATION_LOGS if r.get("log_date") == d_str)
            total_cost = labor_cost + sap_cost + irr_cost
            row.extend([labor_cost, sap_cost, irr_cost, total_cost])

        writer.writerow(row)
    return output.getvalue().encode("utf-8")


def get_estate_dashboard_data(eid: int):
    estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
    estate_plots = [p for p in PLOTS if p["estate_id"] == eid] or PLOTS
    total_ha = sum(p["area_hectares"] for p in estate_plots)
    avg_ndvi = sum(p["latest_ndvi"] for p in estate_plots) / len(estate_plots) if estate_plots else 0.27

    return {
        "estate_id": estate["id"],
        "estate_name": estate["name"],
        "total_plots": len(estate_plots),
        "total_area_ha": round(total_ha, 2),
        "avg_ndvi": round(avg_ndvi, 2),
        "plots_needing_attention": sum(1 for p in estate_plots if p["active_alert_count"] > 0),
        "plots": estate_plots,
    }


def get_current_weather_data(eid: int):
    estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
    today = date.today()
    return {
        "estate_id": estate["id"],
        "estate_name": estate["name"],
        "observation_date": today.isoformat(),
        "is_forecast": False,
        "temp_max_c": 32.5,
        "temp_min_c": 23.8,
        "temp_mean_c": 28.2,
        "humidity_pct": 74.0,
        "wind_speed_ms": 2.3,
        "solar_radiation_mjm2": 19.4,
        "rainfall_mm": 0.0,
        "et0_mm": 4.82,
        "condition_text": "Cerah Berawan",
        "weather_record": {
            "id": 999,
            "estate_id": estate["id"],
            "observation_date": today.isoformat(),
            "temp_max_c": 32.5,
            "temp_min_c": 23.8,
            "humidity_pct": 74.0,
            "wind_speed_ms": 2.3,
            "solar_radiation_mjm2": 19.4,
            "rainfall_mm": 0.0,
            "et0_mm": 4.82,
            "is_forecast": False,
        },
    }


def get_weather_forecast_data(eid: int):
    estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
    today = date.today()
    items = []
    for i in range(16):
        f_date = today + timedelta(days=i)
        items.append({
            "id": 600 + i,
            "estate_id": estate["id"],
            "observation_date": f_date.isoformat(),
            "temp_min_c": 23.0 + (i % 2),
            "temp_max_c": 31.5 + (i % 3),
            "humidity_pct": 75.0,
            "rainfall_mm": 4.5 if i in (2, 5, 9, 13) else 0.0,
            "et0_mm": round(4.60 + (i % 3) * 0.15, 2),
            "solar_radiation_mjm2": 18.0,
            "wind_speed_ms": 2.0,
            "is_forecast": True,
        })
    return {
        "estate_id": estate["id"],
        "estate_name": estate["name"],
        "total_days": len(items),
        "items": items,
    }


class DemoAPIHandler(http.server.BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type")

    def _json_resp(self, data, status=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    def _binary_resp(self, content_bytes: bytes, content_type: str, filename: str = None, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content_bytes)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self._send_cors()
        self.end_headers()
        self.wfile.write(content_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    # =================================================================
    # GET HANDLERS
    # =================================================================
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        query = urllib.parse.parse_qs(parsed.query)

        logger.info(f"GET {path} | Query: {query}")

        # 1. Health check
        if path in ("/health", "/api/health", "/api/v1/health"):
            return self._json_resp({"status": "ok", "database": "connected"})

        # 2. Current User
        if path in ("/api/auth/me", "/api/v1/auth/me"):
            return self._json_resp(CURRENT_USER)

        # 3. Companies List
        if path in ("/api/companies", "/api/v1/companies"):
            return self._json_resp(COMPANIES)

        # 4. Single Company Detail
        m_comp = re.match(r"^/api/(?:v1/)?companies/(\d+)$", path)
        if m_comp:
            cid = int(m_comp.group(1))
            c = next((comp for comp in COMPANIES if comp["id"] == cid), COMPANIES[0])
            c_data = dict(c)
            c_data["estates"] = [e for e in ESTATES if e["company_id"] == cid]
            return self._json_resp(c_data)

        # 5. Estates List
        if path in ("/api/estates", "/api/v1/estates"):
            company_id = int(query["company_id"][0]) if "company_id" in query else None
            res = [e for e in ESTATES if not company_id or e["company_id"] == company_id]
            return self._json_resp(res)

        # 6. Estate Dashboard Summary (matches /estates/:id/dashboard and /estates/:id/dashboard-summary)
        m_dash = re.match(r"^/api/(?:v1/)?estates/(\d+)/dashboard(?:-summary)?$", path)
        if m_dash:
            eid = int(m_dash.group(1))
            return self._json_resp(get_estate_dashboard_data(eid))

        # 7. Estate Weather Current
        m_ew_curr = re.match(r"^/api/(?:v1/)?estates/(\d+)/weather/current$", path)
        if m_ew_curr:
            eid = int(m_ew_curr.group(1))
            return self._json_resp(get_current_weather_data(eid))

        # 8. Estate Weather Forecast
        m_ew_fore = re.match(r"^/api/(?:v1/)?estates/(\d+)/weather/forecast$", path)
        if m_ew_fore:
            eid = int(m_ew_fore.group(1))
            return self._json_resp(get_weather_forecast_data(eid))

        # 9. Estate Satellite Tile Overlay
        m_etile = re.match(r"^/api/(?:v1/)?estates/(\d+)/satellite-tile$", path)
        if m_etile:
            tile_url = (
                REAL_GEE_DATA.get("tile_url")
                if REAL_GEE_DATA and REAL_GEE_DATA.get("tile_url")
                else "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            )
            return self._json_resp({
                "tile_url": tile_url,
                "vis_type": "true_color",
                "observation_date": "2026-09-04",
                "attribution": "Google Earth Engine - Copernicus Sentinel-2 L2A (Live Pacitan)",
                "bands": ["B4", "B3", "B2"],
                "min_val": 0.0,
                "max_val": 0.25,
                "label": "Sentinel-2 True Color (Google Earth Engine Live)",
            })

        # 10. Estate Plots List
        m_eplots = re.match(r"^/api/(?:v1/)?estates/(\d+)/plots$", path)
        if m_eplots:
            eid = int(m_eplots.group(1))
            res = [p for p in PLOTS if p["estate_id"] == eid]
            return self._json_resp(res)

        # 11. Estate Plots Summary
        m_psummary = re.match(r"^/api/(?:v1/)?estates/(\d+)/plots/summary$", path)
        if m_psummary:
            eid = int(m_psummary.group(1))
            eplots = [p for p in PLOTS if p["estate_id"] == eid] or PLOTS
            padi_plots = [p for p in eplots if p["crop_type"] == "padi"]
            return self._json_resp({
                "total_plots": len(eplots),
                "total_area_hectares": round(sum(p["area_hectares"] for p in eplots), 2),
                "padi_plots": len(padi_plots),
                "padi_area_hectares": round(sum(p["area_hectares"] for p in padi_plots), 2),
                "jagung_plots": 0,
                "jagung_area_hectares": 0.0,
                "phases_summary": {"Bera": 1},
            })

        # 12. Estate Indices Timeline (Slider Tanggal Observasi Satelit Riil GEE)
        m_timeline = re.match(r"^/api/(?:v1/)?estates/(\d+)/indices-timeline$", path)
        if m_timeline:
            eid = int(m_timeline.group(1))
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            if REAL_GEE_DATA and REAL_GEE_DATA.get("sentinel_2_observations"):
                obs_list = REAL_GEE_DATA["sentinel_2_observations"]
                seen_dates = []
                date_ndvi_map = {}
                for obs in reversed(obs_list):
                    d = obs["date"]
                    if d not in seen_dates:
                        seen_dates.append(d)
                        date_ndvi_map[d] = obs["ndvi"]
                dates = seen_dates[-6:]
                timeline = {}
                for d in dates:
                    b1_val = date_ndvi_map.get(d, 0.27)
                    timeline[d] = {
                        "1": round(b1_val, 2),
                    }
            else:
                today = date.today()
                dates = [(today - timedelta(days=i * 5)).isoformat() for i in range(5, -1, -1)]
                timeline = {d: {"1": 0.27} for d in dates}

            return self._json_resp({
                "estate_id": estate["id"],
                "estate_name": estate["name"],
                "dates": dates,
                "timeline": timeline,
            })

        # 13. Single Estate Detail
        m_estate = re.match(r"^/api/(?:v1/)?estates/(\d+)$", path)
        if m_estate:
            eid = int(m_estate.group(1))
            estate = next((e for e in ESTATES if e["id"] == eid), None)
            if estate:
                res = dict(estate)
                res["divisions"] = [d for d in DIVISIONS if d["estate_id"] == eid]
                return self._json_resp(res)
            return self._json_resp({"detail": "Estate tidak ditemukan"}, 404)

        # 14. Estate Divisions
        m_divs = re.match(r"^/api/(?:v1/)?estates/(\d+)/divisions$", path)
        if m_divs:
            eid = int(m_divs.group(1))
            res = [d for d in DIVISIONS if d["estate_id"] == eid]
            return self._json_resp(res)

        # 15. Satellite Tile Info general
        if path.startswith("/api/satellite/tile-info") or path.startswith("/api/v1/satellite/tile-info"):
            return self._json_resp({
                "tile_url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                "vis_type": "true_color",
                "observation_date": date.today().isoformat(),
                "attribution": "Sentinel-2 L2A Harmonized / ESA",
                "bands": ["B4", "B3", "B2"],
                "min_val": 0.0,
                "max_val": 0.3,
                "label": "Sentinel-2 True Color (RGB)",
            })

        # 16. Divisions list
        if path in ("/api/divisions", "/api/v1/divisions"):
            estate_id = int(query["estate_id"][0]) if "estate_id" in query else None
            res = [d for d in DIVISIONS if not estate_id or d["estate_id"] == estate_id]
            return self._json_resp(res)

        # 17. Varieties list
        if path in ("/api/varieties", "/api/v1/varieties"):
            return self._json_resp(VARIETIES)

        # 18. Single Variety
        m_var = re.match(r"^/api/(?:v1/)?varieties/(\d+)$", path)
        if m_var:
            vid = int(m_var.group(1))
            var_item = next((v for v in VARIETIES if v["id"] == vid), VARIETIES[0])
            return self._json_resp(var_item)

        # 19. Plots list
        if path in ("/api/plots", "/api/v1/plots"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else None
            did = int(query["division_id"][0]) if "division_id" in query else None
            res = PLOTS
            if eid:
                res = [p for p in res if p.get("estate_id") == eid]
            if did:
                res = [p for p in res if p.get("division_id") == did]
            return self._json_resp(res)

        # 20. Single Plot Detail (Extended)
        m_pdetail = re.match(r"^/api/(?:v1/)?plots/(\d+)/detail$", path)
        if m_pdetail:
            pid = int(m_pdetail.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            today = date.today()
            latest_s2 = (REAL_GEE_DATA.get("sentinel_2_observations") or [{}])[0] if REAL_GEE_DATA else {}
            latest_s1 = (REAL_GEE_DATA.get("sentinel_1_sar_observations") or [{}])[0] if REAL_GEE_DATA else {}
            return self._json_resp({
                "id": plot["id"],
                "name": plot["name"],
                "area_hectares": plot["area_hectares"],
                "crop_type": plot["crop_type"],
                "planting_date": None,
                "status": "Bera / Belum Ditanami",
                "current_hst": 0,
                "current_phase": "Bera",
                "division_id": plot["division_id"],
                "division_name": plot["division_name"],
                "estate_id": plot.get("estate_id", 1),
                "estate_name": plot.get("estate_name", "Kebun Bengkok (Pacitan)"),
                "company_id": plot.get("company_id", 1),
                "company_name": plot.get("company_name", "PT Agro Cerdas Nusantara"),
                "polygon": plot["polygon"],
                "variety_id": 1,
                "variety_name": "Inpari 32 HDB",
                "cycle_days": 120,
                "t_base": 10.0,
                "gdd_target_total": 1950.0,
                "gdd_cumulative": 0.0,
                "gdd_progress_pct": 0.0,
                "remaining_gdd": 1950.0,
                "predicted_harvest_date": (today + timedelta(days=120)).isoformat(),
                "estimated_days_to_harvest": 120,
                "etc_today": 0.00,
                "et0_today": 4.65,
                "kc_active": 1.05,
                "phases_timeline": [
                    {"phase_code": "VEG-1", "phase_name": "Vegetatif Awal", "hst_start": 0, "hst_end": 20, "gdd_target": 350.0, "kc_value": 1.05, "status": "active"},
                    {"phase_code": "VEG-2", "phase_name": "Vegetatif Aktif", "hst_start": 21, "hst_end": 40, "gdd_target": 650.0, "kc_value": 1.15, "status": "upcoming"},
                    {"phase_code": "INI-M", "phase_name": "Inisiasi Malai", "hst_start": 41, "hst_end": 55, "gdd_target": 850.0, "kc_value": 1.20, "status": "upcoming"},
                    {"phase_code": "BOOT", "phase_name": "Bunting (Booting)", "hst_start": 56, "hst_end": 70, "gdd_target": 1050.0, "kc_value": 1.25, "status": "upcoming"},
                    {"phase_code": "HEAD", "phase_name": "Berbunga (Heading)", "hst_start": 71, "hst_end": 85, "gdd_target": 1250.0, "kc_value": 1.20, "status": "upcoming"},
                    {"phase_code": "GRAIN", "phase_name": "Pengisian Bulir", "hst_start": 86, "hst_end": 105, "gdd_target": 1600.0, "kc_value": 1.05, "status": "upcoming"},
                    {"phase_code": "MATUR", "phase_name": "Masak Fisiologis", "hst_start": 106, "hst_end": 120, "gdd_target": 1950.0, "kc_value": 0.90, "status": "upcoming"},
                ],
                "latest_ndvi": latest_s2.get("ndvi", 0.2716),
                "latest_ndre": latest_s2.get("ndre", 0.1783),
                "latest_ndwi": latest_s2.get("ndwi", -0.1352),
                "latest_savi": latest_s2.get("savi", 0.2105),
                "latest_bsi": latest_s2.get("bsi", 0.1951),
                "sar_vv_db": latest_s1.get("sar_vv_db", -10.67),
                "sar_vh_db": latest_s1.get("sar_vh_db", -20.22),
                "observation_date": latest_s2.get("date", "2026-09-04"),
                "cloud_cover_pct": latest_s2.get("cloud_cover_pct", 23.2),
                "data_source": "Google Earth Engine Live (ESA Sentinel-2 & Sentinel-1)",
                "is_flooded": False,
                "vegetation_health": "Lahan Terbuka / Bera (Belum Ditanami)",
            })

        # 21. Single Plot Basic Info
        m_plot = re.match(r"^/api/(?:v1/)?plots/(\d+)$", path)
        if m_plot:
            pid = int(m_plot.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            return self._json_resp(plot)

        # 22. Plot Planting Seasons
        m_seasons = re.match(r"^/api/(?:v1/)?plots/(\d+)/seasons$", path)
        if m_seasons:
            pid = int(m_seasons.group(1))
            res = [s for s in SEASONS if s["plot_id"] == pid]
            return self._json_resp(res)

        # 23. Plot Season Comparison
        m_scomp = re.match(r"^(?:/api)?/(?:v1/)?plots/(\d+)/season-comparison$", path)
        if m_scomp:
            pid = int(m_scomp.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            return self._json_resp({
                "plot_id": pid,
                "plot_name": plot["name"],
                "crop_type": plot["crop_type"],
                "area_hectares": plot["area_hectares"],
                "current_season": {
                    "season_id": 0,
                    "plot_id": pid,
                    "plot_name": plot["name"],
                    "variety_name": "Belum Ditanami (Bera)",
                    "crop_type": plot["crop_type"],
                    "status": "bera",
                    "planting_date": "-",
                    "harvest_date": None,
                    "duration_days": 0,
                    "yield_estimate_ton_per_ha": 0.0,
                    "yield_ton_per_ha": 0.0,
                    "avg_ndvi": 0.27,
                    "peak_ndvi": 0.27,
                    "avg_ndre": 0.18,
                    "avg_ndwi": -0.14,
                    "total_rainfall_mm": 0.0,
                    "total_gdd": 0.0,
                    "total_alerts": 0,
                    "notes": "Petak dalam kondisi bera / lahan terbuka tanpa tanaman aktif."
                },
                "historical_seasons": [
                    {
                        "season_id": 1,
                        "plot_id": pid,
                        "plot_name": plot["name"],
                        "variety_name": "Inpari 32 HDB",
                        "crop_type": "padi",
                        "status": "harvested",
                        "planting_date": "2026-01-10",
                        "harvest_date": "2026-05-15",
                        "duration_days": 125,
                        "yield_ton_per_ha": 6.4,
                        "avg_ndvi": 0.69,
                        "peak_ndvi": 0.84,
                        "avg_ndre": 0.32,
                        "avg_ndwi": 0.25,
                        "total_rainfall_mm": 620.0,
                        "total_gdd": 1820.0,
                        "total_alerts": 1,
                        "notes": "Musim rendengan sebelumnya selesai sukses dengan hasil panen 6.4 Ton/Ha."
                    }
                ],
                "comparison_insights": [
                    "Petak Bengkok 1 saat ini belum ditanami (fase bera / lahan terbuka) dengan NDVI 0.2716 dan Bare Soil Index 0.1951.",
                    "Satelit Sentinel-1 SAR mengonfirmasi pantulan radar tanah terbuka (VV -10.67 dB, VH -20.22 dB) tanpa tutupan kanopi.",
                    "Musim tanam sebelumnya menghasilkan produktivitas 6.4 Ton/Ha dengan puncak NDVI 0.84.",
                    "Rekomendasi: Lakukan persiapan pengolahan tanah (tillage) dan pemupukan organik dasar sebelum bibit ditanam."
                ]
            })

        # 24. Plot Alerts
        m_palerts = re.match(r"^/api/(?:v1/)?plots/(\d+)/alerts$", path)
        if m_palerts:
            pid = int(m_palerts.group(1))
            res = [a for a in ALERTS if a["plot_id"] == pid]
            return self._json_resp(res)

        # 25. Plot Spectral Indices Time Series
        m_indices = re.match(r"^/api/(?:v1/)?plots/(\d+)/indices$", path)
        if m_indices:
            pid = int(m_indices.group(1))
            sat_filter = query.get("satellite", [None])[0]
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            if pid == 1 and REAL_GEE_DATA and REAL_GEE_DATA.get("sentinel_2_observations"):
                s2_obs = REAL_GEE_DATA["sentinel_2_observations"]
                s1_obs = REAL_GEE_DATA.get("sentinel_1_sar_observations", [])
                records = []
                for idx, obs in enumerate(s2_obs):
                    sar_vv = s1_obs[idx]["sar_vv_db"] if idx < len(s1_obs) else -10.67
                    sar_vh = s1_obs[idx]["sar_vh_db"] if idx < len(s1_obs) else -20.22
                    records.append({
                        "id": 2000 + idx,
                        "plot_id": 1,
                        "observation_date": obs["date"],
                        "satellite": "sentinel-2",
                        "ndvi": obs["ndvi"],
                        "ndre": obs["ndre"],
                        "ndwi": obs["ndwi"],
                        "savi": obs["savi"],
                        "bsi": obs["bsi"],
                        "sar_vv_db": sar_vv,
                        "sar_vh_db": sar_vh,
                        "cloud_cover_pct": obs.get("cloud_cover_pct", 12.0),
                        "vegetation_health": "Bera / Lahan Terbuka" if obs["ndvi"] < 0.30 else ("Baik" if obs["ndvi"] > 0.40 else "Sedang"),
                        "is_flooded": False,
                        "created_at": obs["date"] + "T10:00:00Z",
                    })
                if sat_filter != "sentinel-2":
                    for idx, s1 in enumerate(s1_obs):
                        records.append({
                            "id": 3000 + idx,
                            "plot_id": 1,
                            "observation_date": s1["date"],
                            "satellite": "sentinel-1",
                            "ndvi": None,
                            "ndre": None,
                            "ndwi": None,
                            "savi": None,
                            "bsi": None,
                            "sar_vv_db": s1["sar_vv_db"],
                            "sar_vh_db": s1["sar_vh_db"],
                            "cloud_cover_pct": 0.0,
                            "vegetation_health": "Normal (Radar)",
                            "is_flooded": False,
                            "created_at": s1["date"] + "T10:00:00Z",
                        })
                return self._json_resp({"plot_id": 1, "total": len(records), "items": records})

            today = date.today()
            records = []
            for i in range(6, -1, -1):
                obs_date = today - timedelta(days=i * 5)
                x = (plot["current_hst"] - i * 5) / 100.0
                ndvi_val = 0.20 + 0.62 / (1.0 + 2.718 ** (-6.0 * (x - 0.4)))
                records.append({
                    "id": 1000 + i,
                    "plot_id": pid,
                    "observation_date": obs_date.isoformat(),
                    "satellite": "sentinel-2",
                    "ndvi": round(ndvi_val, 3),
                    "ndre": round(ndvi_val * 0.48, 3),
                    "ndwi": round(ndvi_val * 0.35 - 0.05, 3),
                    "savi": round(ndvi_val * 0.95, 3),
                    "bsi": round(0.40 - ndvi_val * 0.30, 3),
                    "sar_vv_db": -10.67,
                    "sar_vh_db": -20.22,
                    "cloud_cover_pct": 5.0,
                    "vegetation_health": "Bera / Lahan Terbuka" if ndvi_val < 0.30 else "Baik",
                    "is_flooded": False,
                    "created_at": obs_date.isoformat() + "T10:00:00Z",
                })
            return self._json_resp({"plot_id": pid, "total": len(records), "items": records})

        # 26. Plot Weather Data
        m_pweather = re.match(r"^/api/(?:v1/)?plots/(\d+)/weather$", path)
        if m_pweather:
            today = date.today()
            items = []
            for i in range(7, -1, -1):
                d = today - timedelta(days=i)
                items.append({
                    "id": 500 + i,
                    "estate_id": 1,
                    "observation_date": d.isoformat(),
                    "temp_min": 23.5,
                    "temp_max": 32.0,
                    "humidity_avg": 78.0,
                    "rainfall_mm": 5.2 if i % 3 == 0 else 0.0,
                    "solar_radiation": 18.5,
                    "wind_speed_m_s": 2.1,
                    "et0_fao56": 4.65,
                    "et0_mm": 4.65,
                    "is_forecast": False,
                })
            return self._json_resp(items)

        # 27. General Weather Current fallback
        if path.startswith("/api/weather/current") or path.startswith("/api/v1/weather/current"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            return self._json_resp(get_current_weather_data(eid))

        # 28. General Weather Forecast fallback
        if path.startswith("/api/weather/forecast") or path.startswith("/api/v1/weather/forecast"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            return self._json_resp(get_weather_forecast_data(eid))

        # 29. Alerts Unread Count
        if path in ("/api/alerts/unread-count", "/api/v1/alerts/unread-count"):
            unread = [a for a in ALERTS if not a.get("is_read")]
            return self._json_resp({
                "total_unread": len(unread),
                "by_severity": {
                    "kuning": sum(1 for a in unread if a.get("severity") == "kuning"),
                    "oranye": sum(1 for a in unread if a.get("severity") == "oranye"),
                    "merah": sum(1 for a in unread if a.get("severity") == "merah"),
                    "hijau_tua": sum(1 for a in unread if a.get("severity") == "hijau_tua"),
                },
                "by_type": {
                    "water_stress": sum(1 for a in unread if a.get("alert_type") == "water_stress"),
                    "harvest_ready": sum(1 for a in unread if a.get("alert_type") == "harvest_ready"),
                }
            })

        # 30. Recent Alerts
        if path in ("/api/alerts/recent", "/api/v1/alerts/recent"):
            limit = int(query.get("limit", [10])[0])
            eid = int(query["estate_id"][0]) if "estate_id" in query else None
            res = [a for a in ALERTS if not eid or a.get("estate_id") == eid]
            return self._json_resp(res[:limit])

        # 31. Alerts List (Paginated)
        if path in ("/api/alerts", "/api/v1/alerts"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else None
            sev = query.get("severity", [None])[0]
            is_read_q = query.get("is_read", [None])[0]
            is_res_q = query.get("is_resolved", [None])[0]

            res = [a for a in ALERTS if not eid or a.get("estate_id") == eid]
            if sev and sev != "all":
                s_up = sev.upper()
                if s_up == "CRITICAL":
                    res = [a for a in res if a.get("severity") in ("merah", "critical", "kritis", "berat")]
                elif s_up == "WARNING":
                    res = [a for a in res if a.get("severity") in ("oranye", "kuning", "warning", "waspada", "sedang")]
                elif s_up == "INFO":
                    res = [a for a in res if a.get("severity") in ("hijau_tua", "info", "informasi", "biru", "ringan", "panen")]
                else:
                    res = [a for a in res if (a.get("severity") or "").lower() == sev.lower()]

            if is_read_q is not None:
                is_r_bool = is_read_q.lower() == "true"
                res = [a for a in res if bool(a.get("is_read")) == is_r_bool]

            if is_res_q is not None:
                is_res_bool = is_res_q.lower() == "true"
                res = [a for a in res if bool(a.get("is_resolved")) == is_res_bool]

            return self._json_resp({
                "total": len(res),
                "unread_count": sum(1 for a in ALERTS if not a.get("is_read")),
                "page": 1,
                "page_size": 20,
                "total_pages": 1,
                "items": res,
            })

        # 32. Report History
        if path in ("/reports/history", "/api/reports/history", "/api/v1/reports/history"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else None
            res = [r for r in REPORTS_HISTORY if not eid or r["estate_id"] == eid]
            return self._json_resp(res)

        # 33. Report CSV Export
        if path in (
            "/reports/export-csv", "/api/reports/export-csv", "/api/v1/reports/export-csv",
            "/reports/csv", "/api/reports/csv", "/api/v1/reports/csv"
        ):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            csv_bytes = generate_timeseries_csv(eid, start_date=start_date, end_date=end_date, include_cost=True)
            return self._binary_resp(
                csv_bytes,
                "text/csv; charset=utf-8",
                f"Timeseries_Agroklimat_Bengkok_{eid}_{date.today().isoformat()}.csv"
            )

        # 33b. Report PDF Export (GET fallback)
        if path in ("/reports/pdf", "/api/reports/pdf", "/api/v1/reports/pdf"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            start_date = query.get("start_date", [None])[0] or (date.today() - timedelta(days=30)).isoformat()
            end_date = query.get("end_date", [None])[0] or date.today().isoformat()
            rows = [
                ["Petak Lahan", "Status Tanam", "Luas (Ha)", "HST", "Fase Pertumbuhan", "NDVI Satelit", "Status Spektral"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "0.37 Ha", "0 HST", "Bera / Olah Tanah", "0.2716", "Lahan Terbuka (BSI: +0.1951, SAR VV: -10.67 dB)"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN RESMI TELEMETRI & OPERASIONAL LAHAN",
                f"Perkebunan: {estate['name']} | Periode: {start_date} s.d. {end_date} | Diterbitkan: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                rows,
                recommendation="Petak Bengkok 1 berstatus bera (0 HST). Telah tercatat 3 log tenaga kerja, 2 irigasi, dan 2 pengamatan OPT. Rekomendasi: lakukan pengolahan tanah (tillage), perataan lahan, dan pendaftaran musim tanam baru."
            )
            return self._binary_resp(pdf_bytes, "application/pdf", f"Laporan_Telemetri_Bengkok_{eid}_{date.today().isoformat()}.pdf")

        # 34. Report Download by ID
        m_rdown = re.match(r"^(?:/api)?/(?:v1/)?reports/download/(\d+)$", path)
        if m_rdown:
            rid = int(m_rdown.group(1))
            rep = next((r for r in REPORTS_HISTORY if r["id"] == rid), REPORTS_HISTORY[0])
            pdf_bytes = generate_pdf_document(
                rep["title"],
                f"Estate: Kebun Bengkok (Pacitan) | Status: Belum Ditanami (Bera) | Petak: Bengkok 1 (0.37 Ha)",
                [
                    ["Petak Lahan", "Status Tanam", "Luas (Ha)", "NDVI Satelit", "Status Spektral"],
                    ["Bengkok 1 (KML Utama)", "Belum Ditanami", "0.37 Ha", "0.2716", "Lahan Terbuka (Bera / Bare Soil)"],
                ],
                recommendation="Petak Bengkok 1 saat ini berstatus bera (fallow land, 0 HST). Direkomendasikan segera melakukan pengolahan tanah (tillage), perataan lahan, dan aplikasi pupuk dasar organik sebelum musim tanam baru dimulai."
            )
            return self._binary_resp(pdf_bytes, "application/pdf", rep["file_name"])

        # =============================================================
        # Precision Operations GET Endpoints (OPS-02)
        # =============================================================
        # 31. Plot Labor Logs
        m_labor_get = re.match(r"^/api/(?:v1/)?plots/(\d+)/labor$", path)
        if m_labor_get:
            pid = int(m_labor_get.group(1))
            items = [l for l in LABOR_LOGS if l["plot_id"] == pid]
            return self._json_resp(items)

        # 32. Plot Irrigation Logs
        m_irrig_get = re.match(r"^/api/(?:v1/)?plots/(\d+)/irrigation$", path)
        if m_irrig_get:
            pid = int(m_irrig_get.group(1))
            items = [i for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            return self._json_resp(items)

        # 33. Saprotan Items Catalog
        if path in ("/api/saprotan", "/api/v1/saprotan"):
            return self._json_resp(SAPROTAN_ITEMS)

        # 34. Plot Saprotan Applications
        m_sapro_app_get = re.match(r"^/api/(?:v1/)?plots/(\d+)/saprotan(?:-applications)?$", path)
        if m_sapro_app_get:
            pid = int(m_sapro_app_get.group(1))
            items = [s for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]
            return self._json_resp(items)

        # 35. Pest Scouting Reports
        m_scout_get = re.match(r"^/api/(?:v1/)?plots/(\d+)/scouting$", path)
        if m_scout_get:
            pid = int(m_scout_get.group(1))
            items = [s for s in PEST_SCOUTING_REPORTS if s["plot_id"] == pid]
            return self._json_resp(items)

        # 36. Financial Summary & Running HPP Calculation
        m_finsum = re.match(r"^/api/(?:v1/)?plots/(\d+)/financial-summary$", path)
        if m_finsum:
            pid = int(m_finsum.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            area = float(plot.get("area_hectares", 0.37))

            plot_labor = [l for l in LABOR_LOGS if l["plot_id"] == pid]
            plot_irrig = [i for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            plot_sapro = [s for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]

            total_labor = sum(float(l.get("total_cost", 0.0)) for l in plot_labor)
            total_irrigation = sum(float(i.get("fuel_cost", 0.0)) for i in plot_irrig)
            total_saprotan = sum(float(s.get("total_cost", 0.0)) for s in plot_sapro)
            land_rental_cost = round(2500000.0 * (area / 1.0), 2)

            total_running_cost = round(total_labor + total_irrigation + total_saprotan + land_rental_cost, 2)
            projected_yield_ton = round(6.5 * area, 2)
            projected_yield_kg = round(projected_yield_ton * 1000, 1)

            projected_hpp_per_kg = round(total_running_cost / projected_yield_kg, 2) if projected_yield_kg > 0 else 0.0
            market_ref_price = 6500.0
            efficiency_ratio = round(projected_hpp_per_kg / market_ref_price, 3) if market_ref_price > 0 else 0.0

            if efficiency_ratio <= 0.70:
                efficiency_status = "optimal"
            elif efficiency_ratio <= 0.90:
                efficiency_status = "waspada"
            else:
                efficiency_status = "over_budget"

            if plot.get("current_hst", 0) == 0 or not plot.get("planting_date"):
                target_harvest = None
            else:
                target_harvest = (date.today() + timedelta(days=90)).isoformat()

            return self._json_resp({
                "plot_id": pid,
                "plot_name": plot["name"],
                "area_hectares": area,
                "total_labor_cost": total_labor,
                "total_irrigation_cost": total_irrigation,
                "total_saprotan_cost": total_saprotan,
                "land_rental_cost": land_rental_cost,
                "total_running_cost": total_running_cost,
                "projected_yield_kg": projected_yield_kg,
                "projected_yield_ton": projected_yield_ton,
                "projected_hpp_per_kg": projected_hpp_per_kg,
                "market_reference_price_per_kg": market_ref_price,
                "efficiency_ratio": efficiency_ratio,
                "efficiency_status": efficiency_status,
                "target_harvest_date": target_harvest,
                "cost_breakdown": {
                    "labor": total_labor,
                    "saprotan": total_saprotan,
                    "irrigation": total_irrigation,
                    "land_rental": land_rental_cost,
                },
                "labor_logs_count": len(plot_labor),
                "irrigation_logs_count": len(plot_irrig),
                "saprotan_applications_count": len(plot_sapro),
            })

        # 37. Post-Harvest Logs
        m_ph_get = re.match(r"^/api/(?:v1/)?plots/(\d+)/post-harvest$", path)
        if m_ph_get:
            pid = int(m_ph_get.group(1))
            items = [p for p in POST_HARVEST_LOGS if p["plot_id"] == pid]
            return self._json_resp(items)

        # ============================================================
        # OPERATIONS ALIAS ROUTES (SYS-02 Fix)
        # ============================================================
        # /api/plots/:id/operations/financial-summary
        m_ops_fin = re.match(r"^/api/(?:v1/)?plots/(\d+)/operations/financial-summary$", path)
        if m_ops_fin:
            pid = int(m_ops_fin.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            area = float(plot.get("area_hectares", 0.37))
            plot_labor = [l for l in LABOR_LOGS if l["plot_id"] == pid]
            plot_irrig = [i for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            plot_sapro = [s for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]
            total_labor = sum(float(l.get("total_cost", 0.0)) for l in plot_labor)
            total_irrigation = sum(float(i.get("fuel_cost", 0.0)) for i in plot_irrig)
            total_saprotan = sum(float(s.get("total_cost", 0.0)) for s in plot_sapro)
            land_rental_cost = round(2500000.0 * (area / 1.0), 2)
            total_running_cost = round(total_labor + total_irrigation + total_saprotan + land_rental_cost, 2)
            projected_yield_kg = round(6.5 * area * 1000, 1)
            projected_hpp_per_kg = round(total_running_cost / projected_yield_kg, 2) if projected_yield_kg > 0 else 0.0
            market_ref_price = 6500.0
            efficiency_ratio = round(projected_hpp_per_kg / market_ref_price, 3) if market_ref_price > 0 else 0.0
            efficiency_status = "optimal" if efficiency_ratio <= 0.70 else ("waspada" if efficiency_ratio <= 0.90 else "over_budget")
            return self._json_resp({
                "plot_id": pid, "plot_name": plot["name"], "area_hectares": area,
                "total_labor_cost": total_labor, "total_irrigation_cost": total_irrigation,
                "total_saprotan_cost": total_saprotan, "land_rental_cost": land_rental_cost,
                "total_running_cost": total_running_cost, "projected_yield_kg": projected_yield_kg,
                "projected_hpp_per_kg": projected_hpp_per_kg,
                "market_reference_price_per_kg": market_ref_price,
                "efficiency_ratio": efficiency_ratio, "efficiency_status": efficiency_status,
                "cost_breakdown": {
                    "labor": total_labor, "saprotan": total_saprotan,
                    "irrigation": total_irrigation, "land_rental": land_rental_cost,
                },
                "labor_logs_count": len(plot_labor),
                "irrigation_logs_count": len(plot_irrig),
                "saprotan_applications_count": len(plot_sapro),
            })

        # /api/plots/:id/operations/summary
        m_ops_sum = re.match(r"^/api/(?:v1/)?plots/(\d+)/operations/summary$", path)
        if m_ops_sum:
            pid = int(m_ops_sum.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            plot_labor = [l for l in LABOR_LOGS if l["plot_id"] == pid]
            plot_irrig = [i for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            plot_sapro = [s for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]
            plot_scout = [s for s in PEST_SCOUTING_REPORTS if s["plot_id"] == pid]
            return self._json_resp({
                "plot_id": pid, "plot_name": plot["name"],
                "total_labor_logs": len(plot_labor),
                "total_irrigation_logs": len(plot_irrig),
                "total_saprotan_applications": len(plot_sapro),
                "total_scouting_reports": len(plot_scout),
                "total_labor_cost": sum(float(l.get("total_cost", 0.0)) for l in plot_labor),
                "total_irrigation_cost": sum(float(i.get("fuel_cost", 0.0)) for i in plot_irrig),
                "total_saprotan_cost": sum(float(s.get("total_cost", 0.0)) for s in plot_sapro),
            })

        # /api/plots/:id/operations/logs
        m_ops_logs = re.match(r"^/api/(?:v1/)?plots/(\d+)/operations/logs$", path)
        if m_ops_logs:
            pid = int(m_ops_logs.group(1))
            plot_labor = [dict(l, log_type="labor") for l in LABOR_LOGS if l["plot_id"] == pid]
            plot_irrig = [dict(i, log_type="irrigation") for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            plot_sapro = [dict(s, log_type="saprotan") for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]
            plot_scout = [dict(s, log_type="scouting") for s in PEST_SCOUTING_REPORTS if s["plot_id"] == pid]
            all_logs = sorted(
                plot_labor + plot_irrig + plot_sapro + plot_scout,
                key=lambda x: x.get("created_at", ""), reverse=True
            )
            return self._json_resp({"plot_id": pid, "total": len(all_logs), "items": all_logs})

        # ============================================================
        # REPORTS ALIAS ROUTES GET (SYS-02 Fix)
        # ============================================================
        if path in ("/api/reports/telemetry-csv", "/api/v1/reports/telemetry-csv"):
            eid = int(query.get("estate_id", [1])[0])
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            csv_bytes = generate_timeseries_csv(eid, start_date=start_date, end_date=end_date, include_cost=True)
            return self._binary_resp(
                csv_bytes, "text/csv; charset=utf-8",
                f"Timeseries_Agroklimat_Bengkok_{eid}_{date.today().isoformat()}.csv"
            )

        if path in ("/api/reports/health-pdf", "/api/v1/reports/health-pdf"):
            eid = int(query.get("estate_id", [1])[0])
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Tanam", "Luas (Ha)", "HST", "NDVI Satelit", "Keterangan"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "0.37 Ha", "0 HST", "0.2716",
                 "Lahan Terbuka (BSI: +0.1951, SAR VV: -10.67 dB)"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN STATUS LAHAN & INDEKS VEGETASI SATELIT",
                f"Perkebunan: {estate['name']} | Status: Bera | Diterbitkan: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                rows,
                recommendation="Petak Bengkok 1 berstatus bera (0 HST). Rekomendasi: lakukan tillage dan daftarkan musim tanam baru."
            )
            return self._binary_resp(pdf_bytes, "application/pdf",
                                     f"Laporan_Status_Lahan_Bengkok_1_{date.today().isoformat()}.pdf")

        if path in ("/api/reports/harvest-prediction-pdf", "/api/v1/reports/harvest-prediction-pdf"):
            eid = int(query.get("estate_id", [1])[0])
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Tanam", "Tgl Tanam", "GDD Kumulatif", "Estimasi Panen"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "-", "0.0 degC-hari", "Belum Ada Musim Aktif"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN PREDIKSI & KALENDER PANEN PRESISI",
                f"Perkebunan: {estate['name']} | Status: Bera / Belum Ada Musim Aktif",
                rows,
                recommendation="Petak Bengkok 1 berstatus bera (0 HST). Jadwalkan pengolahan tanah dan daftarkan musim tanam baru."
            )
            return self._binary_resp(pdf_bytes, "application/pdf",
                                     f"Laporan_Prediksi_Panen_Bengkok_1_{date.today().isoformat()}.pdf")

        if path in ("/api/reports/water-balance-pdf", "/api/v1/reports/water-balance-pdf"):
            eid = int(query.get("estate_id", [1])[0])
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Lahan", "ET0 (mm/hari)", "Kc", "ETc (mm)", "Keterangan"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami (Bera)", "4.65 mm", "0.00", "0.00 mm",
                 "Evaporasi Tanah Terbuka — Belum ada tajuk tanaman aktif"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN KEBUTUHAN AIR & NERACA IRIGASI (FAO-56)",
                f"Perkebunan: {estate['name']} | Analisis Penman-Monteith ET0",
                rows,
                recommendation="ETc saat ini 0.00 mm/hari (fase bera). Prioritaskan air untuk pembajakan dan pelumpuran sawah sebelum persemaian bibit."
            )
            return self._binary_resp(pdf_bytes, "application/pdf",
                                     f"Laporan_Neraca_Air_Bengkok_1_{date.today().isoformat()}.pdf")

        # ============================================================
        # ADMIN ALIAS ROUTES (SYS-02 Fix)
        # ============================================================
        if path in ("/api/admin/organizations", "/api/v1/admin/organizations"):
            return self._json_resp({"total": len(COMPANIES), "items": COMPANIES})

        if path in ("/api/admin/varieties", "/api/v1/admin/varieties"):
            slim_varieties = [{k: v for k, v in var.items() if k != "phases"} for var in VARIETIES]
            return self._json_resp({"total": len(slim_varieties), "items": slim_varieties})

        # =============================================================
        # DIGITAL AGRONOMY ENGINE ENDPOINTS (DAG-07 & DAG-08)
        # =============================================================
        # 38. Soil Characteristics (ISRIC SoilGrids & Saxton-Rawls)
        m_soil = re.match(r"^/api/(?:v1/)?agronomy/soil-characteristics/(\d+)$", path)
        if m_soil:
            pid = int(m_soil.group(1))
            data = get_soil_characteristics(plot_id=pid)
            return self._json_resp(data)

        # 38b. Plot Elevation & 5 Terrace Tiers (Copernicus DEM 30m)
        m_elev = re.match(r"^/api/(?:v1/)?agronomy/plots/(\d+)/elevation$", path)
        if m_elev or path in ("/api/agronomy/elevation", "/api/v1/agronomy/elevation"):
            data = get_bengkok_1_elevation_profile()
            return self._json_resp(data)

        # 39. Planting Window Simulation (GET convenience)
        if path in ("/api/agronomy/planting-window/simulate", "/api/v1/agronomy/planting-window/simulate"):
            start_date_q = query.get("start_date", [None])[0]
            pid_q = int(query.get("plot_id", [1])[0])
            data = simulate_planting_window(plot_id=pid_q, start_date_str=start_date_q)
            return self._json_resp(data)

        # 40. Terraced Water Balance (Cascading Hydrology & Sluice Gates)
        m_wb = re.match(r"^/api/(?:v1/)?agronomy/plots/(\d+)/water-balance$", path)
        if m_wb:
            pid = int(m_wb.group(1))
            precip = float(query.get("precipitation_mm", [28.5])[0])
            etc_val = float(query.get("etc_mm", [4.2])[0])
            data = get_terrace_hydrology(plot_id=pid, precipitation_mm=precip, etc_mm=etc_val)
            return self._json_resp(data)

        # 41. 3D Drone Mission KML Generator (Terrain-Following DEM + 2.5m)
        m_kml = re.match(r"^/api/(?:v1/)?agronomy/plots/(\d+)/drone-mission\.kml$", path)
        if m_kml:
            pid = int(m_kml.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            spray_h = float(query.get("spray_height_agl", [2.5])[0])
            kml_text = generate_drone_mission_kml(
                plot_name=plot["name"],
                crop_variety="Inpari 32 HDB",
                spray_height_agl=spray_h
            )
            kml_bytes = kml_text.encode("utf-8")
            filename = f"Misi_Drone_3D_{plot['name'].replace(' ', '_')}_Terrain_Following.kml"
            return self._binary_resp(
                kml_bytes,
                "application/vnd.google-earth.kml+xml; charset=utf-8",
                filename
            )

        # 42. Terrain-Adaptive Variable Rate Nutrition (VRN Manual Bucket)
        m_vrn = re.match(r"^/api/(?:v1/)?agronomy/plots/(\d+)/vrn$", path)
        if m_vrn:
            pid = int(m_vrn.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            area = float(plot.get("area_hectares", 0.37))
            data = calculate_vrn_prescription(
                plot_id=pid,
                plot_name=plot["name"],
                area_ha=area,
                crop_variety="Inpari 32 HDB",
                target_yield_ton_ha=7.5,
                current_hst=int(plot.get("current_hst", 0))
            )
            return self._json_resp(data)

        # 43. Cloud-Penetrating Sentinel-1 SAR Telemetry
        m_sar = re.match(r"^/api/(?:v1/)?agronomy/plots/(\d+)/sar$", path)
        if m_sar:
            pid = int(m_sar.group(1))
            data = get_sar_backscatter_telemetry(plot_id=pid)
            return self._json_resp(data)

        # Default fallback: 200 OK
        logger.info(f"Fallback response for unmapped path: {path}")
        return self._json_resp({"status": "ok", "message": "TANDUR Local Demo API Running"})

    # =================================================================
    # POST HANDLERS
    # =================================================================
    def do_POST(self):
        global CURRENT_USER
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        query = urllib.parse.parse_qs(parsed.query)
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b""

        logger.info(f"POST {path} | Content-Length: {content_len}")

        # 1. Auth Login
        if path in ("/api/auth/login", "/api/v1/auth/login"):
            email = "admin@tani.ag"
            role = "superadmin"
            name = "Dr. Ir. Agronom Tani"
            try:
                if raw_body:
                    b_data = json.loads(raw_body.decode("utf-8"))
                    req_email = b_data.get("email", "")
                    if req_email:
                        email = req_email
                        lower_em = req_email.lower()
                        if "manager" in lower_em:
                            role = "estate_manager"
                            name = "Estate Manager"
                        elif "agronom" in lower_em:
                            role = "agronomist"
                            name = "Agronomist Senior"
                        elif "operator" in lower_em:
                            role = "operator"
                            name = "Field Operator"
                        elif "admin" in lower_em:
                            role = "superadmin"
                            name = "Dr. Ir. Agronom Tani"
                    if "role" in b_data and b_data["role"]:
                        role = str(b_data["role"]).lower()
            except Exception:
                pass

            CURRENT_USER = {
                "id": 1,
                "email": email,
                "name": name,
                "role": role,
                "company_id": 1,
                "created_at": "2026-01-01T00:00:00Z",
            }

            return self._json_resp({
                "access_token": f"demo_jwt_token_tani_369_{role}_access",
                "token_type": "bearer",
                "user": CURRENT_USER,
            })

        # 2. Auth Logout
        if path in ("/api/auth/logout", "/api/v1/auth/logout"):
            CURRENT_USER = {
                "id": 1,
                "email": "admin@tani.ag",
                "name": "Dr. Ir. Agronom Tani",
                "role": "superadmin",
                "company_id": 1,
                "created_at": "2026-01-01T00:00:00Z",
            }
            return self._json_resp({"status": "ok", "message": "Logout berhasil"})

        # 2b. Reports: Unified PDF Download Endpoint (/reports/pdf)
        if path in ("/reports/pdf", "/api/reports/pdf", "/api/v1/reports/pdf"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            start_date = query.get("start_date", [None])[0] or (date.today() - timedelta(days=30)).isoformat()
            end_date = query.get("end_date", [None])[0] or date.today().isoformat()
            rows = [
                ["Petak Lahan", "Status Tanam", "Luas (Ha)", "HST", "Fase Pertumbuhan", "NDVI Satelit", "Status Spektral"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "0.37 Ha", "0 HST", "Bera / Olah Tanah", "0.2716", "Lahan Terbuka (BSI: +0.1951, SAR VV: -10.67 dB)"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN RESMI TELEMETRI & OPERASIONAL LAHAN",
                f"Perkebunan: {estate['name']} | Periode: {start_date} s.d. {end_date} | Diterbitkan: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                rows,
                recommendation="Petak Bengkok 1 berstatus bera (0 HST). Telah tercatat 3 log tenaga kerja, 2 irigasi, dan 2 pengamatan OPT. Rekomendasi: lakukan pengolahan tanah (tillage), perataan lahan, dan pendaftaran musim tanam baru."
            )
            filename = f"Laporan_Telemetri_Bengkok_{eid}_{date.today().isoformat()}.pdf"
            return self._binary_resp(pdf_bytes, "application/pdf", filename)

        # 2c. Reports: Unified CSV Export Endpoint (/reports/csv)
        if path in (
            "/reports/csv", "/api/reports/csv", "/api/v1/reports/csv",
            "/reports/export-csv", "/api/reports/export-csv", "/api/v1/reports/export-csv"
        ):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            csv_bytes = generate_timeseries_csv(eid, start_date=start_date, end_date=end_date, include_cost=True)
            return self._binary_resp(
                csv_bytes,
                "text/csv; charset=utf-8",
                f"Timeseries_Agroklimat_Bengkok_{eid}_{date.today().isoformat()}.csv"
            )

        # 3. Reports: Health PDF
        if path in ("/reports/health", "/api/reports/health", "/api/v1/reports/health"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Tanam", "Luas (Ha)", "HST", "Fase Pertumbuhan", "NDVI Satelit", "Keterangan"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "0.37 Ha", "0 HST", "Bera / Persiapan Lahan", "0.2716", "Lahan Terbuka (BSI: +0.1951, SAR VV: -10.67 dB)"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN STATUS LAHAN & INDEKS VEGETASI SATELIT",
                f"Perkebunan: {estate['name']} | Status: Bera / Belum Ditanami | Diterbitkan: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                rows,
                recommendation="Status Petak Bengkok 1 saat ini adalah lahan bera (fallow land / 0 HST) tanpa tajuk vegetasi aktif. Direkomendasikan segera melakukan pengolahan tanah (tillage), pembersihan sisa jerami, perataan lahan, dan aplikasi pupuk kandang/organik dasar sebelum jadwal penanaman musim baru dimulai."
            )
            filename = f"Laporan_Status_Lahan_Bengkok_1_{date.today().isoformat()}.pdf"
            return self._binary_resp(pdf_bytes, "application/pdf", filename)

        # 4. Reports: Harvest Prediction PDF
        if path in ("/reports/harvest-prediction", "/api/reports/harvest-prediction", "/api/v1/reports/harvest-prediction"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Tanam", "Tgl Tanam", "GDD Kumulatif", "Target GDD", "Estimasi Panen", "Keterangan"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami", "-", "0.0 °C-hari", "-", "Belum Ditanami", "Menunggu Jadwal Penanaman Musim Baru"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN PREDIKSI & KALENDER PANEN PRESISI",
                f"Perkebunan: {estate['name']} | Status: Bera / Belum Ada Musim Aktif",
                rows,
                recommendation="Petak Bengkok 1 saat ini berstatus bera (0 HST, GDD kumulatif 0.0 °C-hari). Musim rendengan sebelumnya telah selesai dipanen dengan varietas Inpari 32 HDB (hasil: 6.4 ton/ha). Jadwalkan pengolahan tanah dan daftarkan musim tanam baru untuk mengaktifkan pemantauan fenologi."
            )
            filename = f"Laporan_Prediksi_Panen_Bengkok_1.pdf"
            return self._binary_resp(pdf_bytes, "application/pdf", filename)

        # 5. Reports: Water Usage PDF
        if path in ("/reports/water-usage", "/api/reports/water-usage", "/api/v1/reports/water-usage"):
            eid = int(query["estate_id"][0]) if "estate_id" in query else 1
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            rows = [
                ["Petak Lahan", "Status Lahan", "ET0 (mm/hari)", "Kc Tanaman", "ETc Kebutuhan Air", "Keterangan"],
                ["Bengkok 1 (KML Utama)", "Belum Ditanami (Bera)", "4.65 mm", "0.00", "0.00 mm", "Belum ada tajuk tanaman aktif (Evaporasi Tanah Terbuka)"],
            ]
            pdf_bytes = generate_pdf_document(
                "LAPORAN KEBUTUHAN AIR & NERACA IRIGASI (FAO-56)",
                f"Perkebunan: {estate['name']} | Analisis Evapotranspirasi Penman-Monteith",
                rows,
                recommendation="Evapotranspirasi aktual (ETc) saat ini tercatat 0.00 mm/hari karena ketiadaan tajuk tanaman aktif (murni evaporasi tanah terbuka). Suplai air saat ini diprioritaskan untuk proses pembajakan dan pelumpuran tanah sawah (macak-macak) sebelum persemaian bibit."
            )
            filename = f"Laporan_Kebutuhan_Air_Bengkok_1_{date.today().isoformat()}.pdf"
            return self._binary_resp(pdf_bytes, "application/pdf", filename)

        # 6. Geospatial Single Import Preview (Uses Bengkoxxx1.kml attributes)
        if path in ("/api/plots/import-preview", "/api/v1/plots/import-preview"):
            return self._json_resp({
                "name": "Bengkok 1",
                "format": "KML",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [BENGKOK_COORDINATES],
                },
                "area_hectares": 0.37,
                "area_m2": 3688.0,
                "bounding_box": [111.063234, -8.0845655, 111.0640695, -8.0839697],
                "centroid": [111.0636165, -8.0843045],
                "vertex_count": len(BENGKOK_COORDINATES),
                "warnings": [],
            })

        # 7. Geospatial Batch Import Preview (Bengkok 1 KML)
        if path in ("/api/plots/batch-import-preview", "/api/v1/plots/batch-import-preview"):
            return self._json_resp({
                "format": "KML",
                "total_plots": 1,
                "total_area_hectares": 0.37,
                "total_area_m2": 3688.0,
                "unified_bounding_box": [111.063234, -8.0845655, 111.0640695, -8.0839697],
                "plots": [
                    {
                        "name": "Bengkok 1",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [BENGKOK_COORDINATES],
                        },
                        "area_hectares": 0.37,
                        "area_m2": 3688.0,
                        "vertex_count": len(BENGKOK_COORDINATES),
                        "bounding_box": [111.063234, -8.0845655, 111.0640695, -8.0839697],
                        "centroid": [111.0636165, -8.0843045],
                        "is_valid": True,
                        "warnings": [],
                    },
                ],
            })

        # 8. Plots Batch Create
        if path in ("/api/plots/batch-create", "/api/v1/plots/batch-create"):
            try:
                payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                payload = {}

            division_id = payload.get("division_id", 1) if isinstance(payload, dict) else 1
            raw_plots = payload.get("plots", []) if isinstance(payload, dict) else (payload if isinstance(payload, list) else [])

            created_ids = []
            total_ha = 0.0
            for item in raw_plots:
                new_id = len(PLOTS) + 1
                ha = float(item.get("area_hectares", 0.37))
                new_plot = {
                    "id": new_id,
                    "division_id": division_id,
                    "division_name": "Divisi Bengkok Utama",
                    "estate_id": 1,
                    "estate_name": "Kebun Bengkok (Pacitan)",
                    "company_id": 1,
                    "company_name": "PT Agro Cerdas Nusantara",
                    "variety_id": item.get("variety_id", 1),
                    "variety_name": "Inpari 32 HDB" if item.get("crop_type") == "padi" else "Pioneer P35",
                    "name": item.get("name", f"Petak Bengkok #{new_id}"),
                    "crop_type": item.get("crop_type", "padi"),
                    "area_hectares": ha,
                    "planting_date": item.get("planting_date", date.today().isoformat()),
                    "current_hst": 0,
                    "current_phase": "Vegetatif Awal",
                    "latest_ndvi": 0.25,
                    "ndvi_status": "Baik",
                    "active_alert_count": 0,
                    "polygon": item.get("polygon") or {
                        "type": "Polygon",
                        "coordinates": [BENGKOK_COORDINATES],
                    },
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                PLOTS.append(new_plot)
                created_ids.append(new_id)
                total_ha += ha

            return self._json_resp({
                "created_count": len(created_ids),
                "failed_count": 0,
                "total_area_hectares": round(total_ha, 2),
                "plot_ids": created_ids,
                "errors": [],
            }, 201)

        # 9. Plot Single Create
        if path in ("/api/plots", "/api/v1/plots"):
            try:
                item = json.loads(raw_body.decode("utf-8"))
            except Exception:
                item = {}
            new_id = len(PLOTS) + 1
            new_plot = {
                "id": new_id,
                "division_id": item.get("division_id", 1),
                "division_name": "Divisi Bengkok Utama",
                "estate_id": 1,
                "estate_name": "Kebun Bengkok (Pacitan)",
                "company_id": 1,
                "company_name": "PT Agro Cerdas Nusantara",
                "variety_id": item.get("variety_id", 1),
                "variety_name": "Inpari 32 HDB",
                "name": item.get("name", f"Petak Bengkok #{new_id}"),
                "crop_type": item.get("crop_type", "padi"),
                "area_hectares": item.get("area_hectares", 0.37),
                "planting_date": item.get("planting_date", date.today().isoformat()),
                "current_hst": 0,
                "current_phase": "Vegetatif Awal",
                "latest_ndvi": 0.25,
                "ndvi_status": "Baik",
                "active_alert_count": 0,
                "polygon": item.get("polygon") or {
                    "type": "Polygon",
                    "coordinates": [BENGKOK_COORDINATES],
                },
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            PLOTS.append(new_plot)
            return self._json_resp(new_plot, 201)

        # 10. Add Season to Plot
        m_add_season = re.match(r"^/api/(?:v1/)?plots/(\d+)/seasons$", path)
        if m_add_season:
            pid = int(m_add_season.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            new_season = {
                "id": len(SEASONS) + 1,
                "plot_id": pid,
                "variety_id": data.get("variety_id", 1),
                "variety_name": "Inpari 32 HDB",
                "crop_type": "padi",
                "planting_date": data.get("planting_date", date.today().isoformat()),
                "harvest_date": None,
                "status": "active",
                "yield_estimate_ton_per_ha": data.get("yield_estimate_ton_per_ha", 6.5),
                "notes": data.get("notes", "Musim tanam baru Bengkok"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            SEASONS.append(new_season)
            return self._json_resp(new_season, 201)

        # 11. Company Create
        if path in ("/api/companies", "/api/v1/companies"):
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            new_comp = {
                "id": len(COMPANIES) + 1,
                "name": data.get("name", "PT Agrikultur Baru"),
                "address": data.get("address", "Indonesia"),
                "estate_count": 0,
                "division_count": 0,
                "petak_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            COMPANIES.append(new_comp)
            return self._json_resp(new_comp, 201)

        # 12. Estate Create under Company
        m_cestate = re.match(r"^/api/(?:v1/)?companies/(\d+)/estates$", path)
        if m_cestate:
            cid = int(m_cestate.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            comp = next((c for c in COMPANIES if c["id"] == cid), COMPANIES[0])
            new_est = {
                "id": len(ESTATES) + 1,
                "company_id": cid,
                "company_name": comp["name"],
                "name": data.get("name", "Kebun Baru"),
                "province": data.get("province", "Jawa Timur"),
                "kabupaten": data.get("kabupaten", "Pacitan"),
                "latitude": float(data.get("latitude", -8.0843)),
                "longitude": float(data.get("longitude", 111.0636)),
                "division_count": 0,
                "petak_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            ESTATES.append(new_est)
            return self._json_resp(new_est, 201)

        # 13. Division Create under Estate
        m_ediv = re.match(r"^/api/(?:v1/)?estates/(\d+)/divisions$", path)
        if m_ediv:
            eid = int(m_ediv.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            new_div = {
                "id": len(DIVISIONS) + 1,
                "estate_id": eid,
                "estate_name": estate["name"],
                "company_id": estate["company_id"],
                "company_name": estate["company_name"],
                "name": data.get("name", "Divisi Baru"),
                "petak_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            DIVISIONS.append(new_div)
            return self._json_resp(new_div, 201)

        # 14. Variety Create
        if path in ("/api/varieties", "/api/v1/varieties"):
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            new_var = {
                "id": len(VARIETIES) + 1,
                "crop_type": data.get("crop_type", "padi"),
                "name": data.get("name", "Varietas Baru"),
                "cycle_days": data.get("cycle_days", 115),
                "t_base": data.get("t_base", 10.0),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "phases": [],
            }
            VARIETIES.append(new_var)
            return self._json_resp(new_var, 201)

        # 15. Variety Phase Create
        m_vphase = re.match(r"^/api/(?:v1/)?varieties/(\d+)/phases$", path)
        if m_vphase:
            vid = int(m_vphase.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                data = {}
            var_item = next((v for v in VARIETIES if v["id"] == vid), None)
            new_phase = {
                "id": 100 + len(data.get("phase_code", "")),
                "variety_id": vid,
                "phase_code": data.get("phase_code", "PHASE"),
                "phase_name": data.get("phase_name", "Fase Pertumbuhan"),
                "hst_start": data.get("hst_start", 0),
                "hst_end": data.get("hst_end", 30),
                "ndvi_expected_min": data.get("ndvi_expected_min", 0.20),
                "ndvi_expected_max": data.get("ndvi_expected_max", 0.50),
                "ndre_threshold": data.get("ndre_threshold", 0.25),
                "kc_value": data.get("kc_value", 1.0),
                "gdd_target": data.get("gdd_target", 400.0),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if var_item:
                var_item["phases"].append(new_phase)
            return self._json_resp(new_phase, 201)

        # 16. Manual Trigger Jobs (Satellite, Weather, Alerts)
        if path.startswith("/api/jobs/satellite") or path.startswith("/api/v1/jobs/satellite"):
            return self._json_resp({
                "status": "success",
                "message": "Sinkronisasi citra Sentinel-2 kebun Bengkok berhasil diselesaikan.",
                "plots_processed": 1,
                "records_created": 6,
                "errors": [],
            })

        if path.startswith("/api/jobs/weather") or path.startswith("/api/v1/jobs/weather"):
            return self._json_resp({
                "status": "success",
                "message": "Sinkronisasi data cuaca Open-Meteo & ET0 FAO-56 berhasil.",
                "estates_processed": 1,
                "records_synced": 16,
                "errors": [],
            })

        if path.startswith("/api/jobs/alerts") or path.startswith("/api/v1/jobs/alerts"):
            return self._json_resp({
                "status": "success",
                "message": "Evaluasi engine anomali agronomis selesai.",
                "plots_evaluated": 1,
                "alerts_created": 0,
                "errors": [],
            })

        # =============================================================
        # Precision Operations POST Endpoints (OPS-02)
        # =============================================================
        # 17. Create Labor Log
        m_labor_post = re.match(r"^/api/(?:v1/)?plots/(\d+)/labor$", path)
        if m_labor_post:
            pid = int(m_labor_post.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}
            count = int(data.get("labor_count", 1))
            hours = float(data.get("hours_worked", 7.0))
            wage = float(data.get("wage_rate_per_day", 100000.0))
            is_contract = bool(data.get("is_contract", False))
            total = float(data.get("total_cost", (wage * count) if not is_contract else wage))
            new_log = {
                "id": len(LABOR_LOGS) + 1,
                "plot_id": pid,
                "activity_date": data.get("activity_date", date.today().isoformat()),
                "task_type": data.get("task_type", "penyiangan"),
                "labor_count": count,
                "hours_worked": hours,
                "wage_rate_per_day": wage,
                "is_contract": is_contract,
                "total_cost": total,
                "notes": data.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            LABOR_LOGS.append(new_log)
            return self._json_resp(new_log, 201)

        # 18. Create Irrigation Log
        m_irrig_post = re.match(r"^/api/(?:v1/)?plots/(\d+)/irrigation$", path)
        if m_irrig_post:
            pid = int(m_irrig_post.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}
            new_log = {
                "id": len(IRRIGATION_LOGS) + 1,
                "plot_id": pid,
                "water_source": data.get("water_source", "irigasi_tersier"),
                "water_volume_m3": float(data.get("water_volume_m3", 0.0)) if data.get("water_volume_m3") is not None else None,
                "pump_duration_hours": float(data.get("pump_duration_hours", 0.0)),
                "fuel_liters": float(data.get("fuel_liters", 0.0)),
                "fuel_cost": float(data.get("fuel_cost", 0.0)),
                "started_at": data.get("started_at", datetime.now(timezone.utc).isoformat()),
                "ended_at": data.get("ended_at", datetime.now(timezone.utc).isoformat()),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            IRRIGATION_LOGS.append(new_log)
            return self._json_resp(new_log, 201)

        # 19. Create/Add Saprotan Catalog Item
        if path in ("/api/saprotan", "/api/v1/saprotan"):
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}
            new_item = {
                "id": len(SAPROTAN_ITEMS) + 1,
                "name": data.get("name", "Saprotan Baru"),
                "category": data.get("category", "pupuk_makro"),
                "active_ingredient": data.get("active_ingredient", ""),
                "phi_days": int(data.get("phi_days", 0)),
                "unit": data.get("unit", "kg"),
                "unit_cost": float(data.get("unit_cost", 0.0)),
                "stock_qty": float(data.get("stock_qty", 0.0)),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            SAPROTAN_ITEMS.append(new_item)
            return self._json_resp(new_item, 201)

        # 20. Apply Saprotan with PHI Guardrail Engine
        m_apply_sapro = re.match(r"^/api/(?:v1/)?plots/(\d+)/apply-saprotan$", path)
        if m_apply_sapro:
            pid = int(m_apply_sapro.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}

            item_id = int(data.get("item_id", 1))
            item = next((it for it in SAPROTAN_ITEMS if it["id"] == item_id), None)
            if not item:
                return self._json_resp({"detail": f"Item saprotan #{item_id} tidak ditemukan di inventori."}, 404)

            app_date_str = data.get("application_date", date.today().isoformat())
            try:
                app_date = date.fromisoformat(app_date_str)
            except Exception:
                app_date = date.today()

            # Target harvest calculation: for bera / 0 HST plot, target harvest is None unless explicitly passed
            target_harvest_str = data.get("target_harvest_date")
            target_harvest = None
            if target_harvest_str:
                try:
                    target_harvest = date.fromisoformat(target_harvest_str)
                except Exception:
                    target_harvest = None
            else:
                target_plot = next((p for p in PLOTS if p["id"] == pid), None)
                if target_plot and target_plot.get("current_hst", 0) > 0 and target_plot.get("planting_date"):
                    target_harvest = date.today() + timedelta(days=90)

            diff_days = (target_harvest - app_date).days if target_harvest else None
            phi = int(item.get("phi_days", 0))

            # PHI Guardrail Check per Spec §3.1
            if phi > 0 and diff_days is not None and diff_days < phi:
                err_msg = (
                    f"Aplikasi dilarang: Bahan aktif memiliki batas waktu tunggu {phi} hari sebelum panen. "
                    f"Estimasi panen fisiologis tersisa {diff_days} hari. Berisiko residu kimia melebihi batas BMR."
                )
                return self._json_resp({
                    "detail": err_msg,
                    "error_code": "PHI_VIOLATION",
                    "phi_days": phi,
                    "days_remaining_to_harvest": diff_days,
                    "item_name": item["name"],
                }, 400)

            qty = float(data.get("quantity_used", 1.0))
            cost = float(data.get("total_cost", qty * item.get("unit_cost", 0.0)))
            new_app = {
                "id": len(SAPROTAN_APPLICATIONS) + 1,
                "plot_id": pid,
                "item_id": item_id,
                "item_name": item["name"],
                "category": item["category"],
                "application_date": app_date_str,
                "quantity_used": qty,
                "unit": item.get("unit", "kg"),
                "unit_cost": item.get("unit_cost", 0.0),
                "total_cost": cost,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            SAPROTAN_APPLICATIONS.append(new_app)
            # Deduct stock
            item["stock_qty"] = max(0.0, float(item.get("stock_qty", 0.0)) - qty)
            return self._json_resp(new_app, 201)

        # 21. Create Pest Scouting Report
        m_scout_post = re.match(r"^/api/(?:v1/)?plots/(\d+)/scouting$", path)
        if m_scout_post:
            pid = int(m_scout_post.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}
            new_scout = {
                "id": len(PEST_SCOUTING_REPORTS) + 1,
                "plot_id": pid,
                "observation_date": data.get("observation_date", datetime.now(timezone.utc).isoformat()),
                "pest_type": data.get("pest_type", "wereng_coklat"),
                "severity": data.get("severity", "ringan"),
                "latitude": float(data.get("latitude", -8.0843)),
                "longitude": float(data.get("longitude", 111.0636)),
                "photo_url": data.get("photo_url"),
                "action_taken": data.get("action_taken", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            PEST_SCOUTING_REPORTS.append(new_scout)
            return self._json_resp(new_scout, 201)

        # 22. Harvest Closing with 14% Moisture Standardization Formula (Spec §3.3)
        m_hclose = re.match(r"^/api/(?:v1/)?plots/(\d+)/harvest-closing$", path)
        if m_hclose:
            pid = int(m_hclose.group(1))
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}

            harvest_date_str = data.get("harvest_date", date.today().isoformat())
            gross_yield_kg = float(data.get("gross_yield_kg", 0.0))
            moisture_pct = float(data.get("moisture_content_pct", 14.0))
            dockage_pct = float(data.get("dockage_pct", 0.0))
            selling_price = float(data.get("selling_price_per_kg", 6500.0))
            storage_loc = data.get("storage_location", "Gudang Pacitan Barat")

            # Standard 14% Moisture Formula:
            # Net = Gross * (1 - Dockage/100) * ((100 - Moisture) / (100 - 14))
            dockage_factor = 1.0 - (dockage_pct / 100.0)
            moisture_factor = (100.0 - moisture_pct) / 86.0
            net_yield_kg = round(gross_yield_kg * dockage_factor * moisture_factor, 2)

            total_revenue = round(net_yield_kg * selling_price, 2)

            # Calculate plot total running cost
            plot_labor = [l for l in LABOR_LOGS if l["plot_id"] == pid]
            plot_irrig = [i for i in IRRIGATION_LOGS if i["plot_id"] == pid]
            plot_sapro = [s for s in SAPROTAN_APPLICATIONS if s["plot_id"] == pid]
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            area = float(plot.get("area_hectares", 0.37))
            land_rental_cost = round(2500000.0 * (area / 1.0), 2)
            total_cost = round(
                sum(float(l.get("total_cost", 0.0)) for l in plot_labor) +
                sum(float(i.get("fuel_cost", 0.0)) for i in plot_irrig) +
                sum(float(s.get("total_cost", 0.0)) for s in plot_sapro) +
                land_rental_cost,
                2
            )

            net_profit = round(total_revenue - total_cost, 2)
            roi_pct = round((net_profit / total_cost) * 100.0, 2) if total_cost > 0 else 0.0
            actual_hpp_per_kg = round(total_cost / net_yield_kg, 2) if net_yield_kg > 0 else 0.0

            new_harvest = {
                "id": len(POST_HARVEST_LOGS) + 1,
                "plot_id": pid,
                "harvest_date": harvest_date_str,
                "gross_yield_kg": gross_yield_kg,
                "moisture_content_pct": moisture_pct,
                "dockage_pct": dockage_pct,
                "net_yield_kg": net_yield_kg,
                "standard_moisture_pct": 14.0,
                "selling_price_per_kg": selling_price,
                "storage_location": storage_loc,
                "total_revenue": total_revenue,
                "total_cost": total_cost,
                "net_profit": net_profit,
                "roi_pct": roi_pct,
                "actual_hpp_per_kg": actual_hpp_per_kg,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            POST_HARVEST_LOGS.append(new_harvest)
            return self._json_resp(new_harvest, 201)

        # 23. Planting Window Simulation (Module A - DAG-04/DAG-08)
        if path in ("/api/agronomy/planting-window/simulate", "/api/v1/agronomy/planting-window/simulate"):
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                data = {}
            pid = int(data.get("plot_id", 1))
            start_date = data.get("start_date")
            window_days = int(data.get("candidate_window_days", 25))
            sim_res = simulate_planting_window(plot_id=pid, start_date_str=start_date, candidate_window_days=window_days)
            return self._json_resp(sim_res, 200)

        # Fallback POST
        return self._json_resp({"status": "created", "id": 999}, 201)

    # =================================================================
    # PUT HANDLERS
    # =================================================================
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b""

        logger.info(f"PUT {path} | Content-Length: {content_len}")

        try:
            data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except Exception:
            data = {}

        # 1. Alert Mark as Read
        m_aread = re.match(r"^/api/(?:v1/)?alerts/(\d+)/read$", path)
        if m_aread:
            aid = int(m_aread.group(1))
            alert = next((a for a in ALERTS if a["id"] == aid), ALERTS[0])
            alert["is_read"] = True
            return self._json_resp(alert)

        # 2. Alert Mark as Resolved
        m_aresolve = re.match(r"^/api/(?:v1/)?alerts/(\d+)/resolve$", path)
        if m_aresolve:
            aid = int(m_aresolve.group(1))
            alert = next((a for a in ALERTS if a["id"] == aid), ALERTS[0])
            alert["is_resolved"] = True
            alert["resolved_at"] = datetime.now(timezone.utc).isoformat()
            return self._json_resp(alert)

        # 3. Update Season
        m_supdate = re.match(r"^/api/(?:v1/)?seasons/(\d+)$", path)
        if m_supdate:
            sid = int(m_supdate.group(1))
            season = next((s for s in SEASONS if s["id"] == sid), SEASONS[0])
            season.update(data)
            return self._json_resp(season)

        # 4. Update Company
        m_cupdate = re.match(r"^/api/(?:v1/)?companies/(\d+)$", path)
        if m_cupdate:
            cid = int(m_cupdate.group(1))
            comp = next((c for c in COMPANIES if c["id"] == cid), COMPANIES[0])
            comp.update(data)
            return self._json_resp(comp)

        # 5. Update Estate
        m_eupdate = re.match(r"^/api/(?:v1/)?estates/(\d+)$", path)
        if m_eupdate:
            eid = int(m_eupdate.group(1))
            estate = next((e for e in ESTATES if e["id"] == eid), ESTATES[0])
            estate.update(data)
            return self._json_resp(estate)

        # 6. Update Division
        m_dupdate = re.match(r"^/api/(?:v1/)?divisions/(\d+)$", path)
        if m_dupdate:
            did = int(m_dupdate.group(1))
            div = next((d for d in DIVISIONS if d["id"] == did), DIVISIONS[0])
            div.update(data)
            return self._json_resp(div)

        # 7. Update Variety
        m_vupdate = re.match(r"^/api/(?:v1/)?varieties/(\d+)$", path)
        if m_vupdate:
            vid = int(m_vupdate.group(1))
            var_item = next((v for v in VARIETIES if v["id"] == vid), VARIETIES[0])
            var_item.update(data)
            return self._json_resp(var_item)

        # 8. Update Plot
        m_pupdate = re.match(r"^/api/(?:v1/)?plots/(\d+)$", path)
        if m_pupdate:
            pid = int(m_pupdate.group(1))
            plot = next((p for p in PLOTS if p["id"] == pid), PLOTS[0])
            plot.update(data)
            return self._json_resp(plot)

        # Fallback PUT
        return self._json_resp({"status": "updated", "data": data})

    # =================================================================
    # DELETE HANDLERS
    # =================================================================
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        logger.info(f"DELETE {path}")

        m_comp = re.match(r"^/api/(?:v1/)?companies/(\d+)$", path)
        if m_comp:
            cid = int(m_comp.group(1))
            global COMPANIES
            COMPANIES = [c for c in COMPANIES if c["id"] != cid]
            return self._json_resp({"status": "deleted", "id": cid})

        m_est = re.match(r"^/api/(?:v1/)?estates/(\d+)$", path)
        if m_est:
            eid = int(m_est.group(1))
            global ESTATES
            ESTATES = [e for e in ESTATES if e["id"] != eid]
            return self._json_resp({"status": "deleted", "id": eid})

        m_div = re.match(r"^/api/(?:v1/)?divisions/(\d+)$", path)
        if m_div:
            did = int(m_div.group(1))
            global DIVISIONS
            DIVISIONS = [d for d in DIVISIONS if d["id"] != did]
            return self._json_resp({"status": "deleted", "id": did})

        m_var = re.match(r"^/api/(?:v1/)?varieties/(\d+)$", path)
        if m_var:
            vid = int(m_var.group(1))
            global VARIETIES
            VARIETIES = [v for v in VARIETIES if v["id"] != vid]
            return self._json_resp({"status": "deleted", "id": vid})

        m_plot = re.match(r"^/api/(?:v1/)?plots/(\d+)$", path)
        if m_plot:
            pid = int(m_plot.group(1))
            global PLOTS
            PLOTS = [p for p in PLOTS if p["id"] != pid]
            return self._json_resp({"status": "deleted", "id": pid})

        return self._json_resp({"status": "deleted"})


def run_server():
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), DemoAPIHandler)
    logger.info("==================================================")
    logger.info(f"TANDUR Mock API Server listening at http://0.0.0.0:{PORT}")
    logger.info("Spatial Dataset: Bengkoxxx1.kml loaded for Pacitan Petak Bengkok 1.")
    logger.info("Ready to serve all Next.js frontend routes seamlessly.")
    logger.info("==================================================")
    while True:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            logger.info("Stopping server...")
            server.server_close()
            break
        except Exception as e:
            logger.error(f"Server error: {e}, restarting serve loop...")


if __name__ == "__main__":
    run_server()
