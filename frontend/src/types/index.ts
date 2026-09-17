export interface HealthCheckResponse {
  status: string;
  database: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: string;
}

// -------------------------------------------------------------
// Organization Hierarchy Types (Company -> Estate -> Division)
// -------------------------------------------------------------

export interface Company {
  id: number;
  name: string;
  address?: string | null;
  created_at: string;
  estate_count: number;
  division_count: number;
  petak_count: number;
  estates?: Estate[];
}

export interface CompanyCreateRequest {
  name: string;
  address?: string;
}

export interface CompanyUpdateRequest {
  name?: string;
  address?: string;
}

export interface Estate {
  id: number;
  company_id: number;
  name: string;
  province?: string | null;
  kabupaten?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  division_count: number;
  petak_count: number;
  company_name?: string | null;
  divisions?: Division[];
}

export interface EstateCreateRequest {
  company_id?: number;
  name: string;
  province?: string;
  kabupaten?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface EstateUpdateRequest {
  company_id?: number;
  name?: string;
  province?: string;
  kabupaten?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Division {
  id: number;
  estate_id: number;
  name: string;
  created_at: string;
  petak_count: number;
  estate_name?: string | null;
  company_id?: number | null;
  company_name?: string | null;
}

export interface DivisionCreateRequest {
  estate_id?: number;
  name: string;
}

export interface DivisionUpdateRequest {
  estate_id?: number;
  name?: string;
}

// -------------------------------------------------------------
// Variety & Phenology Phase Types
// -------------------------------------------------------------

export interface PhenologyPhase {
  id: number;
  variety_id: number;
  phase_code: string;
  phase_name: string;
  hst_start: number;
  hst_end: number;
  ndvi_expected_min: number;
  ndvi_expected_max: number;
  ndre_threshold: number;
  kc_value: number;
  gdd_target: number;
  created_at: string;
}

export interface PhenologyPhaseCreateRequest {
  phase_code: string;
  phase_name: string;
  hst_start: number;
  hst_end: number;
  ndvi_expected_min: number;
  ndvi_expected_max: number;
  ndre_threshold: number;
  kc_value: number;
  gdd_target: number;
}

export interface PhenologyPhaseUpdateRequest {
  phase_code?: string;
  phase_name?: string;
  hst_start?: number;
  hst_end?: number;
  ndvi_expected_min?: number;
  ndvi_expected_max?: number;
  ndre_threshold?: number;
  kc_value?: number;
  gdd_target?: number;
}

export interface CropVariety {
  id: number;
  crop_type: "padi" | "jagung";
  name: string;
  cycle_days: number;
  t_base: number;
  created_at: string;
  phases: PhenologyPhase[];
}

export interface CropVarietyCreateRequest {
  crop_type: "padi" | "jagung";
  name: string;
  cycle_days: number;
  t_base?: number;
  phases?: PhenologyPhaseCreateRequest[];
}

export interface CropVarietyUpdateRequest {
  crop_type?: "padi" | "jagung";
  name?: string;
  cycle_days?: number;
  t_base?: number;
}

// -------------------------------------------------------------
// Agricultural Plot / Petak Lahan Types
// -------------------------------------------------------------

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface Plot {
  id: number;
  division_id: number;
  variety_id?: number | null;
  name: string;
  polygon: GeoJSONPolygon;
  area_hectares: number;
  planting_date?: string | null;
  crop_type: "padi" | "jagung";
  current_phase?: string | null;
  current_hst: number;
  created_at: string;
  division_name?: string | null;
  estate_id?: number | null;
  estate_name?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  variety_name?: string | null;
}

export type PlotResponse = Plot;

export interface PlotCreateRequest {
  division_id?: number;
  variety_id?: number | null;
  name: string;
  polygon: GeoJSONPolygon | number[][][] | number[][];
  crop_type: "padi" | "jagung";
  planting_date?: string | null;
  current_phase?: string | null;
}

export interface PlotUpdateRequest {
  division_id?: number;
  variety_id?: number | null;
  name?: string;
  polygon?: GeoJSONPolygon | number[][][] | number[][];
  crop_type?: "padi" | "jagung";
  planting_date?: string | null;
  current_phase?: string | null;
}

export interface PlotGeoJSONFeature {
  type: "Feature";
  id: number;
  geometry: GeoJSONPolygon;
  properties: {
    id: number;
    name: string;
    crop_type: "padi" | "jagung";
    variety_id?: number | null;
    variety_name?: string | null;
    area_hectares: number;
    planting_date?: string | null;
    current_hst: number;
    current_phase?: string | null;
    division_id: number;
    division_name?: string | null;
    estate_id?: number | null;
    estate_name?: string | null;
    company_id?: number | null;
    company_name?: string | null;
    created_at?: string | null;
  };
}

export interface PlotGeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: PlotGeoJSONFeature[];
}

export interface PlotSummary {
  total_plots: number;
  total_area_hectares: number;
  padi_plots: number;
  padi_area_hectares: number;
  jagung_plots: number;
  jagung_area_hectares: number;
  phases_summary: Record<string, number>;
}

export interface PlotDetail {
  id: number;
  name: string;
  area_hectares: number;
  crop_type: "padi" | "jagung" | string;
  planting_date?: string | null;
  current_hst: number;
  current_phase?: string | null;
  division_id: number;
  division_name?: string | null;
  estate_id?: number | null;
  estate_name?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  polygon?: GeoJSONPolygon | null;

