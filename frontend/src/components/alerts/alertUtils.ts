import { api } from "@/lib/api";
import {
  AlertItem,
  AlertListResponse,
  AlertSeverity,
  AlertUnreadCountResponse,
} from "@/types";

/**
 * Format tanggal ISO ke waktu relatif ramah Bahasa Indonesia
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) {
      return "Baru saja";
    }
    if (diffMin < 60) {
      return `${diffMin} menit yang lalu`;
    }
    if (diffHour < 24) {
      return `${diffHour} jam yang lalu`;
    }
    if (diffDay === 1) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `Kemarin, ${hours}:${minutes} WIB`;
    }
    if (diffDay < 7) {
      return `${diffDay} hari yang lalu`;
    }

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB";
  } catch {
    return dateString;
  }
}

/**
 * Definisi konfigurasi visual per tingkat keparahan (Severity)
 */
export interface SeverityConfig {
  key: AlertSeverity | string;
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconColor: string;
  accentBorder: string;
  recomBg: string;
  recomBorder: string;
  dotBg: string;
  emoji: string;
}

export function getSeverityConfig(severity: string): SeverityConfig {
  const s = (severity || "").toLowerCase();
  switch (s) {
    case "merah":
    case "critical":
    case "kritis":
    case "berat":
      return {
        key: "merah",
        label: "CRITICAL (Kritis / Hama)",
        shortLabel: "CRITICAL",
        badgeBg: "bg-rose-100",
        badgeText: "text-rose-800",
        badgeBorder: "border-rose-200",
        iconColor: "text-rose-600",
        accentBorder: "border-l-rose-500",
        recomBg: "bg-rose-50/70",
        recomBorder: "border-rose-100",
        dotBg: "bg-rose-500",
        emoji: "🔴",
      };
    case "oranye":
    case "warning":
    case "waspada":
    case "sedang":
      return {
        key: "oranye",
        label: "WARNING (Cekaman Air / Waspada)",
        shortLabel: "WARNING",
        badgeBg: "bg-orange-100",
        badgeText: "text-orange-800",
        badgeBorder: "border-orange-200",
        iconColor: "text-orange-600",
        accentBorder: "border-l-orange-500",
        recomBg: "bg-orange-50/70",
        recomBorder: "border-orange-100",
        dotBg: "bg-orange-500",
        emoji: "🟠",
      };
    case "kuning":
      return {
        key: "kuning",
        label: "WARNING (Defisiensi Nitrogen)",
        shortLabel: "WARNING",
        badgeBg: "bg-amber-100",
        badgeText: "text-amber-800",
        badgeBorder: "border-amber-200",
        iconColor: "text-amber-600",
        accentBorder: "border-l-amber-500",
        recomBg: "bg-amber-50/70",
        recomBorder: "border-amber-100",
        dotBg: "bg-amber-500",
        emoji: "🟡",
      };
    case "hijau_tua":
    case "info":
    case "informasi":
    case "ringan":
      return {
        key: "hijau_tua",
        label: "INFO (Siap Panen / Informasi)",
        shortLabel: "INFO",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-800",
        badgeBorder: "border-emerald-200",
        iconColor: "text-emerald-600",
        accentBorder: "border-l-emerald-600",
        recomBg: "bg-emerald-50/70",
        recomBorder: "border-emerald-100",
        dotBg: "bg-emerald-600",
        emoji: "🟢",
      };
    default:
      return {
        key: severity || "info",
        label: severity ? `INFO (${severity})` : "INFO",
        shortLabel: "INFO",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-800",
        badgeBorder: "border-slate-200",
        iconColor: "text-slate-600",
        accentBorder: "border-l-slate-400",
        recomBg: "bg-slate-50",
        recomBorder: "border-slate-100",
        dotBg: "bg-slate-400",
        emoji: "ℹ️",
      };
  }
}

/**
 * Label tipe anomali agronomi
 */
export function getAlertTypeLabel(alertType: string): string {
  switch (alertType) {
    case "nitrogen_stress":
      return "Defisiensi Nitrogen";
    case "water_stress":
      return "Cekaman Air";
    case "pest_anomaly":
      return "Anomali Hama / Penyakit";
    case "harvest_ready":
      return "Siap Panen";
    default:
      return alertType;
  }
}

// -------------------------------------------------------------
// API Client Functions for Alerts
// -------------------------------------------------------------

export async function getAlertUnreadCount(estateId?: number): Promise<AlertUnreadCountResponse> {
  const params: Record<string, any> = {};
  if (estateId) params.estate_id = estateId;
  const res = await api.get<AlertUnreadCountResponse>("/alerts/unread-count", { params });
  return res.data;
}

export async function getRecentAlerts(limit = 20, estateId?: number): Promise<AlertItem[]> {
  const params: Record<string, any> = { limit };
  if (estateId) params.estate_id = estateId;
  const res = await api.get<AlertItem[]>("/alerts/recent", { params });
  return res.data;
}

export interface AlertFilterParams {
  estate_id?: number;
  severity?: string;
  alert_type?: string;
  is_resolved?: boolean;
  is_read?: boolean;
  page?: number;
  page_size?: number;
}

export async function getAlertsList(params?: AlertFilterParams): Promise<AlertListResponse> {
  const res = await api.get<AlertListResponse>("/alerts", { params });
  return res.data;
}

export async function getPlotAlerts(plotId: number, isResolved?: boolean): Promise<AlertItem[]> {
  const params: Record<string, any> = {};
  if (isResolved !== undefined) params.is_resolved = isResolved;
  const res = await api.get<AlertItem[]>(`/plots/${plotId}/alerts`, { params });
  return res.data;
}

export async function markAlertAsRead(alertId: number): Promise<AlertItem> {
  const res = await api.put<AlertItem>(`/alerts/${alertId}/read`);
  return res.data;
}

export async function resolveAlert(alertId: number): Promise<AlertItem> {
  const res = await api.put<AlertItem>(`/alerts/${alertId}/resolve`);
  return res.data;
}
