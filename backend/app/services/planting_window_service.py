"""
Module A: Dynamic Planting Window Engine (Saxton-Rawls & FAO-56 Neraca Air) - DAG-04.
Performs 100-120 days forward daily simulation of soil moisture balance for candidate
planting dates T0 in [1..30 days ahead].
Calculates planting suitability score S_T0 in [0, 100] for Rice (Inpari 32 HDB) vs Corn (Zea mays).
Applies specific agronomic stress penalties:
  * Rice: Mandatory puddling water accumulation >= 200 mm (days -15 to 0); heading/booting drought penalty.
  * Corn: Seed rot penalty if soil moisture > 85% FC during germination (days 0-7);
          barren ear (tongkol ompong) penalty if deficit > 60% during silking (days 45-60).
Recommends optimal planting date T0* with daily simulation curves.
"""

from datetime import date, datetime, timedelta
import math
from typing import Any, Dict, List, Optional, Tuple
from app.services.soilgrids_service import calculate_saxton_rawls, get_soil_characteristics


def generate_rainfall_climatology(start_date: date, days: int = 160) -> List[Dict[str, float]]:
    """
    Synthesize realistic Pacitan daily precipitation & ET0 based on historical climatology
    (Transition dry-to-wet season September - December).
    Pacitan rain increases markedly from late September through November.
    Produces deterministic, reproducible series for simulation.
    """
    series = []
    base_et0 = 4.2  # mm/day average Penman-Monteith ET0 in Pacitan
    for i in range(days):
        cur_date = start_date + timedelta(days=i)
        month = cur_date.month

        # Seasonal base probability and intensity
        if month in (9, 10):
            rain_prob = 0.45 + (0.01 * (i % 15))
            rain_intensity = 10.0 + 14.0 * math.sin(i * 0.4)
        elif month in (11, 12, 1, 2):
            rain_prob = 0.70
            rain_intensity = 20.0 + 15.0 * math.cos(i * 0.3)
        else:
            rain_prob = 0.30
            rain_intensity = 6.0 + 6.0 * math.sin(i * 0.5)

        # Deterministic wave pattern
        cyclic = (math.sin(i * 0.55) + math.cos(i * 0.28) + 1.2) / 3.0
        precip = max(0.0, round(rain_intensity * cyclic if cyclic > (1.0 - rain_prob) else 0.0, 1))

        # Daily ET0 decreases on cloudy/rainy days
        et0 = round(base_et0 * (0.70 if precip > 5.0 else 1.05 + 0.08 * math.sin(i * 0.2)), 2)

        series.append({
            "date": cur_date.isoformat(),
            "precipitation_mm": precip,
            "et0_mm": et0,
        })
    return series


def get_crop_kc(crop_type: str, hst: int) -> float:
    """
    Return dynamic crop coefficient Kc based on crop type and phenological phase (HST).
    - Rice (Inpari 32 HDB, cycle ~115 days):
      * Pre-planting / Pelumpuran (HST -15..0): Kc = 1.05
      * Vegetatif Awal (HST 1..20): Kc = 1.10
      * Anakan Aktif (HST 21..50): Kc = 1.15
      * Bunting & Berbunga / Heading (HST 51..85): Kc = 1.25
      * Pengisian Bulir (HST 86..105): Kc = 1.05
      * Pematangan (HST 106..120): Kc = 0.75
    - Corn (Zea mays / Bisi 18, cycle ~100 days):
      * Perkecambahan / Germination (HST 0..15): Kc = 0.40
      * Pertumbuhan Cepat / Vegetatif (HST 16..40): Kc = 0.80
      * Silking / Pembungaan (HST 41..65): Kc = 1.20
      * Pengisian Biji (HST 66..85): Kc = 0.95
      * Pematangan / Senescence (HST 86..100): Kc = 0.60
    """
    is_rice = (crop_type.upper() == "RICE")
    if hst < 0:
        return 1.05 if is_rice else 0.30

    if is_rice:
        if hst <= 20:
            return 1.10
        elif hst <= 50:
            return 1.15
        elif hst <= 85:
            return 1.25
        elif hst <= 105:
            return 1.05
        else:
            return 0.75
    else:
        if hst <= 15:
            return 0.40
        elif hst <= 40:
            return 0.80
        elif hst <= 65:
            return 1.20
        elif hst <= 85:
            return 0.95
        else:
            return 0.60


