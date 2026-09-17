"use client";

import React from "react";
import { CheckCircle2, XCircle, Plus } from "lucide-react";
import {
  PhenologyTimeline,
  PlotIndicesChart,
} from "@/components/plot";
import PlotSatellitePanel from "@/components/satellite/PlotSatellitePanel";
import { PlantingSeason, Plot, PlotDetail } from "@/types";

function defaultFormatIndoDate(dateStr?: string | null) {
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
}

export interface TabIkhtisarProps {
  plot: Plot;
  plotDetail: PlotDetail | null;
  activeSeason?: PlantingSeason;
  onOpenHarvestModal: (season: PlantingSeason) => void;
  onOpenFailModal: (season: PlantingSeason) => void;
  onOpenCreateModal: () => void;
  formatIndoDate?: (dateStr?: string | null) => string;
}

export default function TabIkhtisar({
  plot,
  plotDetail,
  activeSeason,
  onOpenHarvestModal,
  onOpenFailModal,
  onOpenCreateModal,
  formatIndoDate = defaultFormatIndoDate,
}: TabIkhtisarProps) {
  return (
    <div className="divide-y divide-black/[0.08] space-y-[21px]">
      {/* Banner Siklus Musim Aktif / Bera (Hairline Strip) */}
      <section className="pt-2">
        {activeSeason ? (
          <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  Siklus Tanam Berjalan
                </span>
                <span className="text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                  Tanam: {activeSeason.planting_date}
                </span>
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                Varietas {activeSeason.variety_name || "Standar"} — Target Est:{" "}
                <span className="font-mono tabular-nums font-bold">
                  {activeSeason.yield_estimate_ton_per_ha
                    ? `${activeSeason.yield_estimate_ton_per_ha} ton/ha`
                    : "Belum ditetapkan"}
                </span>
              </h2>
              {activeSeason.notes && (
                <p className="text-[12px] text-[var(--ink-2)] italic">
                  Catatan: &ldquo;{activeSeason.notes}&rdquo;
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 self-start md:self-center flex-shrink-0">
              <button
                onClick={() => onOpenHarvestModal(activeSeason)}
                className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Panen</span>
              </button>
              <button
                onClick={() => onOpenFailModal(activeSeason)}
                className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-transparent text-rose-600 hover:bg-rose-50 text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Tandai Gagal</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 inline-flex items-center">
                  Status Lahan: Bera (Fallow Land)
                </span>
                <span className="text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                  0 HST • GDD 0.0 °C-hari
                </span>
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                Lahan Terbuka (Persiapan Olah Tanah Pra-Tanam)
              </h2>
              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-2xl">
                Petak {plot.name} berstatus bera (<span className="font-mono tabular-nums font-semibold">0 HST</span>, akumulasi termal{" "}
                <span className="font-mono tabular-nums font-semibold">GDD 0.0 °C-hari</span>, evapotranspirasi aktual{" "}
                <span className="font-mono tabular-nums font-semibold text-blue-700">ETc 0.00 mm/hari</span>).
                Lahan dalam tahap pengolahan tanah (tillage) & pemupukan organik dasar.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-center flex-shrink-0">
              <button
                onClick={onOpenCreateModal}
                className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Mulai Musim Baru</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Phenology Timeline */}
      <section className="py-[21px]">
        <PhenologyTimeline
          timeline={plotDetail?.phases_timeline || []}
          currentHst={plotDetail?.current_hst ?? plot.current_hst ?? 0}
          currentPhaseName={plotDetail?.current_phase || plot.current_phase}
          gddCumulative={plotDetail?.gdd_cumulative || 0}
        />
      </section>

      {/* Prediksi Panen & Kebutuhan Air (2-Kolom Hairline Section) */}
      <section className="py-[21px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[21px]">
          {/* Panel Prediksi Panen & Thermal GDD */}
          <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-[21px]">
            <div>
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-[13px] mb-4">
                <div>
                  <span className="label-telemetry block">AKUMULASI UNIT TERMAL</span>
                  <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                    Prediksi Panen Fisiologis & GDD
                  </h3>
                </div>
                <span className="h-[22px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300 inline-flex items-center tabular-nums">
                  {plotDetail?.gdd_progress_pct ?? 0}% SELESAI
                </span>
              </div>

              {/* Progress Bar Akumulasi GDD */}
              <div className="space-y-1.5 mb-5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--ink-2)]">Akumulasi Terkini</span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">
                    {plotDetail?.gdd_cumulative ?? 0} / {plotDetail?.gdd_target_total ?? 0} °C-hari
                  </span>
                </div>
                <div className="w-full bg-black/[0.06] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[var(--accent)] h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, plotDetail?.gdd_progress_pct ?? 0))}%` }}
                  />
                </div>
              </div>

              {/* Metrik Rincian Panen */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
                  <span className="label-telemetry block mb-1">SISA KEBUTUHAN GDD</span>
                  <div className="value-telemetry-sm text-[20px] font-mono tabular-nums">
                    {plotDetail?.remaining_gdd ?? 0}
                  </div>
                  <span className="text-[10px] text-[var(--ink-3)] block mt-0.5 font-mono">°C-hari lagi</span>
                </div>

                <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
                  <span className="label-telemetry block mb-1">ESTIMASI SISA HARI</span>
                  <div className="value-telemetry-sm text-[20px] font-mono tabular-nums text-emerald-700">
                    {plotDetail?.estimated_days_to_harvest !== null && plotDetail?.estimated_days_to_harvest !== undefined
                      ? `${plotDetail.estimated_days_to_harvest} Hari`
                      : "0 Hari"}
                  </div>
                  <span className="text-[10px] text-[var(--ink-3)] block mt-0.5 font-mono">ke matang fisiologis</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--ink-3)] uppercase tracking-wider text-[11px]">TANGGAL PANEN DIPREDIKSI:</span>
              <span className="font-semibold text-[var(--ink)] tabular-nums">
                {plotDetail?.predicted_harvest_date
                  ? formatIndoDate(plotDetail.predicted_harvest_date)
                  : "Belum Ditanami (Lahan Bera)"}
              </span>
            </div>
          </div>

          {/* Panel Kebutuhan Air Tanaman (ETc) */}
          <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-[21px]">
            <div>
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-[13px] mb-4">
                <div>
                  <span className="label-telemetry block">NERACA AIR & HIDRASI TANAMAN</span>
                  <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                    Kebutuhan Air Tanaman (ETc)
                  </h3>
                </div>
                <span className="h-[22px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 inline-flex items-center tabular-nums">
                  KC AKTIF: {plotDetail?.kc_active !== null && plotDetail?.kc_active !== undefined ? plotDetail.kc_active.toFixed(2) : "0.00"}
                </span>
              </div>

              {/* Metrik Air */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-blue-100 bg-blue-50/50 p-3 rounded-[3px]">
                  <span className="label-telemetry text-blue-800 block mb-1">ETC HARI INI (AKTUAL)</span>
                  <div className="value-telemetry-sm text-[20px] font-mono tabular-nums text-blue-900">
                    {plotDetail?.etc_today !== null && plotDetail?.etc_today !== undefined
                      ? `${plotDetail.etc_today.toFixed(2)} mm`
                      : "0.00 mm"}
                  </div>
                  <span className="text-[10px] text-blue-600 block mt-0.5 font-mono">mm/hari per satuan luas</span>
                </div>

                <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
                  <span className="label-telemetry block mb-1">ET₀ ACUAN CUACA</span>
                  <div className="value-telemetry-sm text-[20px] font-mono tabular-nums text-[var(--ink)]">
                    {plotDetail?.et0_today !== null && plotDetail?.et0_today !== undefined
                      ? `${plotDetail.et0_today} mm`
                      : "-"}
                  </div>
                  <span className="text-[10px] text-[var(--ink-3)] block mt-0.5 font-mono">stasiun cuaca kebun</span>
                </div>
              </div>

              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
                <span className="font-semibold text-[var(--ink)] block mb-0.5 font-mono text-[11px]">FORMULA FAO-56 PENMAN-MONTEITH:</span>
                {plotDetail?.etc_today === 0 || (plotDetail?.current_hst ?? 0) === 0 ? (
                  <span>
                    ETc = <strong className="font-mono tabular-nums">0.00 mm/hari</strong> (belum ada tajuk aktif, evaporasi tanah terbuka).
                    Irigasi difokuskan untuk persiapan penjenuhan tanah pra-tanam.
                  </span>
                ) : (
                  <span>
                    ETc = ET₀ ({plotDetail?.et0_today ?? 0} mm) × Kc ({plotDetail?.kc_active !== null && plotDetail?.kc_active !== undefined ? plotDetail.kc_active.toFixed(2) : "1.00"}).
                    Dibutuhkan pasokan sekitar{" "}
                    <span className="font-bold text-blue-700 font-mono tabular-nums">
                      {plotDetail?.etc_today ? (plotDetail.etc_today * 10).toFixed(0) : "0"} m³/ha/hari
                    </span>{" "}
                    untuk hidrasi optimal tanpa defisit air.
                  </span>
                )}
              </p>
            </div>

            <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--ink-3)] uppercase tracking-wider text-[11px]">STATUS KEBUTUHAN AIR:</span>
              <span className="font-semibold text-blue-800">
                {(plotDetail?.current_hst ?? plot.current_hst ?? 0) === 0 || (plotDetail?.kc_active ?? 0) === 0
                  ? "Lahan Bera (Evaporasi Terbuka - 0.00 mm)"
                  : (plotDetail?.kc_active ?? 1.0) >= 1.15
                  ? "Fase Kritis (Kebutuhan Air Maksimal)"
                  : (plotDetail?.kc_active ?? 1.0) < 0.8
                  ? "Fase Rendah (Kebutuhan Menurun)"
                  : "Kebutuhan Air Normal Stabil"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Spectral Charts */}
      <section className="py-[21px]">
        <PlotIndicesChart
          plotId={plot.id}
          plantingDate={plot.planting_date}
          cropType={plot.crop_type}
        />
      </section>

      {/* Satellite Panel */}
      <section className="py-[21px]">
        <PlotSatellitePanel
          plotId={plot.id}
          plotName={plot.name}
          cropType={plot.crop_type}
          flat={true}
        />
      </section>
    </div>
  );
}
