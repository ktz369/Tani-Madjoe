"""Alert Engine Service for automated crop anomaly detection and smart notifications.

Evaluates 4 agronomic detection rules per agricultural plot:
1. Aturan 1 — Stres Nitrogen (Kuning): NDVI > 0.60 DAN NDRE <= (ndre_threshold_fase * 0.85)
2. Aturan 2 — Stres Air (Oranye): delta NDWI 7 hari < -0.15 DAN curah hujan 7 hari < 10.0 mm
3. Aturan 3 — Hama / Kerusakan Rebah (Merah): Penurunan drastis NDVI > 25% atau variansi piksel kanopi > 25%
4. Aturan 4 — Siap Panen (Hijau Tua): GDD akumulatif >= gdd_target_total DAN latest NDVI <= 0.35

Includes intelligent deduplication: avoids creating duplicate unresolved alerts of the same type within 7 days.
"""

from datetime import date, datetime, timedelta, timezone
import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.alert import Alert

logger = logging.getLogger(__name__)

# Constants for Alert Types
ALERT_TYPE_NITROGEN = "nitrogen_stress"
ALERT_TYPE_WATER = "water_stress"
ALERT_TYPE_PEST = "pest_anomaly"
ALERT_TYPE_HARVEST = "harvest_ready"

# Constants for Severity
SEVERITY_KUNING = "kuning"
SEVERITY_ORANYE = "oranye"
SEVERITY_MERAH = "merah"
SEVERITY_HIJAU_TUA = "hijau_tua"

# Default agronomic thresholds
DEFAULT_NITROGEN_MIN_NDVI = 0.60
DEFAULT_NITROGEN_NDRE_FACTOR = 0.85
DEFAULT_WATER_DELTA_NDWI = -0.15
DEFAULT_WATER_RAINFALL_MAX_MM = 10.0
DEFAULT_PEST_DROP_PCT = 0.25
DEFAULT_HARVEST_MAX_NDVI = 0.35


# ---------------------------------------------------------------------------
# Pure Rule Evaluation Functions (Unit-Testable without DB)
# ---------------------------------------------------------------------------


