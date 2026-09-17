"""Historical satellite telemetry backfill service (Wave 8 / Ticket 04).

Generates and persists 30-day historical time-series observation data at 5-day cadence
(6 distinct time points) with realistic crop phenological curve shaping (NDVI, NDRE,
NDWI, SAVI, BSI, SAR backscatter) for agricultural plots.
"""

from datetime import date, timedelta
import hashlib
import logging
import math
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Fallbacks for environments where SQLAlchemy/GeoAlchemy might not be present (e.g. tests)
try:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
except ImportError:  # pragma: no cover
    class _DummySelect:
        def __init__(self, *args, **kwargs):
            self.args = args

        def where(self, *args, **kwargs):
            return self

        def options(self, *args, **kwargs):
            return self

    def select(*args, **kwargs):  # type: ignore
        return _DummySelect(*args, **kwargs)

    AsyncSession = Any  # type: ignore

try:
    from app.models.plot import Plot
    from app.models.spectral_index import SpectralIndex
    if not isinstance(Plot, type) or not isinstance(SpectralIndex, type):
        raise ImportError("Imported models are mock instances rather than constructible classes")
except (ImportError, TypeError):  # pragma: no cover
    class _DummyCol:
        def __eq__(self, other): return self
        def __ne__(self, other): return self
        def __ge__(self, other): return self
        def __le__(self, other): return self
        def __gt__(self, other): return self
        def __lt__(self, other): return self
        def in_(self, other): return self
        def desc(self): return self
        def asc(self): return self
        def __getattr__(self, name): return _DummyCol()

    class _DummyModelMeta(type):
        def __getattr__(cls, name):
            return _DummyCol()

    class Plot(metaclass=_DummyModelMeta):  # type: ignore
        def __init__(self, **kwargs):
            self.id = kwargs.get("id")
            self.crop_type = kwargs.get("crop_type", "padi")
            self.planting_date = kwargs.get("planting_date")
            for k, v in kwargs.items():
                setattr(self, k, v)

    class SpectralIndex(metaclass=_DummyModelMeta):  # type: ignore
        def __init__(self, **kwargs):
            self.id = kwargs.get("id")
            self.plot_id = kwargs.get("plot_id")
            self.observation_date = kwargs.get("observation_date")
            self.satellite = kwargs.get("satellite", "sentinel-2")
            self.ndvi = kwargs.get("ndvi")
            self.ndre = kwargs.get("ndre")
            self.ndwi = kwargs.get("ndwi")
            self.savi = kwargs.get("savi")
            self.bsi = kwargs.get("bsi")
            self.sar_vv_db = kwargs.get("sar_vv_db")
            self.sar_vh_db = kwargs.get("sar_vh_db")
            self.cloud_cover_pct = kwargs.get("cloud_cover_pct", 0.0)
            for k, v in kwargs.items():
                setattr(self, k, v)


def _calculate_phenology_ndvi(crop_type: str, hst: int) -> float:
    """Calculate NDVI along a realistic vegetative phenology curve based on days after planting (HST).

    Phenology progression:
    - Pre-planting (HST < 0): Bare / tilled soil (NDVI ~ 0.20)
    - Emerging: 0.20 - 0.35
    - Vegetative growth: 0.35 - 0.75 (smooth sigmoid transition)
    - Peak / reproductive: 0.75 - 0.85 (bell / sinusoidal peak)
    - Ripening / senescence: 0.85 -> 0.50
    """
    crop = (crop_type or "padi").strip().lower()

    if crop == "jagung":
        emerge_end = 15
        veg_end = 45
        peak_end = 70
        senesce_end = 100
    else:  # padi and default
        emerge_end = 20
        veg_end = 55
        peak_end = 80
        senesce_end = 115

    if hst < 0:
        return 0.20

    if hst < emerge_end:
        # Emerging stage: 0.20 -> 0.35
        progress = hst / emerge_end
        ndvi = 0.20 + 0.15 * progress
    elif hst < veg_end:
        # Vegetative growth: 0.35 -> 0.75 (smoothstep sigmoid transition)
        t = (hst - emerge_end) / (veg_end - emerge_end)
        smooth_t = 3 * (t**2) - 2 * (t**3)
        ndvi = 0.35 + 0.40 * smooth_t
    elif hst < peak_end:
        # Peak / reproductive: 0.75 -> 0.84 -> 0.78
        t = (hst - veg_end) / (peak_end - veg_end)
        ndvi = 0.75 + 0.09 * math.sin(t * math.pi)
    elif hst <= senesce_end:
        # Ripening / senescence: ~0.78 down to 0.50
        t = (hst - peak_end) / (senesce_end - peak_end)
        ndvi = 0.78 - 0.28 * t
    else:
        # Post-maturity / harvest stubble
        t = min(1.0, (hst - senesce_end) / 20.0)
        ndvi = max(0.20, 0.50 - 0.25 * t)

    return round(max(0.0, min(1.0, ndvi)), 4)


