"""
Module D: Terrain-Adaptive Variable Rate Nutrition (VRN) Service.
Calculates prescription dosages for Urea and NPK Phonska Plus in Manual Bucket format
(kilograms and 50kg sacks) for Petak Bengkok 1 (0.37 Ha), variety Inpari 32 HDB,
including 3-stage split application (Dasar, Vegetatif, Primordia) and
topographic terrace tier adaptations (Upper, Middle, Lower Tiers).
"""

from datetime import datetime
from typing import Any, Dict, List, Optional


def calculate_vrn_prescription(
    plot_id: int = 1,
    plot_name: str = "Petak Bengkok 1",
    area_ha: float = 0.37,
    crop_variety: str = "Inpari 32 HDB",
    target_yield_ton_ha: float = 7.5,
    current_hst: int = 0
) -> Dict[str, Any]:
    """
    Computes precise fertilizer requirements in Manual Bucket format and split timing.
    """
    # Baseline rate recommendations per Hectare for high-yielding Inpari 32 HDB
    rate_urea_per_ha = 250.0  # kg/ha
    rate_npk_per_ha = 300.0   # kg/ha (NPK Phonska Plus 15-15-15 + Zn)

    # Plot total requirements
    total_urea_kg = round(area_ha * rate_urea_per_ha, 1)  # 92.5 kg
    total_npk_kg = round(area_ha * rate_npk_per_ha, 1)    # 111.0 kg

    # Sacks calculation (50 kg standard agricultural sacks)
    urea_sacks_exact = round(total_urea_kg / 50.0, 2)     # 1.85
    npk_sacks_exact = round(total_npk_kg / 50.0, 2)       # 2.22

    urea_full_sacks = int(total_urea_kg // 50)           # 1 karung
    urea_loose_kg = round(total_urea_kg % 50, 1)          # 42.5 kg

    npk_full_sacks = int(total_npk_kg // 50)             # 2 karung
    npk_loose_kg = round(total_npk_kg % 50, 1)            # 11.0 kg

    # Split Application Schedules (Dasar, Vegetatif, Primordia)
    split_applications = [
        {
            "stage_name": "Aplikasi I: Pupuk Dasar (Basal)",
            "timing_hst": "0 - 7 HST",
            "recommended_timing_label": "Saat Pelumpuran Terakhir / Tanam (0 HST)",
            "urea_pct": 20.0,
            "urea_kg": round(total_urea_kg * 0.20, 1),   # 18.5 kg
            "urea_sacks": 0.37,
            "npk_pct": 50.0,
            "npk_kg": round(total_npk_kg * 0.50, 1),     # 55.5 kg
            "npk_sacks": 1.11,
            "manual_bucket_instruction": (
                "Tabur merata saat penggaruan/pelumpuran akhir (1 hari sebelum tandur) atau maksimal 5 HST. "
                "Takaran: 1 ember besar Urea (~18.5 kg) + 1 karung utuh NPK Phonska Plus 50kg ditambah 5.5 kg ke ember."
            ),
            "agronomic_rationale": "Fosfat (P) dan Seng (Zn) merangsang pertumbuhan akar awal pada tanah liat berdebu Pacitan; Nitrogen rendah untuk mencegah pencucian hara.",
        },
        {
            "stage_name": "Aplikasi II: Vegetatif Aktif (Tillering)",
            "timing_hst": "21 - 25 HST",
            "recommended_timing_label": "Fase Anakan Aktif Maksimum (21 HST)",
            "urea_pct": 40.0,
            "urea_kg": round(total_urea_kg * 0.40, 1),   # 37.0 kg
            "urea_sacks": 0.74,
            "npk_pct": 50.0,
            "npk_kg": round(total_npk_kg * 0.50, 1),     # 55.5 kg
            "npk_sacks": 1.11,
            "manual_bucket_instruction": (
                "Keringkan air petak hingga macak-macak (1-2 cm). "
                "Tabur merata 37 kg Urea (~2 ember besar) + 1 karung 50kg NPK + 5.5 kg. "
                "Biarkan 2 hari sebelum pintu air dibuka kembali."
            ),
            "agronomic_rationale": "Mendorong pembentukan anakan produktif (target 25-30 anakan per rumpun Inpari 32) dan memperkokoh diameter batang bawah.",
        },
        {
            "stage_name": "Aplikasi III: Primordia / Bunting Awal (Panicle Initiation)",
            "timing_hst": "40 - 45 HST",
            "recommended_timing_label": "Inisiasi Pembentukan Malai (42 HST)",
            "urea_pct": 40.0,
            "urea_kg": round(total_urea_kg * 0.40, 1),   # 37.0 kg
            "urea_sacks": 0.74,
            "npk_pct": 0.0,
            "npk_kg": 0.0,
            "npk_sacks": 0.0,
            "manual_bucket_instruction": (
                "Tabur 37 kg Urea (~2 ember besar) saat embun pagi telah kering (pukul 09.00 - 11.00) "
                "agar butiran pupuk tidak menempel pada pelepah daun."
            ),
            "agronomic_rationale": "Memaksimalkan pengisian jumlah gabah per malai dan bobot 1.000 butir (varietas Inpari 32 mencapai 27-28 gram/1000 butir).",
        },
    ]

    # Topographic / Terrace-Adaptive VRN Variations (3 Tiers of Bengkok 1)
    # Upper Tier loses nutrients to runoff (+10% N)
    # Middle Tier is baseline (100% N)
    # Lower Tier accumulates runoff nutrient sedimentation (-10% N to prevent lodging / blast)
    terrace_tiers_vrn = [
        {
            "tier_name": "Undakan 1 (Kedok Atas)",
            "area_ha": 0.11,
            "elevation_mdpl": 150.5,
            "topographic_behavior": "Zona Pelindian / Erosi Limpasan",
            "adjustment_factor": 1.10,
            "urea_prescribed_kg": round(0.11 * (rate_urea_per_ha * 1.10), 1),  # 30.2 kg
            "npk_prescribed_kg": round(0.11 * rate_npk_per_ha, 1),            # 33.0 kg
            "guidance": "Dosis Urea ditingkatkan +10% guna mengkompensasi hara larut yang terbawa limpasan gravitasi ke undakan bawah."
        },
        {
            "tier_name": "Undakan 2 (Kedok Tengah)",
            "area_ha": 0.14,
            "elevation_mdpl": 146.5,
            "topographic_behavior": "Zona Stabil / Retensi Normal",
            "adjustment_factor": 1.00,
            "urea_prescribed_kg": round(0.14 * rate_urea_per_ha, 1),           # 35.0 kg
            "npk_prescribed_kg": round(0.14 * rate_npk_per_ha, 1),            # 42.0 kg
            "guidance": "Dosis acuan standar agronomi (100%)."
        },
        {
            "tier_name": "Undakan 3 (Kedok Bawah)",
            "area_ha": 0.12,
            "elevation_mdpl": 142.2,
            "topographic_behavior": "Zona Sedimentasi Hara",
            "adjustment_factor": 0.90,
            "urea_prescribed_kg": round(0.12 * (rate_urea_per_ha * 0.90), 1),  # 27.0 kg
            "npk_prescribed_kg": round(0.12 * rate_npk_per_ha, 1),            # 36.0 kg
            "guidance": "Dosis Urea dikurangi -10% untuk mencegah kelebihan vegetatif, rebah tanaman, dan serangan penyakit kresek (Xanthomonas oryzae)."
        },
    ]

    return {
        "plot_id": plot_id,
        "plot_name": plot_name,
        "area_ha": area_ha,
        "crop_variety": crop_variety,
        "target_yield_ton_ha": target_yield_ton_ha,
        "current_hst": current_hst,
        "macro_totals": {
            "urea": {
                "total_kg": total_urea_kg,
                "sacks_50kg_exact": urea_sacks_exact,
                "full_sacks": urea_full_sacks,
                "loose_kg": urea_loose_kg,
                "manual_bucket_display": f"{urea_full_sacks} Karung (50 kg) + {urea_loose_kg} kg Ember Curah",
                "grade": "Urea Prill 46% Nitrogen (Subsidi / Non-Subsidi Petrokimia)",
            },
            "npk": {
                "total_kg": total_npk_kg,
                "sacks_50kg_exact": npk_sacks_exact,
                "full_sacks": npk_full_sacks,
                "loose_kg": npk_loose_kg,
                "manual_bucket_display": f"{npk_full_sacks} Karung (50 kg) + {npk_loose_kg} kg Ember Curah",
                "grade": "NPK Phonska Plus 15-15-15 (+9S +2000ppm Zn)",
            },
        },
        "split_applications": split_applications,
        "terrace_tiers_vrn": terrace_tiers_vrn,
        "operational_cost_estimate_idr": {
            "urea_idr": int(total_urea_kg * 3500),      # ~Rp 323.750
            "npk_idr": int(total_npk_kg * 4500),        # ~Rp 499.500
            "total_saprotan_pupuk_idr": int(total_urea_kg * 3500 + total_npk_kg * 4500), # ~Rp 823.250
        },
        "generated_at": datetime.now().isoformat(),
    }
