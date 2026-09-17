"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Droplets,
  Check,
} from "lucide-react";
import { AlertItem } from "@/types";
import { api } from "@/lib/api";
import {
  getPlotAlerts,
  formatRelativeTime,
  getSeverityConfig,
  markAlertAsRead,
  resolveAlert,
} from "./alertUtils";

interface PlotAlertListProps {
  plotId: number;
  plotName?: string;
}

export default function PlotAlertList({ plotId, plotName }: PlotAlertListProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "unresolved" | "resolved">("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const isResolved =
        filterStatus === "unresolved" ? false : filterStatus === "resolved" ? true : undefined;
      const data = await getPlotAlerts(plotId, isResolved);
      setAlerts(data);
    } catch (err) {
      console.error("Gagal memuat alert petak:", err);
    } finally {
      setLoading(false);
    }
  }, [plotId, filterStatus]);

  useEffect(() => {
    if (plotId) {
      fetchAlerts();
    }
  }, [plotId, fetchAlerts]);

  const handleTriggerEvaluation = async () => {
    try {
      setEvaluating(true);
      const res = await api.post(`/jobs/alerts?plot_id=${plotId}`);
      const createdCount = res.data?.alerts_created ?? 0;
      if (createdCount > 0) {
        setToastMessage(`Evaluasi selesai: ${createdCount} peringatan baru teridentifikasi.`);
      } else {
        setToastMessage("Evaluasi selesai: Kondisi petak optimal, tidak ditemukan anomali baru.");
      }
      await fetchAlerts();
    } catch (err: any) {
      console.error("Gagal mengevaluasi alert:", err);
      setToastMessage(err.response?.data?.detail || "Gagal menjalankan evaluasi anomali petak.");
    } finally {
      setEvaluating(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    try {
      setProcessingId(alertId);
      const updated = await resolveAlert(alertId);
      setAlerts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error("Gagal menyelesaikan alert:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkRead = async (alertId: number) => {
    try {
      setProcessingId(alertId);
      const updated = await markAlertAsRead(alertId);
      setAlerts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error("Gagal menandai alert telah dibaca:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;

  return (
    <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] space-y-[21px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.08] pb-[13px]">
        <div>
          <span className="label-telemetry block">SISTEM DETEKSI ANOMALI & RISIKO</span>
          <div className="flex items-center gap-2 mt-0.5">
            <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight">
              Peringatan Dini & Tugas Penanganan Lapangan
            </h3>
            {unresolvedCount > 0 ? (
              <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center">
                {unresolvedCount} TERTUNDA
              </span>
            ) : (
              <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                STATUS NORMAL
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
            Riwayat deteksi deviasi klorofil, kekurangan air, indikasi rebah, dan anomali optik Sentinel
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleTriggerEvaluation}
            disabled={evaluating || loading}
            className="h-[30px] px-[13px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Jalankan evaluasi anomali sekarang"
          >
            <Sparkles className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
            <span>{evaluating ? "Mengevaluasi..." : "Cek Anomali"}</span>
          </button>

          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="h-[30px] w-[30px] rounded-[3px] border border-black/[0.08] hover:bg-black/[0.04] text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors disabled:opacity-50 inline-flex items-center justify-center"
            title="Segarkan daftar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Bar & Feedback */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div className="inline-flex rounded-[3px] border border-black/[0.08] bg-white p-0.5 text-xs font-mono">
          <button
            onClick={() => setFilterStatus("all")}
            className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
              filterStatus === "all"
                ? "bg-[var(--ink)] text-white font-medium"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
            }`}
          >
            SEMUA ({alerts.length})
          </button>
          <button
            onClick={() => setFilterStatus("unresolved")}
            className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
              filterStatus === "unresolved"
                ? "bg-rose-600 text-white font-medium"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
            }`}
          >
            PERLU DITANGANI
          </button>
          <button
            onClick={() => setFilterStatus("resolved")}
            className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
              filterStatus === "resolved"
                ? "bg-[var(--accent)] text-white font-medium"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
            }`}
          >
            SELESAI
          </button>
        </div>

        {toastMessage && (
          <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-[2px] animate-in fade-in">
            {toastMessage}
          </span>
        )}
      </div>

      {/* Beautiful UI Task Row pattern */}
      <div className="divide-y-0">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[var(--ink-3)] font-mono text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)] mb-2" />
            <span>Memuat daftar peringatan...</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-black/[0.12] rounded-[3px] p-6">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
            <h4 className="text-[13px] font-semibold text-[var(--ink)]">
              {filterStatus === "unresolved"
                ? "Tidak Ada Peringatan Tertunda"
                : "Tidak Ada Riwayat Anomali"}
            </h4>
            <p className="text-[11px] font-mono text-[var(--ink-3)] mt-1 max-w-md mx-auto">
              {filterStatus === "unresolved"
                ? "Seluruh deteksi telah diselesaikan atau kondisi lahan berada dalam batas toleransi normal."
                : "Belum ditemukan anomali fisiologis vegetasi pada rekaman observasi satelit terkini."}
            </p>
          </div>
        ) : (
          <div className="border-t border-black/[0.08]">
            {alerts.map((alert) => {
              const isResolved = alert.is_resolved;
              const severityCfg = getSeverityConfig(alert.severity);

              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-[13px] py-[13px] border-b border-black/[0.08] hover:bg-black/[0.02] transition-colors"
                >
                  {/* Status Indicator Icon */}
                  <div className="flex-shrink-0">
                    {isResolved ? (
                      <span className="w-7 h-7 rounded-[2px] bg-black/[0.04] text-[var(--ink-3)] flex items-center justify-center border border-black/[0.08]">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : alert.severity?.toLowerCase() === "merah" ? (
                      <span className="w-7 h-7 rounded-[2px] bg-rose-50 text-rose-700 flex items-center justify-center border border-rose-200">
                        <AlertOctagon className="w-3.5 h-3.5" />
                      </span>
                    ) : alert.severity?.toLowerCase() === "oranye" ? (
                      <span className="w-7 h-7 rounded-[2px] bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
                        <Droplets className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="w-7 h-7 rounded-[2px] bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Task Content: Title, Description, Timestamp */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[13px] font-semibold text-[var(--ink)] truncate ${isResolved ? "line-through opacity-60" : ""}`}>
                        {alert.title}
                      </span>
                      <span className="h-[18px] px-1.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider border border-black/[0.08] text-[var(--ink-2)] bg-black/[0.03]">
                        {alert.severity}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                        • {formatRelativeTime(alert.created_at)}
                      </span>
                    </div>

                    <p className={`text-[12px] text-[var(--ink-2)] truncate mt-0.5 ${isResolved ? "opacity-60" : ""}`}>
                      {alert.description || (alert as any).message}
                    </p>

                    {/* Telemetry Trigger values if present */}
                    {alert.trigger_values && typeof alert.trigger_values === "object" && Object.keys(alert.trigger_values).length > 0 && (
                      <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                        {Object.entries(alert.trigger_values).map(([key, val]) => (
                          <span key={key} className="bg-[var(--field)] px-1.5 py-0.5 rounded-[2px] border border-black/[0.04]">
                            {key}: <span className="font-semibold text-[var(--ink)]">{typeof val === "number" ? val.toFixed(3) : String(val)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isResolved && !alert.is_read && (
                      <button
                        onClick={() => handleMarkRead(alert.id)}
                        disabled={processingId === alert.id}
                        className="h-[30px] px-[13px] rounded-[3px] border border-black/[0.08] bg-transparent text-[var(--ink-2)] hover:bg-black/[0.04] text-[12px] font-medium transition-colors disabled:opacity-50"
                      >
                        Tandai Baca
                      </button>
                    )}

                    {!isResolved ? (
                      <button
                        onClick={() => handleResolveAlert(alert.id)}
                        disabled={processingId === alert.id}
                        className="h-[30px] px-[13px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Selesaikan</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-[2px] font-medium">
                        Terselesaikan
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