def generate_historical_spectral_data(
    plot_id: int,
    crop_type: str,
    planting_date: Optional[date],
    reference_date: Optional[date] = None,
    days_back: int = 30,
    cadence_days: int = 5,
    include_today: bool = False,
) -> List[Dict[str, Any]]:
    """Generate realistic historical satellite observation time points for an agricultural plot.

    Parameters:
        plot_id: Database ID of the plot.
        crop_type: Crop type string (e.g. 'padi', 'jagung').
        planting_date: Date crop was planted, or None if unknown.
        reference_date: End date of backfill window (defaults to today).
        days_back: Lookback span in days (default 30).
        cadence_days: Step interval between observations (default 5).
        include_today: Whether observation offsets include T-0 (ending at today) or end at T-5.

    Returns:
        List of observation dictionaries ordered chronologically ascending.
    """
    if reference_date is None:
        reference_date = date.today()

    if cadence_days <= 0:
        raise ValueError("cadence_days must be greater than 0")
    if days_back <= 0:
        return []

    num_observations = days_back // cadence_days
    # Offsets in descending order so subtracting from reference_date yields chronological ascending order
    # e.g., for days_back=30, cadence=5:
    # include_today=False -> offsets = [30, 25, 20, 15, 10, 5] (T-30 to T-5)
    # include_today=True  -> offsets = [25, 20, 15, 10, 5, 0] (T-25 to T-0)
    if include_today:
        offsets = [i * cadence_days for i in range(num_observations - 1, -1, -1)]
    else:
        offsets = [i * cadence_days for i in range(num_observations, 0, -1)]

    observations: List[Dict[str, Any]] = []

    for offset in offsets:
        obs_date = reference_date - timedelta(days=offset)

        if planting_date is not None:
            hst = (obs_date - planting_date).days
        else:
            # Arbitrary mid-growth cycle: assume reference_date corresponds to HST 50
            # so the 30-day window spans HST 20 -> HST 45 (active vegetative growth)
            simulated_planting_date = reference_date - timedelta(days=50)
            hst = (obs_date - simulated_planting_date).days

        ndvi = _calculate_phenology_ndvi(crop_type, hst)

        # Deterministic hash-based micro-noise (per plot_id + observation_date)
        # Bounded to subtle variations (±0.004) to maintain realistic field variability
        # while preserving smooth, monotonic vegetative growth curve without erratic drops.
        seed_str = f"plot-{plot_id}-{obs_date.isoformat()}-backfill"
        hash_val = int(hashlib.md5(seed_str.encode("utf-8")).hexdigest()[:8], 16)
        noise = ((hash_val % 1000) / 1000.0 - 0.5) * 0.008

        ndvi = round(max(0.0, min(1.0, ndvi + noise)), 4)

        # Scale factor normalized to [0, 1] relative to typical min (0.20) and max (0.85) NDVI
        f = max(0.0, min(1.0, (ndvi - 0.20) / 0.65))

        ndre = round(0.15 + 0.30 * f, 4)
        ndwi = round(0.05 + 0.30 * f, 4)
        savi = round(0.18 + 0.47 * f, 4)
        bsi = round(0.35 - 0.30 * f, 4)
        sar_vv_db = round(-14.0 + 3.0 * f, 1)
        sar_vh_db = round(-20.0 + 3.5 * f, 1)

        # Realistic low cloud cover (2.0% - 15.0%)
        cloud_cover_pct = round(2.0 + ((obs_date.day * 17 + plot_id * 5) % 130) / 10.0, 1)

        observations.append({
            "plot_id": plot_id,
            "observation_date": obs_date,
            "satellite": "sentinel-2",
            "ndvi": ndvi,
            "ndre": ndre,
            "ndwi": ndwi,
            "savi": savi,
            "bsi": bsi,
            "sar_vv_db": sar_vv_db,
            "sar_vh_db": sar_vh_db,
            "cloud_cover_pct": cloud_cover_pct,
        })

    return observations


