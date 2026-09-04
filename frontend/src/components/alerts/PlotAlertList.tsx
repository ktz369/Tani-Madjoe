"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  PlayCircle,
  Filter,
} from "lucide-react";
import { AlertItem } from "@/types";
import { api } from "@/lib/api";
import AlertCard from "./AlertCard";
import { getPlotAlerts } from "./alertUtils";

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

  const handleAlertUpdate = (updated: AlertItem) => {
    setAlerts((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const handleTriggerEvaluation = async () => {
    try {
      setEvaluating(true);
      const res = await api.post(`/jobs/alerts?plot_id=${plotId}`);
      const createdCount = res.data?.alerts_created ?? 0;
      if (createdCount > 0) {
        setToastMessage(`Evaluasi berhasil: Ditemukan ${createdCount} peringatan baru.`);
      } else {
        setToastMessage("Evaluasi berhasil: Kondisi petak normal, tidak ditemukan anomali baru.");
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

  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Peringatan & Rekomendasi Petak
                </h2>
                {unresolvedCount > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    {unresolvedCount} Perlu Ditangani
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Kondisi Normal
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Riwayat deteksi anomali klorofil, stres air, hama/rebah, dan kesiapan panen.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Manual Evaluation Trigger */}
          <button
            onClick={handleTriggerEvaluation}
            disabled={evaluating || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
            title="Jalankan algoritma deteksi anomali pada petak ini sekarang"
          >
            <Sparkles className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
            <span>{evaluating ? "Mengevaluasi..." : "Cek Anomali Sekarang"}</span>
          </button>

          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Segarkan daftar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Semua ({alerts.length})
          </button>
          <button
            onClick={() => setFilterStatus("unresolved")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === "unresolved"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Perlu Ditangani
          </button>
          <button
            onClick={() => setFilterStatus("resolved")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === "resolved"
                ? "bg-emerald-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Sudah Selesai
          </button>
        </div>

        {toastMessage && (
          <span className="text-xs text-emerald-800 bg-emerald-100 px-3 py-1 rounded-lg font-medium animate-in fade-in">
            {toastMessage}
          </span>
        )}
      </div>

      {/* List */}
      <div className="p-6">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-medium text-slate-500">Memuat peringatan petak...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-12 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              {filterStatus === "unresolved"
                ? "Tidak Ada Masalah Tertunda"
                : "Tidak Ada Peringatan Anomali"}
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              {filterStatus === "unresolved"
                ? "Seluruh anomali pada petak ini telah ditangani atau belum ada indikasi stres vegetasi."
                : "Petak ini memiliki perkembangan vegetasi yang konsisten dan belum terdeteksi anomali kritis."}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onUpdate={handleAlertUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