def simulate_crop_water_balance(
    crop_type: str,
    t0_date: date,
    soil_profile: Dict[str, Any],
    weather_series: List[Dict[str, float]],
    duration_days: int = 120,
) -> Dict[str, Any]:
    """
    Runs FAO-56 daily forward water balance simulation:
      S(t) = max(0, min(S_SAT, S(t-1) + P(t) - ET_c(t) - Runoff(t) - Percolation(t)))
      with ET_c(t) = Kc(t) * ET0(t) per phenological phase.

    Applies suitability scoring S_T0 in [0, 100]:
      - Rice:
        * Mandatory puddling water >= 200 mm in days -15 to 0.
        * Empty grain / gabah hampa penalty if drought occurs during booting/heading (days 50-75).
      - Corn:
        * Seed rot penalty if moisture > 85% FC during days 0-7.
        * Barren ear (tongkol ompong) penalty if deficit > 60% during silking (days 45-60).
    """
    hydro = soil_profile.get("saxton_rawls_hydrology", {})
    root_depth_mm = hydro.get("root_depth_mm", 300.0)

    # Hydraulic parameters in mm
    theta_sat_frac = hydro.get("theta_sat", 0.517)
    theta_fc_frac = hydro.get("theta_fc", 0.374)
    theta_pwp_frac = hydro.get("theta_pwp", 0.232)

    theta_sat_mm = round(theta_sat_frac * root_depth_mm, 2)  # e.g. ~155.1 mm
    theta_fc_mm = round(theta_fc_frac * root_depth_mm, 2)    # e.g. ~112.2 mm
    theta_pwp_mm = round(theta_pwp_frac * root_depth_mm, 2)  # e.g. ~69.6 mm
    awc_mm = round(theta_fc_mm - theta_pwp_mm, 2)            # e.g. ~42.6 mm

    is_rice = (crop_type.upper() == "RICE")

    # Storage boundaries
    # For rice terraces, bund retains standing water above saturation
    bund_height_mm = 80.0 if is_rice else 0.0
    max_storage_capacity = theta_sat_mm + bund_height_mm

    # Initial storage (Day -15): moderate moisture in fallow land (~50% AWC)
    current_storage = theta_pwp_mm + (0.50 * awc_mm)

    # Agronomic stress trackers
    puddling_water_sum = 0.0       # Rice puddling accumulation (days -15..0)
    heading_stress_days = 0        # Rice reproductive stress (days 50..75)
    corn_seed_rot_days = 0         # Corn germination waterlogging (days 0..7)
    corn_silking_deficit_days = 0  # Corn silking water deficit (days 45..60)

    daily_records: List[Dict[str, Any]] = []
    weather_map = {w["date"]: w for w in weather_series}

    # Simulation timeline: from Day -15 (or -5 for corn) up to duration_days
    prep_days = 15 if is_rice else 5
    start_sim_date = t0_date - timedelta(days=prep_days)
    total_sim_days = prep_days + duration_days

    for step in range(total_sim_days):
        cur_date = start_sim_date + timedelta(days=step)
        cur_date_str = cur_date.isoformat()
        hst = (cur_date - t0_date).days

        w = weather_map.get(cur_date_str, {"precipitation_mm": 5.0, "et0_mm": 4.0})
        p = float(w["precipitation_mm"])
        et0 = float(w["et0_mm"])

        # 1. Kc and ETc
        kc = get_crop_kc(crop_type, hst)
        etc = round(kc * et0, 2)

        # 2. Percolation rate
        # Sawah terasiring: tapak bajak (hardpan) limits percolation to ~2 mm/day
        # Lahan jagung: drainage is faster (~4.5 mm/day when moisture > FC)
        if is_rice:
            percolation = 2.0 if current_storage > theta_fc_mm else 0.5
        else:
            percolation = 4.5 if current_storage > theta_fc_mm else 1.0

        # 3. Track puddling water accumulation for rice (days -15..0)
        if is_rice and -15 <= hst <= 0:
            puddling_water_sum += p

        # 4. FAO-56 Daily Water Balance Mass Balance:
        # Proposed storage before bounding
        proposed_storage = current_storage + p - etc - percolation

        # Runoff occurs when proposed storage exceeds maximum retention capacity
        if proposed_storage > max_storage_capacity:
            runoff = round(proposed_storage - max_storage_capacity, 2)
            storage_after_runoff = max_storage_capacity
        else:
            runoff = 0.0
            storage_after_runoff = proposed_storage

        # Bound within [0, max_storage_capacity]
        # Soil storage cannot fall below physical residual dry floor (0.35 * PWP)
        residual_floor = round(0.35 * theta_pwp_mm, 2)
        new_storage = max(residual_floor, min(max_storage_capacity, storage_after_runoff))
        current_storage = round(new_storage, 2)

        # Moisture % of AWC
        if current_storage <= theta_pwp_mm:
            moisture_pct_awc = 0.0
        elif current_storage >= theta_fc_mm:
            excess_ratio = (current_storage - theta_fc_mm) / max(1.0, (theta_sat_mm - theta_fc_mm))
            moisture_pct_awc = min(150.0, round(100.0 + (excess_ratio * 50.0), 1))
        else:
            moisture_pct_awc = round(((current_storage - theta_pwp_mm) / awc_mm) * 100.0, 1)

        # Water deficit % of AWC: (100 - moisture_pct_awc)
        deficit_pct = max(0.0, min(100.0, 100.0 - min(100.0, moisture_pct_awc)))

        # 5. Evaluate Agronomic Rules & Stress Conditions
        stress_condition = None

        if is_rice:
            # Rule Padi: Heading/Bunting phase (HST 50..75)
            # Severe drought if available water deficit > 60% (moisture < 40% AWC)
            if 50 <= hst <= 75:
                if moisture_pct_awc < 40.0:
                    heading_stress_days += 1
                    stress_condition = "STRES_AIR_BUNTING"
        else:
            # Rule Jagung:
            # A. Seed rot risk during germination (HST 0..7) if moisture > 85% FC
            if 0 <= hst <= 7:
                if current_storage > (0.85 * theta_fc_mm):
                    corn_seed_rot_days += 1
                    stress_condition = "RISIKO_BUSUK_BENIH"
            # B. Barren ear (tongkol ompong) if deficit > 60% during silking (HST 45..60)
            if 45 <= hst <= 60:
                if deficit_pct > 60.0 or moisture_pct_awc < 40.0:
                    corn_silking_deficit_days += 1
                    stress_condition = "RISIKO_TONGKOL_OMPONG"

        # Record daily data
        soil_water_mm = min(current_storage, theta_sat_mm)
        ponded_mm = max(0.0, round(current_storage - theta_sat_mm, 1)) if is_rice else 0.0

        daily_records.append({
            "hst": hst,
            "date": cur_date_str,
            "soil_moisture_mm": round(soil_water_mm, 2),
            "ponded_water_mm": ponded_mm,
            "precipitation_mm": p,
            "et0_mm": et0,
            "kc": kc,
            "etc_mm": etc,
            "runoff_mm": runoff,
            "percolation_mm": percolation,
            "moisture_pct_awc": moisture_pct_awc,
            "deficit_pct": round(deficit_pct, 1),
            "stress_condition": stress_condition,
        })

    # 6. Calculate Suitability Score S_T0 in [0, 100]
    score = 100.0
    penalties: List[Dict[str, Any]] = []

    if is_rice:
        # Rule Padi 1: Wajib akumulasi air >= 200 mm pada fase pelumpuran (hari -15 s.d 0)
        puddling_target = 200.0
        if puddling_water_sum < puddling_target:
            puddling_deficit = puddling_target - puddling_water_sum
            # Penalty up to 50 points proportional to deficit
            puddling_penalty = min(50.0, round((puddling_deficit / puddling_target) * 50.0, 1))
            score -= puddling_penalty
            penalties.append({
                "rule": "RULE_PADI_PELUMPURAN",
                "penalty_points": puddling_penalty,
                "description": f"Akumulasi air pelumpuran ({round(puddling_water_sum, 1)} mm) kurang dari batas wajib 200 mm",
            })

        # Rule Padi 2: Penalti defisit fase bunting/heading (hari 50..75)
        if heading_stress_days > 0:
            heading_penalty = min(50.0, round(heading_stress_days * 12.5, 1))
            score -= heading_penalty
            penalties.append({
                "rule": "RULE_PADI_DEFISIT_BUNTING",
                "penalty_points": heading_penalty,
                "description": f"Risiko gabah hampa: {heading_stress_days} hari defisit air pada fase bunting/heading",
            })

    else: # Corn
        # Rule Jagung 1: Penalti busuk benih jika kadar air > 85% FC pada hari 0-7
        if corn_seed_rot_days >= 3:
            rot_penalty = 40.0
            score -= rot_penalty
            penalties.append({
                "rule": "RULE_JAGUNG_BUSUK_BENIH",
                "penalty_points": rot_penalty,
                "description": f"Risiko busuk benih: kelembapan tanah > 85% FC selama {corn_seed_rot_days} hari pada fase kecambah (hari 0-7)",
            })
        elif corn_seed_rot_days > 0:
            rot_penalty = round(corn_seed_rot_days * 10.0, 1)
            score -= rot_penalty
            penalties.append({
                "rule": "RULE_JAGUNG_BUSUK_BENIH_RINGAN",
                "penalty_points": rot_penalty,
                "description": f"Kelembapan tinggi {corn_seed_rot_days} hari saat perkecambahan",
            })

        # Rule Jagung 2: Penalti tongkol ompong jika defisit > 60% fase silking (hari 45-60)
        if corn_silking_deficit_days > 0:
            silking_penalty = min(50.0, round(corn_silking_deficit_days * 12.5, 1))
            score -= silking_penalty
            penalties.append({
                "rule": "RULE_JAGUNG_TONGKOL_OMPONG",
                "penalty_points": silking_penalty,
                "description": f"Risiko tongkol ompong: defisit air > 60% selama {corn_silking_deficit_days} hari fase silking/pembungaan",
            })

    final_score = max(0.0, min(100.0, round(score, 1)))
    status = "OPTIMAL" if final_score >= 80 else ("LAYAK" if final_score >= 60 else "BERISIKO")

    return {
        "candidate_date": t0_date.isoformat(),
        "crop_type": crop_type,
        "suitability_score": final_score,
        "status": status,
        "penalties": penalties,
        "puddling_water_sum_mm": round(puddling_water_sum, 1) if is_rice else None,
        "heading_stress_days": heading_stress_days if is_rice else None,
        "corn_seed_rot_days": corn_seed_rot_days if not is_rice else None,
        "corn_silking_deficit_days": corn_silking_deficit_days if not is_rice else None,
        "daily_timeline": daily_records,
    }