  // Varietas & Target GDD
  variety_id?: number | null;
  variety_name?: string | null;
  cycle_days?: number | null;
  t_base?: number | null;
  gdd_target_total?: number | null;

  // Data GDD & Prediksi Panen
  gdd_cumulative: number;
  gdd_progress_pct: number;
  remaining_gdd: number;
  predicted_harvest_date?: string | null;
  estimated_days_to_harvest?: number | null;
  etc_today?: number | null;
  et0_today?: number | null;
  kc_active?: number | null;

  // Timeline Fase Fenologi
  phases_timeline: PhaseProgressItem[];

  // Observasi Satelit Terbaru
  latest_ndvi?: number | null;
  latest_ndre?: number | null;
  latest_ndwi?: number | null;
  latest_savi?: number | null;
  latest_bsi?: number | null;
  sar_vv_db?: number | null;
  sar_vh_db?: number | null;
  observation_date?: string | null;
  is_flooded?: boolean | null;
  vegetation_health?: string | null;
}

export type PlotDetailResponse = PlotDetail;


// -------------------------------------------------------------
// Planting Season / Musim Tanam Types
// -------------------------------------------------------------

export interface PlantingSeason {
  id: number;
  plot_id: number;
  variety_id?: number | null;
  variety_name?: string | null;
  crop_type?: string | null;
  planting_date: string;
  harvest_date?: string | null;
  status: "active" | "harvested" | "failed" | string;
  yield_estimate_ton_per_ha?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface PlantingSeasonCreateRequest {
  variety_id: number;
  planting_date: string;
  yield_estimate_ton_per_ha?: number | null;
  notes?: string | null;
}

export interface PlantingSeasonUpdateRequest {
  status?: "active" | "harvested" | "failed" | string;
  harvest_date?: string | null;
  yield_estimate_ton_per_ha?: number | null;
  notes?: string | null;
}

// -------------------------------------------------------------
// Satellite Remote Sensing & Spectral Indices Types (Tiket 07)
// -------------------------------------------------------------

export interface SpectralIndex {
  id: number;
  plot_id: number;
  observation_date: string;
  satellite: "sentinel-2" | "sentinel-1" | string;
  ndvi?: number | null;
  ndre?: number | null;
  ndwi?: number | null;
  savi?: number | null;
  bsi?: number | null;
  sar_vv_db?: number | null;
  sar_vh_db?: number | null;
  cloud_cover_pct?: number | null;
  created_at: string;
  is_flooded: boolean;
  vegetation_health: string;
}

export interface SpectralIndexListResponse {
  plot_id: number;
  total: number;
  items: SpectralIndex[];
}

export interface SatelliteJobResponse {
  status: "success" | "partial_success" | "error" | string;
  message: string;
  plots_processed: number;
  records_created: number;
  errors: string[];
}

// -------------------------------------------------------------
// Timeline Slider & Satellite Tile Overlay (Tiket 15)
// -------------------------------------------------------------

export interface EstateIndicesTimeline {
  estate_id: number;
  estate_name: string;
  dates: string[];
  timeline: Record<string, Record<string, number | null>>;
}

export interface SatelliteTileInfo {
  plot_id?: number | null;
  tile_url: string;
  vis_type: "true_color" | "false_color" | string;
  observation_date?: string | null;
  attribution: string;
  bands: string[];
  min_val: number;
  max_val: number;
  label?: string | null;
}


// -------------------------------------------------------------
// Dashboard NDVI Heatmap Types (Tiket 11)
// -------------------------------------------------------------

export interface EstateDashboardPlotItem {
  id: number;
  name: string;
  crop_type: "padi" | "jagung";
  variety_name?: string | null;
  current_phase?: string | null;
  current_hst: number;
  area_hectares: number;
  polygon: GeoJSONPolygon;
  latest_ndvi?: number | null;
  ndvi_status: "Kritis" | "Waspada" | "Baik" | "Sangat Baik" | "Belum Ada Data" | string;
  active_alert_count: number;
}

export interface EstateDashboardSummary {
  estate_id: number;
  estate_name: string;
  total_plots: number;
  total_area_ha: number;
  avg_ndvi?: number | null;
  plots_needing_attention: number;
  plots: EstateDashboardPlotItem[];
}

// -------------------------------------------------------------
// GDD & Phenology Prediction Types (Tiket 09)
// -------------------------------------------------------------

export interface GddRecord {
  id: number;
  plot_id: number;
  observation_date: string;
  gdd_daily: number;
  gdd_cumulative: number;
  etc_mm?: number | null;
  predicted_phase?: string | null;
  predicted_harvest_date?: string | null;
  created_at: string;
}

export interface GddListResponse {
  plot_id: number;
  total: number;
  items: GddRecord[];
}

export interface PhaseProgressItem {
  phase_code: string;
  phase_name: string;
  hst_start: number;
  hst_end: number;
  gdd_target: number;
  kc_value: number;
  status: "completed" | "active" | "upcoming" | string;
}

export interface PlotPredictionResponse {
  plot_id: number;
  plot_name: string;
  crop_type: "padi" | "jagung" | string;
  variety_id?: number | null;
  variety_name?: string | null;
  planting_date?: string | null;
  current_hst: number;
  current_phase?: string | null;
  gdd_cumulative: number;
  gdd_target_total: number;
  gdd_progress_pct: number;
  remaining_gdd: number;
  predicted_harvest_date?: string | null;
  estimated_days_to_harvest?: number | null;
  latest_etc_mm?: number | null;
  phases_timeline: PhaseProgressItem[];
}

export interface GddJobResponse {
  status: "success" | "partial_success" | "error" | string;
  message: string;
  plots_processed: number;
  records_created: number;
  errors: string[];
}

// -------------------------------------------------------------
// Weather & Evapotranspiration (ET₀) Types (Tiket 08 & 14)
// -------------------------------------------------------------

export interface WeatherDataItem {
  id: number;
  estate_id: number;
  observation_date: string;
  temp_max_c?: number | null;
  temp_min_c?: number | null;
  humidity_pct?: number | null;
  wind_speed_ms?: number | null;
  solar_radiation_mjm2?: number | null;
  rainfall_mm?: number | null;
  et0_mm?: number | null;
  is_forecast: boolean;
  created_at?: string;
}

export type WeatherDataResponse = WeatherDataItem;

export interface WeatherCurrentResponse {
  estate_id: number;
  estate_name?: string | null;
  observation_date: string;
  is_forecast: boolean;
  temp_max_c?: number | null;
  temp_min_c?: number | null;
  temp_mean_c?: number | null;
  humidity_pct?: number | null;
  wind_speed_ms?: number | null;
  solar_radiation_mjm2?: number | null;
  rainfall_mm?: number | null;
  et0_mm?: number | null;
  condition_text?: string | null;
  weather_record?: WeatherDataItem | null;
}

export interface WeatherForecastResponse {
  estate_id: number;
  estate_name?: string | null;
  total_days: number;
  items: WeatherDataItem[];
}

export interface WeatherFetchJobResponse {
  status: string;
  message: string;
  estates_processed: number;
  records_synced: number;
  errors: string[];
}
// -------------------------------------------------------------
// Agronomic Anomaly Alerts & Notifications Types (Tiket 10 & 12)
// -------------------------------------------------------------

export type AlertSeverity = "kuning" | "oranye" | "merah" | "hijau_tua";

export type AlertType =
  | "nitrogen_stress"
  | "water_stress"
  | "pest_anomaly"
  | "harvest_ready";

export interface AlertItem {
  id: number;
  plot_id: number;
  alert_type: AlertType | string;
  severity: AlertSeverity | string;
  title: string;
  description: string;
  recommendation: string;
  trigger_values?: Record<string, any> | null;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  resolved_at?: string | null;
  plot_name?: string | null;
  crop_type?: string | null;
  estate_id?: number | null;
  estate_name?: string | null;
}

export type AlertResponse = AlertItem;

export interface AlertListResponse {
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: AlertItem[];
}

export interface AlertUnreadCountResponse {
  total_unread: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
}

export interface AlertEvaluationJobResponse {
  status: "success" | "warning" | "error" | string;
  message: string;
  plots_evaluated: number;
  alerts_created: number;
  errors: string[];
}

// -------------------------------------------------------------
// Reporting & Data Export Types (Tiket 16)
// -------------------------------------------------------------

export interface GeneratedReportArchive {
  id: number;
  estate_id: number;
  estate_name?: string | null;
  report_type: "health" | "harvest_prediction" | "water_usage" | "timeseries_csv" | string;
  title: string;
  file_name: string;
  file_size_bytes: number;
  period_start?: string | null;
  period_end?: string | null;
  created_at: string;
  download_url?: string | null;
}

export interface SeasonComparisonMetric {
  season_id: number;
  plot_id: number;
  plot_name: string;
  variety_name?: string | null;
  crop_type: string;
  status: string;
  planting_date: string;
  harvest_date?: string | null;
  duration_days: number;
  yield_ton_per_ha?: number | null;
  avg_ndvi?: number | null;
  peak_ndvi?: number | null;
  avg_ndre?: number | null;
  avg_ndwi?: number | null;
  total_rainfall_mm?: number | null;
  total_gdd?: number | null;
  total_alerts: number;
  notes?: string | null;
}

export interface SeasonComparisonResponse {
  plot_id: number;
  plot_name: string;
  crop_type: string;
  area_hectares: number;
  current_season?: SeasonComparisonMetric | null;
  historical_seasons: SeasonComparisonMetric[];
  comparison_insights: string[];
}

// -------------------------------------------------------------
// Geospatial Import Types (Wave 7)
// -------------------------------------------------------------

export interface PlotImportPreviewResponse {
  name: string;
  format: "KML" | "KMZ" | "GeoJSON" | string;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  area_hectares: number;
  area_m2: number;
  bounding_box: [number, number, number, number];
  centroid: [number, number];
  vertex_count: number;
  warnings: string[];
}

// -------------------------------------------------------------
// Batch Geospatial Import & Bulk Registration Types (Wave 8)
// -------------------------------------------------------------

export interface PlotBatchItemPreview {
  name: string;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  area_hectares: number;
  area_m2: number;
  vertex_count: number;
  bounding_box: [number, number, number, number];
  centroid: [number, number];
  is_valid: boolean;
  warnings: string[];
}

export interface PlotBatchImportPreviewResponse {
  format: "KML" | "KMZ" | "GeoJSON" | string;
  total_plots: number;
  total_area_hectares: number;
  total_area_m2: number;
  unified_bounding_box: [number, number, number, number];
  plots: PlotBatchItemPreview[];
}

export interface PlotBatchCreateItem {
  name: string;
  variety_id?: number | null;
  crop_type: "padi" | "jagung";
  planting_date?: string | null;
  polygon: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface PlotBatchCreateRequest {
  division_id: number;
  plots: PlotBatchCreateItem[];
}

export interface PlotBatchCreateResponse {
  created_count: number;
  failed_count: number;
  total_area_hectares: number;
  plot_ids: number[];
  errors: string[];
}



