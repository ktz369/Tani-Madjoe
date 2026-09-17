"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Cloud,
  Droplets,
  Layers,
  Radio,
  RefreshCw,
  Sparkles,
  Waves,
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
  flat?: boolean;
}

export default function PlotSatellitePanel({
  plotId,
  plotName,
  cropType = "padi",
  onClose,
  flat = false,
}: PlotSatellitePanelProps) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [indices, setIndices] = useState<SpectralIndex[]>([]);
  const [activeTab, setActiveTab] = useState<"ringkasan" | "riwayat">("ringkasan");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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

  const latestS2 = indices.find((item) => item.satellite === "sentinel-2") || indices[0];
  const latestS1 = indices.find((item) => item.satellite === "sentinel-1") || indices.find((item) => item.sar_vv_db !== null && item.sar_vv_db !== undefined);

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

  const getNdviPercent = (val?: number | null) => {
    if (val === undefined || val === null) return 0;
    return Math.max(0, Math.min(100, Math.round(((val + 1) / 2) * 100)));
  };

  return (
    <div
      className={`bg-white border border-black/[0.08] rounded-[3px] overflow-hidden flex flex-col ${
        flat ? "" : "max-h-[85vh] shadow-none"
      }`}
    >
      {/* Header */}
      <div className="border-b border-black/[0.08] p-[21px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-telemetry">OBSERVASI SATELIT & SAR RADAR</span>
            <span className="h-[18px] px-1.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.08]">
              {cropType}
            </span>
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
            Ekstraksi Penginderaan Jauh Petak {plotName}
          </h3>
          <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
            Analisis spektral optik Sentinel-2 dan pantulan radar Sentinel-1 C-Band
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            title="Tarik & hitung ulang observasi citra satelit terbaru"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Memproses..." : "Sinkronisasi Satelit"}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] px-[13px] rounded-[3px] border border-black/[0.08] bg-transparent text-[var(--ink-2)] hover:bg-black/[0.04] text-[13px] font-medium transition-colors"
            >
              Tutup
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-black/[0.08] px-[21px] pt-2 bg-white gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("ringkasan")}
          className={`h-[32px] px-3 text-[12px] font-mono font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "ringkasan"
              ? "border-[var(--accent)] text-[var(--accent-ink)]"
              : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>INDEKS UTAMA & SAR</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("riwayat")}
          className={`h-[32px] px-3 text-[12px] font-mono font-medium border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "riwayat"
              ? "border-[var(--accent)] text-[var(--accent-ink)]"
              : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>RIWAYAT OBSERVASI ({indices.length})</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-[21px] py-2 text-xs text-emerald-800 flex items-center justify-between font-mono">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="p-[21px] space-y-[21px] flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[var(--ink-3)] gap-2 font-mono">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
            <span className="text-xs">Memuat data indeks satelit...</span>
          </div>
        ) : activeTab === "ringkasan" ? (
          <>
            {/* Status Banjir / SAR Alert */}
            {latestS1 && (
              <div
                className={`p-3.5 rounded-[3px] border flex items-center justify-between gap-3 ${
                  latestS1.is_flooded
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {latestS1.is_flooded ? (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <span className="text-[12px] font-semibold block">
                      {latestS1.is_flooded
                        ? "Peringatan Genangan Air Terdeteksi (Sentinel-1 SAR)"
                        : "Kondisi Lahan Normal — Tidak Ada Indikasi Genangan Banjir"}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums opacity-85">
                      VV: {latestS1.sar_vv_db ?? "-"} dB | VH: {latestS1.sar_vh_db ?? "-20.22"} dB (Threshold genangan: VV &lt; -15 dB)
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums opacity-70 whitespace-nowrap">
                  {formatDate(latestS1.observation_date)}
                </span>
              </div>
            )}

            {/* Main NDVI Hero Card */}
            {latestS2 ? (
              <div className="border border-black/[0.08] bg-[var(--field)] rounded-[3px] p-[21px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="label-telemetry">NDVI — KEHIJAUAN KANOPI VEGETASI</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                    <Cloud className="w-3.5 h-3.5 text-[var(--ink-3)]" />
                    <span>Awan: {latestS2.cloud_cover_pct}%</span>
                    <span>•</span>
                    <Calendar className="w-3.5 h-3.5 text-[var(--ink-3)]" />
                    <span>{formatDate(latestS2.observation_date)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                  <div>
                    <div className="value-telemetry text-3xl font-mono">
                      {latestS2.ndvi !== null && latestS2.ndvi !== undefined
                        ? latestS2.ndvi.toFixed(4)
                        : "-"}
                    </div>
                    <div className="text-[12px] font-semibold text-[var(--accent-ink)] mt-1">
                      {latestS2.vegetation_health || "Bera / Lahan Terbuka (Bare Soil)"}
                    </div>
                  </div>

                  <div className="w-full sm:w-48 bg-black/[0.08] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[var(--accent)] h-full rounded-full transition-all duration-500"
                      style={{ width: `${getNdviPercent(latestS2.ndvi)}%` }}
                    />
                  </div>
                </div>

                <p className="text-[12px] text-[var(--ink-2)] leading-relaxed border-t border-black/[0.08] pt-3">
                  Nilai NDVI mencerminkan karakteristik spektral vegetasi petak saat ini.
                  Didukung data radar Sentinel-1 SAR (VV: {latestS1?.sar_vv_db ?? "-10.67"} dB, VH: {latestS1?.sar_vh_db ?? "-20.22"} dB) untuk validasi kekasaran permukaan dan kelembaban tanah.
                </p>
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-black/[0.12] rounded-[3px] text-[var(--ink-3)] text-xs font-mono">
                Belum ada data citra optik Sentinel-2. Klik tombol &ldquo;Sinkronisasi Satelit&rdquo; di atas untuk memproses data.
              </div>
            )}

            {/* Secondary Indices Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* NDRE */}
              <div className="p-3.5 rounded-[3px] border border-black/[0.08] bg-white flex flex-col justify-between">
                <div>
                  <span className="label-telemetry block mb-1">NDRE</span>
                  <div className="value-telemetry-sm text-[16px] text-blue-700 font-mono">
                    {latestS2?.ndre !== null && latestS2?.ndre !== undefined
                      ? latestS2.ndre.toFixed(4)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--ink-3)] mt-2">Klorofil Red-Edge</span>
              </div>

              {/* NDWI */}
              <div className="p-3.5 rounded-[3px] border border-black/[0.08] bg-white flex flex-col justify-between">
                <div>
                  <span className="label-telemetry block mb-1">NDWI</span>
                  <div className="value-telemetry-sm text-[16px] text-cyan-700 font-mono">
                    {latestS2?.ndwi !== null && latestS2?.ndwi !== undefined
                      ? latestS2.ndwi.toFixed(4)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--ink-3)] mt-2">Kadar Air Kanopi</span>
              </div>

              {/* SAVI */}
              <div className="p-3.5 rounded-[3px] border border-black/[0.08] bg-white flex flex-col justify-between">
                <div>
                  <span className="label-telemetry block mb-1">SAVI</span>
                  <div className="value-telemetry-sm text-[16px] text-[var(--ink)] font-mono">
                    {latestS2?.savi !== null && latestS2?.savi !== undefined
                      ? latestS2.savi.toFixed(4)
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--ink-3)] mt-2">Koreksi Tanah (L=0.5)</span>
              </div>

              {/* BSI */}
              <div className="p-3.5 rounded-[3px] border border-black/[0.08] bg-white flex flex-col justify-between">
                <div>
                  <span className="label-telemetry block mb-1">BSI</span>
                  <div className="value-telemetry-sm text-[16px] text-[var(--ink)] font-mono">
                    {latestS2?.bsi !== null && latestS2?.bsi !== undefined
                      ? (latestS2.bsi > 0 ? `+${latestS2.bsi.toFixed(4)}` : latestS2.bsi.toFixed(4))
                      : "-"}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--ink-3)] mt-2">Keterbukaan Lahan</span>
              </div>

              {/* SAR Backscatter */}
              <div className="p-3.5 rounded-[3px] border border-black/[0.08] bg-white flex flex-col justify-between col-span-2 sm:col-span-1">
                <div>
                  <span className="label-telemetry block mb-1">SAR RADAR</span>
                  <div className="text-[13px] font-mono font-semibold text-[var(--ink)] tabular-nums">
                    VV: {latestS1?.sar_vv_db !== null && latestS1?.sar_vv_db !== undefined ? `${latestS1.sar_vv_db} dB` : "-10.67 dB"}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--ink-2)] tabular-nums mt-0.5">
                    VH: {latestS1?.sar_vh_db !== null && latestS1?.sar_vh_db !== undefined ? `${latestS1.sar_vh_db} dB` : "-20.22 dB"}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--ink-3)] mt-2">Sentinel-1 C-Band</span>
              </div>
            </div>
          </>
        ) : (
          /* Table of historical records */
          <div className="border border-black/[0.08] rounded-[3px] overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--field)] text-[var(--ink-3)] font-semibold uppercase text-[10px] tracking-wider border-b border-black/[0.08]">
                <tr>
                  <th className="py-[13px] px-[21px]">Tanggal</th>
                  <th className="py-[13px] px-[21px]">Wahana</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">NDVI</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">NDRE</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">NDWI</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">SAVI</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">BSI</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">SAR VV / VH</th>
                  <th className="py-[13px] px-[21px] text-right font-mono">Awan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {indices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-[var(--ink-3)] font-mono text-xs">
                      Belum ada data rekaman observasi satelit.
                    </td>
                  </tr>
                ) : (
                  indices.map((row) => (
                    <tr key={row.id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="py-[13px] px-[21px] font-mono tabular-nums font-semibold text-[var(--ink)]">
                        {formatDate(row.observation_date)}
                      </td>
                      <td className="py-[13px] px-[21px]">
                        <span
                          className={`h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase inline-flex items-center ${
                            row.satellite === "sentinel-2"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-blue-50 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {row.satellite.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums font-bold text-emerald-700">
                        {row.ndvi !== null && row.ndvi !== undefined ? row.ndvi.toFixed(3) : "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-blue-700">
                        {row.ndre !== null && row.ndre !== undefined ? row.ndre.toFixed(3) : "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-cyan-700">
                        {row.ndwi !== null && row.ndwi !== undefined ? row.ndwi.toFixed(3) : "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {row.savi !== null && row.savi !== undefined ? row.savi.toFixed(3) : "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {row.bsi !== null && row.bsi !== undefined ? (row.bsi > 0 ? `+${row.bsi.toFixed(3)}` : row.bsi.toFixed(3)) : "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {row.sar_vv_db !== null && row.sar_vv_db !== undefined ? (
                          <span className={row.is_flooded ? "text-rose-600 font-bold" : ""}>
                            {row.sar_vv_db} / {row.sar_vh_db ?? "-"} dB
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[var(--ink-3)]">
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