def check_nitrogen_stress(
    latest_ndvi: Optional[float],
    latest_ndre: Optional[float],
    phase_ndre_threshold: Optional[float] = 0.32,
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Evaluasi Aturan 1: Stres Nitrogen (Defisiensi N).

    Syarat: Tajuk rimbun (NDVI > 0.60) namun klorofil kanopi rendah (NDRE <= target_fase * 0.85).
    """
    if latest_ndvi is None or latest_ndre is None:
        return None

    thresholds = custom_thresholds or {}
    min_ndvi = thresholds.get("nitrogen_min_ndvi", DEFAULT_NITROGEN_MIN_NDVI)
    factor = thresholds.get("nitrogen_ndre_factor", DEFAULT_NITROGEN_NDRE_FACTOR)
    base_ndre_target = phase_ndre_threshold if phase_ndre_threshold is not None else 0.32
    effective_ndre_threshold = round(base_ndre_target * factor, 4)

    if latest_ndvi > min_ndvi and latest_ndre <= effective_ndre_threshold:
        return {
            "alert_type": ALERT_TYPE_NITROGEN,
            "severity": SEVERITY_KUNING,
            "title": "Potensi Stres Nitrogen (Defisiensi N)",
            "description": (
                f"Tajuk tanaman terdeteksi lebat (NDVI: {latest_ndvi:.2f} > {min_ndvi:.2f}), "
                f"namun kadar klorofil kanopi berada di bawah ambang normal (NDRE: {latest_ndre:.2f} <= {effective_ndre_threshold:.2f}). "
                "Hal ini mengindikasikan tanaman mengalami defisiensi hara Nitrogen pada fase vegetatif/generatif."
            ),
            "recommendation": "Lakukan uji klorofil daun (SPAD) atau segera jadwalkan aplikasi pupuk Nitrogen (Urea/ZA) susulan.",
            "trigger_values": {
                "latest_ndvi": latest_ndvi,
                "latest_ndre": latest_ndre,
                "ndre_threshold": effective_ndre_threshold,
                "base_ndre_target": base_ndre_target,
            },
        }

    return None


def check_water_stress(
    latest_ndwi: Optional[float],
    prev_ndwi: Optional[float],
    rainfall_7d_mm: Optional[float],
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Evaluasi Aturan 2: Stres Air (Cekaman Kekeringan).

    Syarat: Selisih NDWI 7 hari (delta NDWI = ndwi_today - ndwi_7d_ago) < -0.15 DAN total curah hujan 7 hari < 10.0 mm.
    """
    if latest_ndwi is None or prev_ndwi is None or rainfall_7d_mm is None:
        return None

    thresholds = custom_thresholds or {}
    delta_threshold = thresholds.get("water_delta_ndwi", DEFAULT_WATER_DELTA_NDWI)
    max_rainfall = thresholds.get("water_rainfall_max_mm", DEFAULT_WATER_RAINFALL_MAX_MM)

    delta_ndwi = round(latest_ndwi - prev_ndwi, 4)

    if delta_ndwi < delta_threshold and rainfall_7d_mm < max_rainfall:
        return {
            "alert_type": ALERT_TYPE_WATER,
            "severity": SEVERITY_ORANYE,
            "title": "Peringatan Cekaman Kekeringan / Stres Air",
            "description": (
                f"Terjadi penurunan tajam indeks kelembaban tajuk (ΔNDWI 7 hari: {delta_ndwi:.2f} < {delta_threshold:.2f}) "
                f"disertai akumulasi curah hujan minim ({rainfall_7d_mm:.1f} mm < {max_rainfall:.1f} mm). "
                "Kondisi ini menandakan tanaman berada dalam risiko cekaman air yang membahayakan metabolisme."
            ),
            "recommendation": "Segera lakukan irigasi/penggenangan petak dalam waktu 24-48 jam sebelum terjadi kelayuan permanen.",
            "trigger_values": {
                "latest_ndwi": latest_ndwi,
                "prev_ndwi": prev_ndwi,
                "delta_ndwi": delta_ndwi,
                "rainfall_7d_mm": round(rainfall_7d_mm, 2),
            },
        }

    return None


def check_pest_anomaly(
    latest_ndvi: Optional[float],
    prev_ndvi: Optional[float],
    pixel_variance: Optional[float] = None,
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Evaluasi Aturan 3: Anomali Kanopi / Dugaan Serangan Hama atau Rebah.

    Syarat: Penurunan drastis NDVI > 25% dibandingkan observasi sebelumnya ATAU variansi spasial piksel > 25%.
    """
    thresholds = custom_thresholds or {}
    drop_pct_threshold = thresholds.get("pest_drop_pct", DEFAULT_PEST_DROP_PCT)

    drop_ratio = 0.0
    is_drop_triggered = False

    if latest_ndvi is not None and prev_ndvi is not None and prev_ndvi >= 0.30:
        if latest_ndvi < prev_ndvi:
            drop_ratio = (prev_ndvi - latest_ndvi) / prev_ndvi
            if drop_ratio >= drop_pct_threshold:
                is_drop_triggered = True

    is_variance_triggered = False
    if pixel_variance is not None and pixel_variance >= drop_pct_threshold:
        is_variance_triggered = True

    if is_drop_triggered or is_variance_triggered:
        drop_pct_val = round(drop_ratio * 100, 1)
        return {
            "alert_type": ALERT_TYPE_PEST,
            "severity": SEVERITY_MERAH,
            "title": "Anomali Kanopi Tanaman / Dugaan Serangan Hama atau Rebah",
            "description": (
                f"Terdeteksi anomali tajuk vegetasi mendadak dengan penurunan drastis indeks vegetasi ({drop_pct_val}% "
                f"dari {prev_ndvi:.2f} ke {latest_ndvi:.2f}) atau variabilitas kanopi tinggi. "
                "Kondisi ini mengindikasikan potensi serangan OPT (wereng coklat, penggerek batang) atau insiden tanaman rebah (lodging)."
            ),
            "recommendation": "Kirim tim pengamat hama (POPT) untuk inspeksi langsung ke titik koordinat petak guna pengecekan wereng/penggerek atau rebah tanaman.",
            "trigger_values": {
                "latest_ndvi": latest_ndvi,
                "prev_ndvi": prev_ndvi,
                "drop_percentage": drop_pct_val,
                "pixel_variance": pixel_variance,
            },
        }

    return None


def check_harvest_ready(
    gdd_cumulative: Optional[float],
    gdd_target_total: Optional[float],
    latest_ndvi: Optional[float],
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Evaluasi Aturan 4: Siap Panen (Masak Fisiologis).

    Syarat: GDD akumulatif >= target varietas DAN latest NDVI <= 0.35.
    """
    if gdd_cumulative is None or gdd_target_total is None or latest_ndvi is None:
        return None

    if gdd_target_total <= 0:
        return None

    thresholds = custom_thresholds or {}
    max_ndvi = thresholds.get("harvest_max_ndvi", DEFAULT_HARVEST_MAX_NDVI)

    if gdd_cumulative >= gdd_target_total and latest_ndvi <= max_ndvi:
        return {
            "alert_type": ALERT_TYPE_HARVEST,
            "severity": SEVERITY_HIJAU_TUA,
            "title": "Tanaman Siap Dipanen (Masak Fisiologis)",
            "description": (
                f"Akumulasi satuan panas telah memenuhi target kematangan fisiologis varietas "
                f"(GDD kumulatif: {gdd_cumulative:.1f} >= {gdd_target_total:.1f} °C-hari) "
                f"disertai penguningan dan penurunan biomassa aktif kanopi (NDVI: {latest_ndvi:.2f} <= {max_ndvi:.2f})."
            ),
            "recommendation": "Keringkan petak lahan dan siapkan logistik pemanenan (combine harvester / tenaga kerja potong padi/jagung).",
            "trigger_values": {
                "gdd_cumulative": gdd_cumulative,
                "gdd_target_total": gdd_target_total,
                "latest_ndvi": latest_ndvi,
            },
        }

    return None


# ---------------------------------------------------------------------------
# Database-Integrated Plot Alert Evaluation
# ---------------------------------------------------------------------------


async def is_duplicate_active_alert(
    db: "AsyncSession",
    plot_id: int,
    alert_type: str,
    lookback_days: int = 7,
) -> bool:
    """Memeriksa apakah alert aktif yang sejenis sudah ada dalam 7 hari terakhir."""
    from sqlalchemy import select
    from app.models.alert import Alert

    cutoff_time = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    stmt = (
        select(Alert.id)
        .where(
            Alert.plot_id == plot_id,
            Alert.alert_type == alert_type,
            Alert.is_resolved.is_(False),
            Alert.created_at >= cutoff_time,
        )
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none() is not None


async def evaluate_alerts_for_plot(
    db: "AsyncSession",
    plot_id: int,
) -> List["Alert"]:
    """Mengevaluasi 4 aturan deteksi anomali untuk petak lahan dan menyimpan alert baru yang terpicu."""
    from sqlalchemy import desc, func, select
    from sqlalchemy.orm import selectinload
    from app.models.alert import Alert
    from app.models.crop_variety import CropVariety
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.planting_season import PlantingSeason
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    from app.models.weather_data import WeatherData

    # 1. Fetch Plot with variety, phases, and division
    stmt = (
        select(Plot)
        .options(
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.division),
        )
        .where(Plot.id == plot_id)
    )
    plot_result = await db.execute(stmt)
    plot = plot_result.scalar_one_or_none()
    if not plot:
        logger.warning("Plot ID %d tidak ditemukan untuk evaluasi alert.", plot_id)
        return []

    # Check active planting season or planting date
    has_active_planting = plot.planting_date is not None
    if not has_active_planting:
        # Check active season record
        season_stmt = (
            select(PlantingSeason.id)
            .where(PlantingSeason.plot_id == plot_id, PlantingSeason.status == "active")
            .limit(1)
        )
        has_active_planting = (await db.execute(season_stmt)).scalar_one_or_none() is not None

    if not has_active_planting:
        # Petak sedang bera / tidak ada musim tanam aktif
        return []

    # 2. Fetch latest spectral observations (up to 2 latest optical/Sentinel-2 records)
    spec_stmt = (
        select(SpectralIndex)
        .where(SpectralIndex.plot_id == plot_id, SpectralIndex.satellite == "sentinel-2")
        .order_by(desc(SpectralIndex.observation_date))
        .limit(5)
    )
    spec_res = await db.execute(spec_stmt)
    spectral_records = spec_res.scalars().all()

    latest_spec = spectral_records[0] if len(spectral_records) > 0 else None
    prev_spec = spectral_records[1] if len(spectral_records) > 1 else None

    # If no Sentinel-2, fallback to any spectral index
    if not latest_spec:
        fallback_stmt = (
            select(SpectralIndex)
            .where(SpectralIndex.plot_id == plot_id)
            .order_by(desc(SpectralIndex.observation_date))
            .limit(2)
        )
        fb_res = await db.execute(fallback_stmt)
        fb_records = fb_res.scalars().all()
        latest_spec = fb_records[0] if len(fb_records) > 0 else None
        prev_spec = fb_records[1] if len(fb_records) > 1 else None

    # 3. Fetch 7-day rainfall from WeatherData of the estate
    rainfall_7d = 0.0
    if plot.division and plot.division.estate_id:
        seven_days_ago = date.today() - timedelta(days=7)
        weather_stmt = (
            select(func.sum(WeatherData.rainfall_mm))
            .where(
                WeatherData.estate_id == plot.division.estate_id,
                WeatherData.observation_date >= seven_days_ago,
                WeatherData.is_forecast.is_(False),
            )
        )
        rainfall_res = await db.execute(weather_stmt)
        rainfall_sum = rainfall_res.scalar()
        rainfall_7d = float(rainfall_sum) if rainfall_sum is not None else 0.0

    # 4. Fetch latest GDD Accumulation record
    gdd_stmt = (
        select(GddAccumulation)
        .where(GddAccumulation.plot_id == plot_id)
        .order_by(desc(GddAccumulation.observation_date))
        .limit(1)
    )
    gdd_res = await db.execute(gdd_stmt)
    latest_gdd = gdd_res.scalar_one_or_none()

    # Variety targets
    variety = plot.variety
    phases = sorted(variety.phases, key=lambda p: p.gdd_target) if variety and variety.phases else []
    target_total_gdd = (
        phases[-1].gdd_target
        if phases
        else (1950.0 if plot.crop_type == "padi" else 1780.0)
    )

    # Active phase NDRE threshold
    active_phase_ndre = 0.32
    gdd_val = latest_gdd.gdd_cumulative if latest_gdd else 0.0
    for ph in phases:
        if gdd_val <= ph.gdd_target:
            active_phase_ndre = ph.ndre_threshold
            break

    # Custom variety thresholds (if variety has alert_thresholds in the future)
    custom_thresholds: Dict[str, Any] = {}

    triggered_alerts: List[Dict[str, Any]] = []

    # -------------------------------------------------------------
    # Rule 1: Stres Nitrogen
    # -------------------------------------------------------------
    if latest_spec:
        n_alert = check_nitrogen_stress(
            latest_ndvi=latest_spec.ndvi,
            latest_ndre=latest_spec.ndre,
            phase_ndre_threshold=active_phase_ndre,
            custom_thresholds=custom_thresholds,
        )
        if n_alert:
            triggered_alerts.append(n_alert)

    # -------------------------------------------------------------
    # Rule 2: Stres Air
    # -------------------------------------------------------------
    if latest_spec and prev_spec:
        w_alert = check_water_stress(
            latest_ndwi=latest_spec.ndwi,
            prev_ndwi=prev_spec.ndwi,
            rainfall_7d_mm=rainfall_7d,
            custom_thresholds=custom_thresholds,
        )
        if w_alert:
            triggered_alerts.append(w_alert)

    # -------------------------------------------------------------
    # Rule 3: Hama / Rebah
    # -------------------------------------------------------------
    if latest_spec and prev_spec:
        p_alert = check_pest_anomaly(
            latest_ndvi=latest_spec.ndvi,
            prev_ndvi=prev_spec.ndvi,
            custom_thresholds=custom_thresholds,
        )
        if p_alert:
            triggered_alerts.append(p_alert)

    # -------------------------------------------------------------
    # Rule 4: Siap Panen
    # -------------------------------------------------------------
    if latest_gdd and latest_spec:
        h_alert = check_harvest_ready(
            gdd_cumulative=latest_gdd.gdd_cumulative,
            gdd_target_total=target_total_gdd,
            latest_ndvi=latest_spec.ndvi,
            custom_thresholds=custom_thresholds,
        )
        if h_alert:
            triggered_alerts.append(h_alert)

    # -------------------------------------------------------------
    # Intelligent Deduplication and Persistence
    # -------------------------------------------------------------
    new_alerts: List[Alert] = []
    for item in triggered_alerts:
        alert_type = item["alert_type"]
        is_dup = await is_duplicate_active_alert(db, plot_id, alert_type, lookback_days=7)
        if not is_dup:
            alert_record = Alert(
                plot_id=plot_id,
                alert_type=alert_type,
                severity=item["severity"],
                title=item["title"],
                description=item["description"],
                recommendation=item["recommendation"],
                trigger_values=item["trigger_values"],
                is_read=False,
                is_resolved=False,
            )
            db.add(alert_record)
            new_alerts.append(alert_record)

    if new_alerts:
        await db.commit()
        for alert_record in new_alerts:
            await db.refresh(alert_record)

    return new_alerts


async def evaluate_alerts_for_all_plots(db: "AsyncSession") -> Dict[str, Any]:
    """Mengevaluasi 4 aturan deteksi anomali untuk seluruh petak lahan aktif di sistem."""
    from sqlalchemy import select
    from app.models.plot import Plot

    stmt = select(Plot.id).order_by(Plot.id.asc())
    result = await db.execute(stmt)
    plot_ids = [row[0] for row in result.all()]

    plots_evaluated = 0
    total_alerts_created = 0
    errors: List[str] = []

    for p_id in plot_ids:
        try:
            created = await evaluate_alerts_for_plot(db, p_id)
            plots_evaluated += 1
            total_alerts_created += len(created)
        except Exception as exc:
            err_msg = f"Gagal mengevaluasi alert petak ID {p_id}: {str(exc)}"
            logger.error(err_msg, exc_info=True)
            errors.append(err_msg)

    return {
        "status": "warning" if errors else "success",
        "message": (
            f"Evaluasi Alert Engine selesai. {plots_evaluated} petak diproses, "
            f"{total_alerts_created} alert baru diterbitkan."
        ),
        "plots_evaluated": plots_evaluated,
        "alerts_created": total_alerts_created,
        "errors": errors,
    }