async def backfill_satellite_indices_for_plot(
    db: AsyncSession,
    plot_id: int,
    days_back: int = 30,
    cadence_days: int = 5,
    include_today: bool = False,
) -> List[SpectralIndex]:
    """Fetch plot by ID, generate historical spectral observations, and persist to database.

    Uses PostgreSQL ON CONFLICT DO NOTHING when running against PostgreSQL,
    or verifies existing records to prevent unique constraint violations (uq_plot_obs_satellite)
    for SQLite / test environments.

    Parameters:
        db: Async database session.
        plot_id: ID of the agricultural plot to backfill.
        days_back: Historical window length in days (default 30).
        cadence_days: Interval between observations in days (default 5).
        include_today: Whether observation offsets include T-0 (ending at today) or end at T-5.

    Returns:
        List of created SpectralIndex instances.
    """
    stmt = select(Plot).where(Plot.id == plot_id)
    res = await db.execute(stmt)
    plot = res.scalar_one_or_none()
    if plot is None:
        logger.warning("Plot ID %s not found for satellite backfill.", plot_id)
        return []

    raw_data = generate_historical_spectral_data(
        plot_id=plot.id,
        crop_type=getattr(plot, "crop_type", "padi") or "padi",
        planting_date=getattr(plot, "planting_date", None),
        reference_date=date.today(),
        days_back=days_back,
        cadence_days=cadence_days,
        include_today=include_today,
    )

    if not raw_data:
        return []

    created_records: List[SpectralIndex] = []

    # Check dialect for PostgreSQL ON CONFLICT support
    dialect_name = ""
    try:
        bind = getattr(db, "bind", None)
        if bind is None and hasattr(db, "get_bind") and callable(db.get_bind):
            bind = db.get_bind()
            # If a test mock returns a coroutine for get_bind, ignore it
            if hasattr(bind, "__await__"):
                bind = None
        if bind is not None:
            dialect_name = getattr(getattr(bind, "dialect", None), "name", "")
    except Exception:
        pass

    if isinstance(dialect_name, str) and dialect_name.lower() == "postgresql":
        try:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            for item in raw_data:
                insert_stmt = (
                    pg_insert(SpectralIndex)
                    .values(**item)
                    .on_conflict_do_nothing(
                        index_elements=["plot_id", "observation_date", "satellite"]
                    )
                    .returning(SpectralIndex)
                )
                res = await db.execute(insert_stmt)
                obj = res.scalar_one_or_none()
                if obj is not None:
                    created_records.append(obj)
            await db.commit()
            return created_records
        except Exception as pg_err:
            logger.warning("PostgreSQL on_conflict insert failed, falling back to check: %s", pg_err)

    # Dialect-independent fallback (SQLite, Mocks, or non-Postgres):
    # Query existing records to ensure idempotency and avoid unique constraint violations
    obs_dates = [d["observation_date"] for d in raw_data]
    query_stmt = select(SpectralIndex).where(
        SpectralIndex.plot_id == plot_id,
        SpectralIndex.observation_date.in_(obs_dates),
    )
    query_res = await db.execute(query_stmt)
    existing_records = query_res.scalars().all() if hasattr(query_res, "scalars") else []
    existing_keys = {
        (getattr(r, "observation_date", None), getattr(r, "satellite", None))
        for r in existing_records
    }

    for item in raw_data:
        key = (item["observation_date"], item.get("satellite", "sentinel-2"))
        if key not in existing_keys:
            idx = SpectralIndex(**item)
            db.add(idx)
            created_records.append(idx)
            existing_keys.add(key)

    await db.commit()
    return created_records


async def batch_backfill_satellite_indices(
    db: AsyncSession,
    plot_ids: List[int],
    days_back: int = 30,
    cadence_days: int = 5,
    include_today: bool = False,
) -> Dict[str, Any]:
    """Execute historical satellite backfill across multiple plot IDs in batch.

    Processes plots sequentially within a database session to prevent concurrent session race conditions,
    handling nonexistent plots gracefully.

    Parameters:
        db: Async database session.
        plot_ids: List of plot IDs to backfill.
        days_back: Historical window length in days (default 30).
        cadence_days: Interval between observations in days (default 5).
        include_today: Whether observation offsets include T-0 or end at T-5.

    Returns:
        Dict summarizing processing status, plot counts, and total records saved.
    """
    total_plots = len(plot_ids)
    processed_count = 0
    records_saved = 0
    errors: List[str] = []

    for pid in plot_ids:
        try:
            records = await backfill_satellite_indices_for_plot(
                db=db,
                plot_id=pid,
                days_back=days_back,
                cadence_days=cadence_days,
                include_today=include_today,
            )
            processed_count += 1
            records_saved += len(records)
        except Exception as exc:
            errors.append(f"Plot {pid}: {str(exc)}")

    return {
        "status": "success" if not errors else "partial_success",
        "plots_processed": processed_count,
        "total_plots": total_plots,
        "records_created": records_saved,
        "errors": errors,
    }