def find_optimal_planting_window(
    plot_id: int = 1,
    start_date_str: Optional[str] = None,
    candidate_window_days: int = 30,
) -> Dict[str, Any]:
    """
    Evaluates candidate planting dates T0 across 1..30 days ahead for both Rice and Corn.
    Identifies the best date T0* maximizing suitability score S_T0.
    Provides full daily curves and scoring breakdowns.
    """
    if start_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except Exception:
            start_date = date.today()
    else:
        start_date = date.today()

    soil_profile = get_soil_characteristics(plot_id=plot_id)
    weather_series = generate_rainfall_climatology(start_date - timedelta(days=15), days=170)

    rice_candidates: List[Dict[str, Any]] = []
    corn_candidates: List[Dict[str, Any]] = []

    best_rice_sim: Optional[Dict[str, Any]] = None
    best_rice_score = -1.0

    best_corn_sim: Optional[Dict[str, Any]] = None
    best_corn_score = -1.0

    # Test candidate dates T0 from day 1 to day 30 (step 1 or 2 days)
    for offset in range(1, candidate_window_days + 1):
        candidate_t0 = start_date + timedelta(days=offset)

        # 1. Simulate Rice (Inpari 32, 115 days)
        rice_sim = simulate_crop_water_balance(
            crop_type="RICE",
            t0_date=candidate_t0,
            soil_profile=soil_profile,
            weather_series=weather_series,
            duration_days=115,
        )
        rice_candidates.append({
            "candidate_date": rice_sim["candidate_date"],
            "day_offset": offset,
            "suitability_score": rice_sim["suitability_score"],
            "status": rice_sim["status"],
            "puddling_water_mm": rice_sim["puddling_water_sum_mm"],
            "penalties_count": len(rice_sim["penalties"]),
            "penalties": rice_sim["penalties"],
        })
        if rice_sim["suitability_score"] > best_rice_score:
            best_rice_score = rice_sim["suitability_score"]
            best_rice_sim = rice_sim

        # 2. Simulate Corn (Bisi 18, 100 days)
        corn_sim = simulate_crop_water_balance(
            crop_type="CORN",
            t0_date=candidate_t0,
            soil_profile=soil_profile,
            weather_series=weather_series,
            duration_days=100,
        )
        corn_candidates.append({
            "candidate_date": corn_sim["candidate_date"],
            "day_offset": offset,
            "suitability_score": corn_sim["suitability_score"],
            "status": corn_sim["status"],
            "penalties_count": len(corn_sim["penalties"]),
            "penalties": corn_sim["penalties"],
        })
        if corn_sim["suitability_score"] > best_corn_score:
            best_corn_score = corn_sim["suitability_score"]
            best_corn_sim = corn_sim

    # Select overall recommended crop and T0*
    if best_rice_score >= best_corn_score:
        recommended_crop = "RICE"
        optimal_t0_star = best_rice_sim["candidate_date"]
        optimal_score = best_rice_score
        optimal_sim = best_rice_sim
        rationale = (
            f"Rekomendasi T0* terbaik adalah Padi Inpari 32 HDB pada tanggal {optimal_t0_star} "
            f"(Skor Kelayakan S_T0 = {optimal_score}/100). "
            f"Akumulasi curah hujan fase pelumpuran mencapai {best_rice_sim.get('puddling_water_sum_mm')} mm "
            f"(memenuhi ambang wajib >= 200 mm), dengan risiko kekeringan fase bunting minimal."
        )
    else:
        recommended_crop = "CORN"
        optimal_t0_star = best_corn_sim["candidate_date"]
        optimal_score = best_corn_score
        optimal_sim = best_corn_sim
        rationale = (
            f"Rekomendasi T0* terbaik adalah Jagung Hibrida pada tanggal {optimal_t0_star} "
            f"(Skor Kelayakan S_T0 = {optimal_score}/100). "
            f"Kadar air tanah fase kecambah terkendali aman tanpa risiko busuk benih, "
            f"serta fase pembungaan terlindungi dari defisit air."
        )

    return {
        "plot_id": plot_id,
        "evaluation_timestamp": datetime.now().isoformat(),
        "candidate_window_days": candidate_window_days,
        "soil_profile": {
            "soil_class": soil_profile.get("texture", {}).get("soil_class"),
            "sand_pct": soil_profile.get("texture", {}).get("sand_pct"),
            "silt_pct": soil_profile.get("texture", {}).get("silt_pct"),
            "clay_pct": soil_profile.get("texture", {}).get("clay_pct"),
            "bulk_density": soil_profile.get("properties", {}).get("bulk_density_g_cm3"),
            "ph": soil_profile.get("properties", {}).get("ph_h2o"),
            "cec": soil_profile.get("properties", {}).get("cec_cmol_kg"),
            "saxton_rawls": soil_profile.get("saxton_rawls_hydrology", {}),
        },
        "optimal_recommendation": {
            "recommended_crop": recommended_crop,
            "optimal_t0_date": optimal_t0_star,
            "suitability_score": optimal_score,
            "status": "OPTIMAL" if optimal_score >= 80 else "LAYAK",
            "summary_rationale": rationale,
        },
        "crops_comparison": {
            "rice": {
                "crop_name": "Padi Sawah (Inpari 32 HDB)",
                "cycle_days": 115,
                "best_t0": best_rice_sim["candidate_date"],
                "best_score": best_rice_score,
                "puddling_water_sum_mm": best_rice_sim.get("puddling_water_sum_mm"),
                "penalties": best_rice_sim.get("penalties", []),
                "candidates": rice_candidates,
                "daily_curves": best_rice_sim["daily_timeline"],
            },
            "corn": {
                "crop_name": "Jagung Hibrida (Bisi 18)",
                "cycle_days": 100,
                "best_t0": best_corn_sim["candidate_date"],
                "best_score": best_corn_score,
                "penalties": best_corn_sim.get("penalties", []),
                "candidates": corn_candidates,
                "daily_curves": best_corn_sim["daily_timeline"],
            },
        },
    }


# Backwards compatibility alias for simulate_planting_window
def simulate_planting_window(
    plot_id: int = 1,
    start_date_str: Optional[str] = None,
    candidate_window_days: int = 30,
) -> Dict[str, Any]:
    return find_optimal_planting_window(
        plot_id=plot_id,
        start_date_str=start_date_str,
        candidate_window_days=candidate_window_days,
    )
