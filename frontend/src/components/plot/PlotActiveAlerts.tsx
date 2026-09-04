"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { AlertItem, AlertSeverity } from "@/types";

interface PlotActiveAlertsProps {
  plotId: number;
  plotName: string;
}

export default function PlotActiveAlerts({ plotId, plotName }: PlotActiveAlertsProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filterResolved, setFilterResolved] = useState<boolean>(false);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const url = filterResolved
        ? `/plots/${plotId}/alerts`
        : `/plots/${plotId}/alerts?is_resolved=false`;
      const res = await api.get<AlertItem[]>(url);
      setAlerts(res.data || []);
    } catch (err) {
      console.error("Gagal memuat alert petak:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (plotId) {
      fetchAlerts();
    }
  }, [plotId, filterResolved]);

  const handleMarkAsRead = async (alertId: number) => {
    try {
      setUpdatingId(alertId);
      await api.put(`/alerts/${alertId}/read`);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a))
      );
    } catch (err) {
      console.error("Gagal menandai alert dibaca:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    try {
      setUpdatingId(alertId);
      await api.put(`/alerts/${alertId}/resolve`);
      if (!filterResolved) {
        // Remove from active view
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      } else {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, is_resolved: true, is_read: true } : a
          )
        );
      }
    } catch (err) {
      console.error("Gagal menyelesaikan alert:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "merah":
        return {
          bg: "bg-rose-50 border-rose-200 text-rose-800",
          badge: "bg-rose-600 text-white",
          icon: <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />,
          label: "Kritis (Merah)",
        };
      case "oranye":
        return {
          bg: "bg-amber-50 border-amber-200 text-amber-900",
          badge: "bg-amber-600 text-white",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
          label: "Perhatian (Oranye)",
        };
      case "kuning":
        return {
          bg: "bg-yellow-50 border-yellow-200 text-yellow-900",
          badge: "bg-yellow-500 text-slate-900",
          icon: <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />,
          label: "Waspada (Kuning)",
        };
      case "hijau_tua":
        return {
          bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
          badge: "bg-emerald-700 text-white",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
          label: "Siap Panen (Hijau Tua)",
        };
      default:
        return {
          bg: "bg-slate-50 border-slate-200 text-slate-800",
          badge: "bg-slate-600 text-white",
          icon: <Info className="w-4 h-4 text-slate-600 shrink-0" />,
          label: severity || "Informasi",
        };
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      {/* Header & Filter Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Peringatan Dini & Anomali Petak
              </h3>
              {!loading && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  {alerts.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Notifikasi anomali vegetasi, stres air, indikasi hama, dan kesiapan panen petak {plotName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setFilterResolved(!filterResolved)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filterResolved
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {filterResolved ? "Semua Riwayat" : "Hanya Yang Aktif"}
          </button>
          <button
            type="button"
            onClick={fetchAlerts}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-50"
            title="Muat ulang daftar alert"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Alert List */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
          <span className="text-xs font-medium">Memuat data peringatan...</span>
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-6 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center text-emerald-900 flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm">Tidak Ada Peringatan Aktif</h4>
          <p className="text-xs text-emerald-700/80 mt-1 max-w-md">
            Kondisi agronomi, kadar air, klorofil, dan biomassa petak saat ini berada dalam batas normal.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((item) => {
            const sev = getSeverityBadge(item.severity);
            const isBusy = updatingId === item.id;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-all ${sev.bg} ${
                  item.is_resolved ? "opacity-75 bg-slate-50 border-slate-200" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{sev.icon}</div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${sev.badge}`}
                        >
                          {sev.label}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                        {!item.is_read && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Belum dibaca" />
                        )}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Rekomendasi Tindakan Agronomi */}
                      {item.recommendation && (
                        <div className="bg-white/80 border border-slate-200/60 rounded-lg p-2.5 mt-2 text-xs">
                          <span className="font-bold text-slate-800 block mb-0.5 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            Rekomendasi Tindakan Agronomi:
                          </span>
                          <p className="text-slate-600">{item.recommendation}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Terdeteksi: {formatDate(item.created_at)}
                        </span>
                        {item.is_resolved && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Selesai ditangani
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tombol Aksi */}
                  <div className="flex items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
                    {!item.is_read && !item.is_resolved && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(item.id)}
                        disabled={isBusy}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Tandai notifikasi sebagai sudah dibaca"
                      >
                        Tandai Dibaca
                      </button>
                    )}

                    {!item.is_resolved && (
                      <button
                        type="button"
                        onClick={() => handleResolveAlert(item.id)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                        title="Tandai anomali ini sudah selesai ditangani di lapangan"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Sudah Ditangani
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
