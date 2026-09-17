"""
Cascading Hydrology Service for Terraced Land (Module B - DAG-05)
Specialized for stepped rice paddy terraces (terasiring berundak) such as Petak Bengkok 1 (Pacitan).

Key Equations:
1. Slope (%) = (|Delta Elevation| / Horizontal Distance) * 100%
2. Inflow_tier(t) = Runoff_upper_tier(t) * (1 - AbsorptionFactor)
3. Water Balance for Tier i at time t:
   Storage(t) = Storage(t-1) + Inflow_tier(t) + Precipitation(t) - ETc(t) - Infiltration(t) - Outflow(t)
4. Cascading Sluice Gate Control:
   Synchronized bottom-up pre-drainage to prevent lower-tier flooding during high rainfall.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
import math
import logging

logger = logging.getLogger(__name__)

# Default constants calibrated for Bengkok 1 (Pacitan)
BENGKOK_1_TOTAL_AREA_M2 = 3700.0  # 0.37 Ha
BENGKOK_1_NUM_TIERS = 5
BENGKOK_1_MEAN_ELEVATION_M = 327.6
BENGKOK_1_HORIZ_DISTANCE_M = 70.5  # Horizontal terrace span (meters)
BENGKOK_1_ELEV_DELTA_M = 6.0       # Elevation drop from Tier 1 to Tier 5 (meters)
BENGKOK_1_DEFAULT_SLOPE_PCT = 8.51 # ~8.5% slope


@dataclass
class TerraceTier:
    """Represents a single terrace plot (kedok sawah) in a cascading system."""
    tier_id: int
    tier_name: str
    elevation_m: float
    area_m2: float = 740.0
    bund_height_mm: float = 120.0          # Max standing water depth before spillway overflow
    optimal_water_depth_mm: float = 50.0   # Target agronomic water depth for rice vegetative phase
    critical_flood_depth_mm: float = 100.0 # Submergence damage threshold (risk of lodging/drowning)
    current_water_depth_mm: float = 30.0   # Current measured/estimated standing water
    soil_infiltration_rate_mm_day: float = 3.5  # Percolation through puddled vertisol/alluvial soil
    sluice_gate_width_m: float = 0.5       # Width of terrace overflow sluice gate (pintu air)
    discharge_coeff: float = 0.62          # Standard broad-crested/rectangular weir discharge coeff

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TierWaterBalance:
    """Water balance result for a single terrace tier."""
    tier_id: int
    tier_name: str
    elevation_m: float
    area_m2: float
    initial_depth_mm: float
    precipitation_mm: float
    runoff_upper_tier_mm: float
    absorption_factor: float
    inflow_from_upper_tier_mm: float
    total_water_input_mm: float
    etc_mm: float
    infiltration_mm: float
    net_storage_before_drain_mm: float
    spillover_runoff_mm: float
    final_water_depth_mm: float
    stored_volume_m3: float
    runoff_volume_m3: float
    flood_risk_level: str  # 'SAFE', 'MODERATE', 'HIGH', 'CRITICAL'

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TerraceWaterBalanceResult:
    """Comprehensive water balance result across all cascading tiers."""
    plot_name: str
    num_tiers: int
    slope_pct: float
    precipitation_mm: float
    etc_mm: float
    total_inflow_volume_m3: float
    total_drainage_volume_m3: float
    total_stored_volume_m3: float
    max_water_depth_mm: float
    peak_flood_tier_id: int
    overall_flood_risk: str
    tiers: List[TierWaterBalance] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plot_name": self.plot_name,
            "num_tiers": self.num_tiers,
            "slope_pct": round(self.slope_pct, 2),
            "precipitation_mm": round(self.precipitation_mm, 2),
            "etc_mm": round(self.etc_mm, 2),
            "total_inflow_volume_m3": round(self.total_inflow_volume_m3, 3),
            "total_drainage_volume_m3": round(self.total_drainage_volume_m3, 3),
            "total_stored_volume_m3": round(self.total_stored_volume_m3, 3),
            "max_water_depth_mm": round(self.max_water_depth_mm, 1),
            "peak_flood_tier_id": self.peak_flood_tier_id,
            "overall_flood_risk": self.overall_flood_risk,
            "tiers": [t.to_dict() for t in self.tiers],
        }


@dataclass
class SluiceGateStep:
    """Actionable gate operation recommendation for a specific tier."""
    tier_id: int
    tier_name: str
    elevation_m: float
    gate_aperture_pct: float  # 0% (closed) to 100% (fully open)
    gate_status: str          # 'CLOSED', 'PARTIALLY_OPEN', 'FULL_OPEN'
    target_discharge_lps: float  # Estimated flow rate in liters per second
    projected_water_depth_mm: float
    flood_risk_level: str
    priority_order: int       # 1 (first to open/drain) to 5
    action_notes: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SluiceGateScheduleResult:
    """Full cascading sluice gate schedule for flood prevention."""
    plot_name: str
    forecast_rainfall_mm: float
    slope_pct: float
    schedule_phase: str
    urgency_level: str  # 'NORMAL', 'PRECAUTIONARY', 'HIGH_ALERT', 'EMERGENCY'
    strategy_description: str
    gate_steps: List[SluiceGateStep] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plot_name": self.plot_name,
            "forecast_rainfall_mm": round(self.forecast_rainfall_mm, 1),
            "slope_pct": round(self.slope_pct, 2),
            "schedule_phase": self.schedule_phase,
            "urgency_level": self.urgency_level,
            "strategy_description": self.strategy_description,
            "gate_steps": [s.to_dict() for s in self.gate_steps],
        }


class HydrologyService:
    """
    Cascading Hydrology Engine for terraced plots (Module B - DAG-05).
    Handles slope calculation, cascading inflow-runoff propagation,
    and cascading sluice gate scheduling.
    """

    def __init__(self):
        pass

    @staticmethod
    def calculate_slope_pct(elevation_delta_m: float, horizontal_distance_m: float) -> float:
        """
        Calculate terrain slope percentage from DEM elevation drop and horizontal run:
        Slope (%) = (|Delta Elevation| / Horizontal Distance) * 100%
        """
        if horizontal_distance_m <= 0:
            raise ValueError("Horizontal distance must be greater than zero.")
        slope = (abs(elevation_delta_m) / horizontal_distance_m) * 100.0
        return round(slope, 3)

    @staticmethod
    def calculate_absorption_factor(slope_pct: float, base_absorption: float = 0.20) -> float:
        """
        Calculates terrace edge/bund absorption factor based on slope.
        Steeper slope leads to faster runoff velocity across bund drops,
        reducing absorption time in transit.
        AbsorptionFactor = base_absorption * max(0.4, 1.0 - (slope_pct / 40.0))
        """
        slope_damping = max(0.4, 1.0 - (slope_pct / 40.0))
        factor = base_absorption * slope_damping
        return round(max(0.05, min(0.40, factor)), 3)

    @staticmethod
    def get_bengkok_1_default_tiers() -> List[TerraceTier]:
        """
        Generates the 5 calibrated terrace tiers for Petak Bengkok 1.
        Total area = 3,700 m2 (0.37 Ha), divided evenly (~740 m2 per tier).
        Elevation steps down from 330.0m (Tier 1) to 324.0m (Tier 5),
        matching ~8.51% average slope over 70.5m horizontal span.
        """
        elevations = [330.0, 328.5, 327.0, 325.5, 324.0]
        tier_names = [
            "Undakan 1 (Hulu Teratas - Saluran Primer)",
            "Undakan 2 (Kedok Atas)",
            "Undakan 3 (Kedok Tengah - Poros Teras)",
            "Undakan 4 (Kedok Bawah)",
            "Undakan 5 (Hilir Terbawah - Pintu Pembuangan)",
        ]
        tiers = []
        for i in range(5):
            tiers.append(
                TerraceTier(
                    tier_id=i + 1,
                    tier_name=tier_names[i],
                    elevation_m=elevations[i],
                    area_m2=BENGKOK_1_TOTAL_AREA_M2 / BENGKOK_1_NUM_TIERS,
                    bund_height_mm=120.0,
                    optimal_water_depth_mm=50.0,
                    critical_flood_depth_mm=100.0,
                    current_water_depth_mm=30.0,
                    soil_infiltration_rate_mm_day=3.5,
                    sluice_gate_width_m=0.5,
                )
            )
        return tiers

    def simulate_cascading_water_balance(
        self,
        precipitation_mm: float,
        etc_mm: float,
        tiers: Optional[List[TerraceTier]] = None,
        slope_pct: Optional[float] = None,
        absorption_factor: Optional[float] = None,
        initial_depths: Optional[List[float]] = None,
    ) -> TerraceWaterBalanceResult:
        """
        Simulate tiered water balance using cascading runoff equation:
        Inflow_tier(t) = Runoff_upper_tier(t) * (1 - AbsorptionFactor)

        Parameters:
        - precipitation_mm: rainfall for the simulation period (mm)
        - etc_mm: crop evapotranspiration (mm)
        - tiers: list of 5 TerraceTier instances (default: Bengkok 1)
        - slope_pct: terrain slope percentage (default: ~8.51%)
        - absorption_factor: bund absorption fraction (default: slope-adjusted ~0.158)
        - initial_depths: optional override of starting standing water per tier (mm)
        """
        if tiers is None:
            tiers = self.get_bengkok_1_default_tiers()

        if slope_pct is None:
            elev_drop = tiers[0].elevation_m - tiers[-1].elevation_m
            slope_pct = self.calculate_slope_pct(elev_drop, BENGKOK_1_HORIZ_DISTANCE_M)

        if absorption_factor is None:
            absorption_factor = self.calculate_absorption_factor(slope_pct)

        if initial_depths and len(initial_depths) == len(tiers):
            for t, d in zip(tiers, initial_depths):
                t.current_water_depth_mm = max(0.0, float(d))

        tier_results: List[TierWaterBalance] = []
        upper_tier_runoff_mm = 0.0  # Tier 1 has 0 upper tier runoff
        total_inflow_vol_m3 = 0.0
        total_drainage_vol_m3 = 0.0
        total_stored_vol_m3 = 0.0
        max_water_depth = 0.0
        peak_flood_tier_id = 1
        has_critical = False
        has_high = False

        for tier in tiers:
            # 1. Calculate cascading inflow from upper tier:
            # Inflow_tier(t) = Runoff_upper_tier(t) * (1 - AbsorptionFactor)
            if tier.tier_id == 1:
                inflow_from_upper = 0.0
            else:
                inflow_from_upper = upper_tier_runoff_mm * (1.0 - absorption_factor)

            total_water_input = precipitation_mm + inflow_from_upper
            inflow_vol = (total_water_input / 1000.0) * tier.area_m2
            total_inflow_vol_m3 += inflow_vol

            # 2. Water balance equation
            gross_water = tier.current_water_depth_mm + total_water_input
            net_before_drain = gross_water - etc_mm - tier.soil_infiltration_rate_mm_day
            net_before_drain = max(0.0, net_before_drain)

            # 3. Spillover runoff if net storage exceeds bund height
            if net_before_drain > tier.bund_height_mm:
                spillover_runoff = net_before_drain - tier.bund_height_mm
                final_depth = tier.bund_height_mm
            else:
                spillover_runoff = 0.0
                final_depth = net_before_drain

            # Propagate runoff to the next tier below
            upper_tier_runoff_mm = spillover_runoff

            # Volume calculations
            stored_vol = (final_depth / 1000.0) * tier.area_m2
            runoff_vol = (spillover_runoff / 1000.0) * tier.area_m2
            total_stored_vol_m3 += stored_vol

            # If last tier (Tier 5), runoff exits to main drainage canal
            if tier.tier_id == len(tiers):
                total_drainage_vol_m3 = runoff_vol

            # Flood risk assessment
            if final_depth >= tier.critical_flood_depth_mm:
                risk_level = "CRITICAL"
                has_critical = True
            elif final_depth >= tier.bund_height_mm * 0.85:
                risk_level = "HIGH"
                has_high = True
            elif final_depth > tier.optimal_water_depth_mm * 1.3:
                risk_level = "MODERATE"
            else:
                risk_level = "SAFE"

            if final_depth > max_water_depth:
                max_water_depth = final_depth
                peak_flood_tier_id = tier.tier_id

            tier_results.append(
                TierWaterBalance(
                    tier_id=tier.tier_id,
                    tier_name=tier.tier_name,
                    elevation_m=tier.elevation_m,
                    area_m2=tier.area_m2,
                    initial_depth_mm=round(tier.current_water_depth_mm, 2),
                    precipitation_mm=round(precipitation_mm, 2),
                    runoff_upper_tier_mm=round(0.0 if tier.tier_id == 1 else (inflow_from_upper / (1.0 - absorption_factor)), 2),
                    absorption_factor=round(absorption_factor, 3),
                    inflow_from_upper_tier_mm=round(inflow_from_upper, 2),
                    total_water_input_mm=round(total_water_input, 2),
                    etc_mm=round(etc_mm, 2),
                    infiltration_mm=round(tier.soil_infiltration_rate_mm_day, 2),
                    net_storage_before_drain_mm=round(net_before_drain, 2),
                    spillover_runoff_mm=round(spillover_runoff, 2),
                    final_water_depth_mm=round(final_depth, 2),
                    stored_volume_m3=round(stored_vol, 3),
                    runoff_volume_m3=round(runoff_vol, 3),
                    flood_risk_level=risk_level,
                )
            )

        if has_critical:
            overall_risk = "CRITICAL"
        elif has_high:
            overall_risk = "HIGH"
        elif any(t.flood_risk_level == "MODERATE" for t in tier_results):
            overall_risk = "MODERATE"
        else:
            overall_risk = "SAFE"

        return TerraceWaterBalanceResult(
            plot_name="Bengkok 1 (Pacitan)",
            num_tiers=len(tiers),
            slope_pct=slope_pct,
            precipitation_mm=precipitation_mm,
            etc_mm=etc_mm,
            total_inflow_volume_m3=total_inflow_vol_m3,
            total_drainage_volume_m3=total_drainage_vol_m3,
            total_stored_volume_m3=total_stored_vol_m3,
            max_water_depth_mm=max_water_depth,
            peak_flood_tier_id=peak_flood_tier_id,
            overall_flood_risk=overall_risk,
            tiers=tier_results,
        )

    def calculate_cascading_sluice_gate_schedule(
        self,
        forecast_rainfall_mm: float,
        current_depths: Optional[List[float]] = None,
        slope_pct: float = BENGKOK_1_DEFAULT_SLOPE_PCT,
        tiers: Optional[List[TerraceTier]] = None,
    ) -> SluiceGateScheduleResult:
        """
        Calculates cascading sluice gate schedule (jadwal buka-tutup pintu air berjenjang).
        
        Strategy to prevent lower-tier flooding during high rainfall:
        1. Bottom-up Staggered Drainage (Evakuasi Dini Undakan Bawah):
           - Tier 5 (lowest) opens FIRST with highest aperture (80-100%) to evacuate
             standing baseline water and create maximum storage buffer before upper cascade arrives.
           - Tier 4 opens next (70-85%).
           - Tiers 1-3 open in staged sequence (30-60%) to throttle upper release and prevent surge waves.
        2. Low Rainfall / Dry Condition:
           - Sluice gates remain closed or at minimal throttling (0-20%) to conserve water.
        """
        if tiers is None:
            tiers = self.get_bengkok_1_default_tiers()

        if current_depths and len(current_depths) == len(tiers):
            for t, d in zip(tiers, current_depths):
                t.current_water_depth_mm = max(0.0, float(d))

        # Classify rainfall intensity
        if forecast_rainfall_mm >= 70.0:
            urgency = "EMERGENCY"
            phase = "Evakuasi Darurat Banjir Bandang Terasiring"
            strategy = (
                "Hujan sangat lebat diprediksi (>70mm). Terapkan evakuasi hidrologi bertingkat: "
                "Buka penuh (100%) pintu air Undakan 5 dan 4 seketika. Buka 60-80% Undakan 3 dan 2. "
                "Tahan air di Undakan 1 (40%) sebagai retention basin untuk meredam debit puncak (peak attenuation)."
            )
        elif forecast_rainfall_mm >= 40.0:
            urgency = "HIGH_ALERT"
            phase = "Prapengosongan Terjadwal (Pre-Storm Drawdown)"
            strategy = (
                "Hujan lebat diprediksi (40-70mm). Undakan bawah berisiko menerima limpasan akumulatif "
                "dari seluruh petak atas pada lereng 8.5%. Buka pintu air Undakan 5 (85%) dan Undakan 4 (70%) "
                "30 menit sebelum puncak hujan. Undakan 1-3 dibuka terbatas (30-50%) untuk mencegah genangan rebah padi."
            )
        elif forecast_rainfall_mm >= 15.0:
            urgency = "PRECAUTIONARY"
            phase = "Regulasi Debit Terkendali"
            strategy = (
                "Hujan sedang diprediksi (15-40mm). Buka bertingkat 20-50% dari undakan hilir ke hulu "
                "untuk menjaga muka air stabil di ambang optimal 50mm tanpa menimbulkan limpasan pematang."
            )
        else:
            urgency = "NORMAL"
            phase = "Konservasi Air Optimal"
            strategy = (
                "Curah hujan rendah/normal (<15mm). Pintu air ditutup/dijaga rapat (0-10%) "
                "untuk mempertahankan cadangan air pada petak terasiring."
            )

        gate_steps: List[SluiceGateStep] = []

        # Calculate gate aperture and discharge per tier
        # Bottom-up priority: Tier 5 has priority 1, Tier 4 priority 2, ..., Tier 1 priority 5
        for tier in tiers:
            tid = tier.tier_id
            curr_depth = tier.current_water_depth_mm

            if urgency == "EMERGENCY":
                if tid == 5:
                    aperture = 100.0
                    prio = 1
                    note = "Buka PENUH (100%) segera. Evakuasi limpasan gabungan menuju saluran pembuangan utama."
                elif tid == 4:
                    aperture = 90.0
                    prio = 2
                    note = "Buka 90%. Cegah genangan meluap melampaui galengan setinggi 120mm."
                elif tid == 3:
                    aperture = 70.0
                    prio = 3
                    note = "Buka 70% secara bertahap. Alirkan air ke Undakan 4 yang sudah terbuka."
                elif tid == 2:
                    aperture = 50.0
                    prio = 4
                    note = "Buka 50%. Tahan sebagian volume air untuk mereduksi debit puncak."
                else:  # Tier 1
                    aperture = 40.0
                    prio = 5
                    note = "Buka 40% terkontrol. Berfungsi sebagai buffer retensi awal aliran hulu."

            elif urgency == "HIGH_ALERT":
                if tid == 5:
                    aperture = 85.0
                    prio = 1
                    note = "Buka 85% segera. Kosongkan kedok bawah untuk menyerap debit kaskade hulu."
                elif tid == 4:
                    aperture = 70.0
                    prio = 2
                    note = "Buka 70%. Stabilkan kedudukan muka air agar tidak melampaui 80mm."
                elif tid == 3:
                    aperture = 50.0
                    prio = 3
                    note = "Buka 50%. Lepaskan air secara terukur ke undakan bawah."
                elif tid == 2:
                    aperture = 35.0
                    prio = 4
                    note = "Buka 35%. Redam laju limpasan lereng ~8.5%."
                else:  # Tier 1
                    aperture = 25.0
                    prio = 5
                    note = "Buka 25%. Pertahankan tampungan atas untuk mencegah erosi pematang."

            elif urgency == "PRECAUTIONARY":
                if tid == 5:
                    aperture = 45.0
                    prio = 1
                    note = "Buka 45%. Buang kelebihan air hujan agar kedalaman kembali ke 50mm."
                elif tid == 4:
                    aperture = 35.0
                    prio = 2
                    note = "Buka 35%. Jaga sirkulasi aliran laminer berundak."
                elif tid == 3:
                    aperture = 25.0
                    prio = 3
                    note = "Buka 25%. Alirkan kelebihan air secara perlahan."
                elif tid == 2:
                    aperture = 20.0
                    prio = 4
                    note = "Buka 20% untuk menjaga ketinggian air target."
                else:  # Tier 1
                    aperture = 15.0
                    prio = 5
                    note = "Buka 15% untuk menyalurkan suplai ke petak bawah."

            else:  # NORMAL
                aperture = 0.0 if curr_depth <= tier.optimal_water_depth_mm else 15.0
                prio = 6 - tid
                note = "Pintu ditutup rapat (0%). Konservasi cadangan air untuk kelembaban tanah."

            # Gate status
            if aperture >= 99.0:
                gate_status = "FULL_OPEN"
            elif aperture > 0.0:
                gate_status = "PARTIALLY_OPEN"
            else:
                gate_status = "CLOSED"

            # Estimate discharge rate Q = Cd * b * h * sqrt(2gh) in Liters/second
            # Effective opening height h_gate (max 0.20m gate height)
            h_gate = (aperture / 100.0) * 0.20
            head = max(0.02, curr_depth / 1000.0)
            discharge_m3s = tier.discharge_coeff * tier.sluice_gate_width_m * h_gate * math.sqrt(2.0 * 9.81 * head)
            discharge_lps = round(discharge_m3s * 1000.0, 2)

            # Projected water depth with gate active
            projected_drain_mm = (discharge_m3s * 3600.0 / tier.area_m2) * 1000.0
            projected_depth = max(20.0, curr_depth + forecast_rainfall_mm - projected_drain_mm)

            if projected_depth >= tier.critical_flood_depth_mm:
                risk = "CRITICAL"
            elif projected_depth >= tier.bund_height_mm * 0.85:
                risk = "HIGH"
            elif projected_depth > tier.optimal_water_depth_mm * 1.3:
                risk = "MODERATE"
            else:
                risk = "SAFE"

            gate_steps.append(
                SluiceGateStep(
                    tier_id=tier.tier_id,
                    tier_name=tier.tier_name,
                    elevation_m=tier.elevation_m,
                    gate_aperture_pct=round(aperture, 1),
                    gate_status=gate_status,
                    target_discharge_lps=discharge_lps,
                    projected_water_depth_mm=round(projected_depth, 1),
                    flood_risk_level=risk,
                    priority_order=prio,
                    action_notes=note,
                )
            )

        # Sort steps by priority order (Undakan 5 first, then 4, 3, 2, 1)
        gate_steps.sort(key=lambda s: s.priority_order)

        return SluiceGateScheduleResult(
            plot_name="Bengkok 1 (Pacitan)",
            forecast_rainfall_mm=forecast_rainfall_mm,
            slope_pct=slope_pct,
            schedule_phase=phase,
            urgency_level=urgency,
            strategy_description=strategy,
            gate_steps=gate_steps,
        )

    # Alias for convenience
    generate_sluice_gate_schedule = calculate_cascading_sluice_gate_schedule


# Singleton instance
hydrology_service = HydrologyService()


def get_terrace_hydrology(
    plot_id: int = 1,
    precipitation_mm: float = 28.5,
    etc_mm: float = 4.2,
    forecast_rainfall_mm: Optional[float] = None,
) -> Dict[str, Any]:
    """Convenience helper to retrieve full water balance and sluice schedule for Bengkok 1."""
    if forecast_rainfall_mm is None:
        forecast_rainfall_mm = precipitation_mm
    balance = hydrology_service.simulate_cascading_water_balance(
        precipitation_mm=precipitation_mm,
        etc_mm=etc_mm
    )
    schedule = hydrology_service.calculate_cascading_sluice_gate_schedule(
        forecast_rainfall_mm=forecast_rainfall_mm
    )
    return {
        "plot_id": plot_id,
        "water_balance": balance.to_dict(),
        "sluice_schedule": schedule.to_dict(),
        "slope_pct": balance.slope_pct,
        "num_tiers": balance.num_tiers,
    }


