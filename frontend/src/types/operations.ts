export type TaskType =
  | 'olah_tanah'
  | 'perbaikan_galengan'
  | 'pelumpuran'
  | 'semai'
  | 'tandur'
  | 'penyiangan'
  | 'pemupukan'
  | 'penyemprotan'
  | 'panen';

export type SaprotanCategory =
  | 'benih'
  | 'pupuk_makro'
  | 'pupuk_mikro'
  | 'pestisida';

export type PestSeverity = 'ringan' | 'sedang' | 'berat';

export type WaterSource = 'irigasi_tersier' | 'pompa_diesel' | 'sumur_dalam';

export interface LaborLog {
  id: number;
  plot_id: number;
  activity_date: string;
  task_type: TaskType;
  labor_count: number;
  hours_worked: number;
  wage_rate_per_day: number;
  is_contract: boolean;
  total_cost: number;
  notes?: string;
  created_at?: string;
}

export interface CreateLaborLogPayload {
  activity_date: string;
  task_type: TaskType;
  labor_count: number;
  hours_worked: number;
  wage_rate_per_day: number;
  is_contract: boolean;
  total_cost?: number;
  notes?: string;
}

export interface IrrigationLog {
  id: number;
  plot_id: number;
  water_source: WaterSource | string;
  water_volume_m3?: number | null;
  pump_duration_hours: number;
  fuel_liters: number;
  fuel_cost: number;
  started_at: string;
  ended_at: string;
  created_at?: string;
}

export interface CreateIrrigationLogPayload {
  water_source: WaterSource | string;
  water_volume_m3?: number | null;
  pump_duration_hours: number;
  fuel_liters: number;
  fuel_cost: number;
  started_at: string;
  ended_at: string;
}

export interface SaprotanItem {
  id: number;
  name: string;
  category: SaprotanCategory;
  active_ingredient: string;
  phi_days: number;
  unit: string;
  unit_cost: number;
  stock_qty: number;
  created_at?: string;
}

export interface CreateSaprotanItemPayload {
  name: string;
  category: SaprotanCategory;
  active_ingredient: string;
  phi_days: number;
  unit: string;
  unit_cost: number;
  stock_qty: number;
}

export interface SaprotanApplication {
  id: number;
  plot_id: number;
  item_id: number;
  item_name?: string;
  category?: SaprotanCategory | string;
  application_date: string;
  quantity_used: number;
  unit?: string;
  unit_cost?: number;
  total_cost: number;
  created_at?: string;
}

export interface ApplySaprotanPayload {
  item_id: number;
  application_date: string;
  target_harvest_date?: string;
  quantity_used: number;
  total_cost?: number;
}

export interface PestScoutingReport {
  id: number;
  plot_id: number;
  observation_date: string;
  pest_type: string;
  severity: PestSeverity;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  action_taken?: string | null;
  created_at?: string;
}

export interface CreatePestScoutingPayload {
  observation_date: string;
  pest_type: string;
  severity: PestSeverity;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  action_taken?: string | null;
}

export interface FinancialSummary {
  plot_id: number;
  plot_name: string;
  area_hectares: number;
  total_labor_cost: number;
  total_irrigation_cost: number;
  total_saprotan_cost: number;
  land_rental_cost: number;
  total_running_cost: number;
  projected_yield_kg: number;
  projected_yield_ton: number;
  projected_hpp_per_kg: number;
  market_reference_price_per_kg: number;
  efficiency_ratio: number;
  efficiency_status: 'optimal' | 'waspada' | 'over_budget';
  target_harvest_date: string;
  cost_breakdown: {
    labor: number;
    saprotan: number;
    irrigation: number;
    land_rental: number;
  };
  labor_logs_count: number;
  irrigation_logs_count: number;
  saprotan_applications_count: number;
}

export interface PostHarvestLog {
  id: number;
  plot_id: number;
  harvest_date: string;
  gross_yield_kg: number;
  moisture_content_pct: number;
  dockage_pct: number;
  net_yield_kg: number;
  standard_moisture_pct: number;
  selling_price_per_kg: number;
  storage_location?: string;
  total_revenue: number;
  total_cost: number;
  net_profit: number;
  roi_pct: number;
  actual_hpp_per_kg: number;
  created_at?: string;
}

export interface HarvestClosingPayload {
  harvest_date: string;
  gross_yield_kg: number;
  moisture_content_pct: number;
  dockage_pct: number;
  selling_price_per_kg: number;
  storage_location?: string;
}

export interface PHIViolationError {
  detail: string;
  error_code: 'PHI_VIOLATION';
  phi_days: number;
  days_remaining_to_harvest: number;
  item_name: string;
}
