"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Cloud,
  Droplets,
  Eye,
  Layers,
  Radio,
  RefreshCw,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  SatelliteJobResponse,
  SpectralIndex,
  SpectralIndexListResponse,
} from "@/types";

interface PlotSatellitePanelProps {
  plotId: number;
  plotName: string;
  cropType?: string;
  onClose?: () => void;
}

export default function PlotSatellitePanel({
  plotId,
  plotName,
  cropType = "padi",
  onClose,
}: PlotSatellitePanelProps) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [indices, setIndices] = useState<SpectralIndex[]>([]);
  const [activeTab, setActiveTab] = useState<"ringkasan" | "riwayat">("ringkasan");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load spectral indices for the plot
  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get<SpectralIndexListResponse>(`/plots/${plotId}/indices`);
      setIndices(res.data.items || []);
    } catch (err) {
      console.error("Gagal memuat indeks satelit:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [plotId]);

  // Manual Trigger Sync
  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setFeedbackMessage(null);
      const res = await api.post<SatelliteJobResponse>(`/jobs/satellite?plot_id=${plotId}`);
      setFeedbackMessage(res.data.message || "Observasi satelit berhasil diperbarui.");
      await loadData();
    } catch (err: any) {
      setFeedbackMessage(
        err.response?.data?.detail || "Gagal menyinkronkan citra satelit."
      );
    } finally {
      setSyncing(false);
    }
  };

  // Find latest Sentinel-2 and latest Sentinel-1
  const latestS2 = indices.find((item) => item.satellite === "sentinel-2");
  const latestS1 = indices.find((item) => item.satellite === "sentinel-1");

  // Format date helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Helper for NDVI progress percentage (-1 to 1 -> 0% to 100%)
  const getNdviPercent = (val?: number | null) => {
    if (val === undefined || val === null) return 0;
    return Math.max(0, Math.min(100, Math.round(((val + 1) / 2) * 100)));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
            <Radio className="w-5 h-5 text-emerald-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg tracking-wide">{plotName}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 uppercase">
                {cropType}
              </span>
            </div>
            <p className="text-xs text-emerald-200/80">
              Observasi Penginderaan Jauh (Sentinel-2 & Sentinel-1 SAR)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-semibold shadow transition-all disabled:opacity-50"
            title="Tarik & hitung ulang observasi citra satelit terbaru"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {syncing ? "Memproses..." : "Sinkronisasi Satelit"}
            </span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 px-4 pt-2 bg-slate-50 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("ringkasan")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "ringkasan"
              ? "border-emerald-600 text-emerald-700 bg-white rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Indeks Utama & SAR</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("riwayat")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "riwayat"
              ? "border-emerald-600 text-emerald-700 bg-white rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Riwayat Observasi ({indices.length})</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-800 flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs">Memuat data indeks satelit...</span>
          </div>
        ) : activeTab === "ringkasan" ? (
          <>
            {/* Status Banjir / SAR Alert */}
            {latestS1 && (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  latestS1.is_flooded
                    ? "bg-rose-50 border-rose-300 text-rose-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {latestS1.is_flooded ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-bold block">
                      {latestS1.is_flooded
                        ? "Peringatan Genangan / Potensi Banjir (Sentinel-1 SAR)"
                        : "Kondisi Lahan Normal — Tidak Terdeteksi Banjir"}
                    </span>
                    <span className="text-[11px] opacity-80">
                      VV: {latestS1.sar_vv_db ?? "-"} dB | VH:{" "}
                      {latestS1.sar_vh_db ?? "-"} dB (Threshold: VV &lt; -15 dB / VH &lt; -22 dB)
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold opacity-70 whitespace-nowrap">
                  {formatDate(latestS1.observation_date)}
                </span>
              </div>
            )}

            {/* Main NDVI Hero Card */}
            {latestS2 ? (
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-xl p-4 sm:p-5 border border-slate-700 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      NDVI — Kehijauan Vegetasi
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <Cloud className="w-3.5 h-3.5 text-slate-400" />
                    <span>Awan: {latestS2.cloud_cover_pct}%</span>
                    <span>•</span>
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDate(latestS2.observation_date)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                  <div>
                    <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                      {latestS2.ndvi !== null && latestS2.ndvi !== undefined
                        ? latestS2.ndvi.toFixed(4)
                        : "-"}
                    </div>
                    <div className="text-xs font-medium text-emerald-300 mt-1">
                      {latestS2.vegetation_health}
                    </div>
                  </div>

                  <div className="w-full sm:w-48 bg-slate-700/60 rounded-full h-3 overflow-hidden p-0.5 border border-slate-600">
                    <div
                      className="bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-300 h-full rounded-full transition-all duration-500"
                      style={{ width: `${getNdviPercent(latestS2.ndvi)}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-300/80 leading-relaxed border-t border-slate-700/60 pt-2.5">
                  NDVI dihitung dari rasio band NIR (B8) dan Red (B4) Sentinel-2. Nilai &gt; 0.60
                  mengindikasikan kerapatan tajuk tinggi dan fotosintesis tanaman aktif prima.
                </p>
              </div>
            ) : (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                Belum ada data citra optik Sentinel-2. Klik tombol &ldquo;Sinkronisasi Satelit&rdquo; di atas untuk memproses data.
              </div>
            )}

            {/* Secondary Indices Grid (NDRE, NDWI, SAVI, BSI) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* NDRE */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide">NDRE</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {latestS2?.ndre !== null && latestS2?.ndre !== undefined
                      ? latestS2.ndre.toFixed(3)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Klorofil Merah Tepi</span>
              </div>

              {/* NDWI */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide">NDWI</span>
                    <Droplets className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {latestS2?.ndwi !== null && latestS2?.ndwi !== undefined
                      ? latestS2.ndwi.toFixed(3)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Kadar Air Kanopi</span>
              </div>

              {/* SAVI */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide">SAVI</span>
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                  </div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {latestS2?.savi !== null && latestS2?.savi !== undefined
                      ? latestS2.savi.toFixed(3)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Koreksi Tanah (L=0.5)</span>
              </div>

              {/* BSI */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide">BSI</span>
                    <Waves className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {latestS2?.bsi !== null && latestS2?.bsi !== undefined
                      ? latestS2.bsi.toFixed(3)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 mt-1">Keterbukaan Lahan</span>
              </div>
            </div>
          </>
        ) : (
          /* Table of historical records */
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Tanggal</th>
                  <th className="py-2.5 px-3">Wahana</th>
                  <th className="py-2.5 px-3">NDVI</th>
                  <th className="py-2.5 px-3">NDRE</th>
                  <th className="py-2.5 px-3">NDWI</th>
                  <th className="py-2.5 px-3">SAVI</th>
                  <th className="py-2.5 px-3">BSI</th>
                  <th className="py-2.5 px-3">SAR VV / VH</th>
                  <th className="py-2.5 px-3 rounded-r-lg">Awan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {indices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-slate-400">
                      Belum ada data rekaman observasi.
                    </td>
                  </tr>
                ) : (
                  indices.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {formatDate(row.observation_date)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.satellite === "sentinel-2"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {row.satellite.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-700">
                        {row.ndvi !== null && row.ndvi !== undefined ? row.ndvi.toFixed(3) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.ndre !== null && row.ndre !== undefined ? row.ndre.toFixed(3) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.ndwi !== null && row.ndwi !== undefined ? row.ndwi.toFixed(3) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.savi !== null && row.savi !== undefined ? row.savi.toFixed(3) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.bsi !== null && row.bsi !== undefined ? row.bsi.toFixed(3) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.sar_vv_db !== null && row.sar_vv_db !== undefined ? (
                          <span
                            className={`font-semibold ${
                              row.is_flooded ? "text-rose-600" : "text-slate-700"
                            }`}
                          >
                            {row.sar_vv_db} / {row.sar_vh_db ?? "-"} dB
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {row.cloud_cover_pct !== null && row.cloud_cover_pct !== undefined
                          ? `${row.cloud_cover_pct}%`
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
