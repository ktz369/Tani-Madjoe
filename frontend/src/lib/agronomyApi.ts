/**
 * Digital Agronomy Engine API Client (DAG-07 & DAG-08).
 * Connectors for SoilGrids & Saxton-Rawls, Planting Window FAO-56 forward simulation,
 * Cascading Hydrology for terraced plots, Sentinel-1 SAR, and Terrain-Adaptive VRN.
 */

import { api } from "./api";

export interface SoilCharacteristicsData {
  plot_id: number;
  location?: { lat: number; lon: number; regency?: string };
  depth_interval: string;
  texture: {
    sand_pct: number;
    silt_pct: number;
    clay_pct: number;
    soil_class: string;
  };
  properties: {
    bulk_density_g_cm3: number;
    ph_h2o: number;
    cec_cmol_kg: number;
    organic_matter_pct: number;
  };
  saxton_rawls_hydrology: {
    theta_pwp: number;
    theta_fc: number;
    theta_sat: number;
    awc_volumetric: number;
    root_depth_mm: number;
    awc_mm: number;
    drainable_porosity?: number;
  };
  source: string;
  status: string;
}

export interface CandidateSimulation {
  candidate_date: string;
  suitability_score: number;
  status: string;
  penalties: string[];
  puddling_water_mm?: number | null;
}

export interface DailySimulationStep {
  hst: number;
  date: string;
  soil_moisture_mm: number;
  ponded_water_mm: number;
  precipitation_mm: number;
  etc_mm: number;
  moisture_pct_awc: number;
}

export interface CropSimulationDetail {
  crop_name: string;
  duration_days: number;
  best_t0: string;
  best_score: number;
  candidates: CandidateSimulation[];
  timeline_simulation: DailySimulationStep[];
}

export interface PlantingWindowSimulationResponse {
  plot_id: number;
  evaluation_timestamp: string;
  soil_profile: {
    soil_class: string;
    awc_mm: number;
    clay_pct: number;
    bulk_density: number;
  };
  optimal_recommendation: {
    recommended_crop: "RICE" | "CORN";
    optimal_t0_date: string;
    suitability_score: number;
    summary_rationale: string;
  };
  crops_comparison: {
    rice: CropSimulationDetail;
    corn: CropSimulationDetail;
  };
}

export interface TierWaterBalance {
  tier_id: number;
  tier_name: string;
  elevation_m: number;
  area_m2: number;
  initial_depth_mm: number;
  precipitation_mm: number;
  runoff_upper_tier_mm: number;
  inflow_from_upper_tier_mm: number;
  total_water_input_mm: number;
  etc_mm: number;
  infiltration_mm: number;
  final_water_depth_mm: number;
  spillover_runoff_mm: number;
  flood_risk_level: string;
}

export interface SluiceGateStep {
  tier_id: number;
  tier_name: string;
  elevation_m: number;
  gate_aperture_pct: number;
  gate_status: string;
  target_discharge_lps: number;
  projected_water_depth_mm: number;
  flood_risk_level: string;
  priority_order: number;
  action_notes: string;
}

export interface TerraceWaterBalanceResponse {
  plot_id: number;
  slope_pct: number;
  num_tiers: number;
  water_balance: {
    plot_name: string;
    num_tiers: number;
    slope_pct: number;
    precipitation_mm: number;
    etc_mm: number;
    total_inflow_volume_m3: number;
    total_drainage_volume_m3: number;
    total_stored_volume_m3: number;
    max_water_depth_mm: number;
    peak_flood_tier_id: number;
    overall_flood_risk: string;
    tiers: TierWaterBalance[];
  };
  sluice_schedule: {
    plot_name: string;
    forecast_rainfall_mm: number;
    slope_pct: number;
    schedule_phase: string;
    urgency_level: string;
    strategy_description: string;
    gate_steps: SluiceGateStep[];
  };
}

export interface SplitApplication {
  stage_name: string;
  timing_hst: string;
  recommended_timing_label: string;
  urea_pct: number;
  urea_kg: number;
  urea_sacks: number;
  npk_pct: number;
  npk_kg: number;
  npk_sacks: number;
  manual_bucket_instruction: string;
  agronomic_rationale: string;
}

export interface TerraceTierVRN {
  tier_name: string;
  area_ha: number;
  elevation_mdpl: number;
  topographic_behavior: string;
  adjustment_factor: number;
  urea_prescribed_kg: number;
  npk_prescribed_kg: number;
  guidance: string;
}

export interface VRNPrescriptionResponse {
  plot_id: number;
  plot_name: string;
  area_ha: number;
  crop_variety: string;
  target_yield_ton_ha: number;
  current_hst: number;
  macro_totals: {
    urea: {
      total_kg: number;
      sacks_50kg_exact: number;
      full_sacks: number;
      loose_kg: number;
      manual_bucket_display: string;
      grade: string;
    };
    npk: {
      total_kg: number;
      sacks_50kg_exact: number;
      full_sacks: number;
      loose_kg: number;
      manual_bucket_display: string;
      grade: string;
    };
  };
  split_applications: SplitApplication[];
  terrace_tiers_vrn: TerraceTierVRN[];
  operational_cost_estimate_idr: {
    urea_idr: number;
    npk_idr: number;
    total_saprotan_pupuk_idr: number;
  };
  generated_at: string;
}

export interface SARTelemetryResponse {
  plot_id: number;
  sensor: string;
  optical_cloud_cover_pct: number;
  radar_status: string;
  telemetry: {
    sar_vv_db: number;
    sar_vh_db: number;
    ratio_db: number;
    ratio_linear: number;
    rvi: number;
    estimated_wet_biomass_ton_ha: number;
    soil_wetness_index: number;
    soil_wetness_status: string;
    canopy_status: string;
  };
  spectral_unmixing: {
    inward_buffer_meters: number;
    pure_canopy_purity_pct: number;
    edge_grass_contamination_rejected_pct: number;
  };
}

export const agronomyApi = {
  getSoilCharacteristics: async (plotId: number): Promise<SoilCharacteristicsData> => {
    const res = await api.get<SoilCharacteristicsData>(`/agronomy/soil-characteristics/${plotId}`);
    return res.data;
  },

  simulatePlantingWindow: async (
    plotId: number,
    startDate?: string,
    candidateDays: number = 25
  ): Promise<PlantingWindowSimulationResponse> => {
    const res = await api.post<PlantingWindowSimulationResponse>("/agronomy/planting-window/simulate", {
      plot_id: plotId,
      start_date: startDate,
      candidate_window_days: candidateDays,
    });
    return res.data;
  },

  getWaterBalance: async (
    plotId: number,
    precipitationMm: number = 28.5,
    etcMm: number = 4.2
  ): Promise<TerraceWaterBalanceResponse> => {
    const res = await api.get<TerraceWaterBalanceResponse>(`/agronomy/plots/${plotId}/water-balance`, {
      params: { precipitation_mm: precipitationMm, etc_mm: etcMm },
    });
    return res.data;
  },

  getVRN: async (plotId: number): Promise<VRNPrescriptionResponse> => {
    const res = await api.get<VRNPrescriptionResponse>(`/agronomy/plots/${plotId}/vrn`);
    return res.data;
  },

  getSAR: async (plotId: number): Promise<SARTelemetryResponse> => {
    const res = await api.get<SARTelemetryResponse>(`/agronomy/plots/${plotId}/sar`);
    return res.data;
  },

  getDroneKmlDownloadUrl: (plotId: number): string => {
    return `/api/agronomy/plots/${plotId}/drone-mission.kml`;
  },
};
