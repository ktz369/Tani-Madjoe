"use client";

import React, { useState, useEffect } from "react";
import {
  Coins,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Package,
  Plus,
  Scale,
  CalendarCheck2,
  Sparkles,
  Tractor,
  Shovel,
  Sprout,
  ShieldCheck,
  Droplet,
} from "lucide-react";
import { FinancialSummary } from "@/types/operations";
import { operationsApi } from "@/lib/operationsApi";

interface Props {
  plotId: number;
  plotName: string;
  onOpenSaprotanModal?: () => void;
  onOpenPostHarvestModal?: () => void;
  refreshTrigger?: number;
  isFallow?: boolean;
  currentHst?: number;
}

export default function PlotUnitEconomicsCard({
  plotId,
  plotName,
  onOpenSaprotanModal,
  onOpenPostHarvestModal,
  refreshTrigger = 0,
  isFallow,
  currentHst,
}: Props) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await operationsApi.getFinancialSummary(plotId);
      setSummary(data);
    } catch (err) {
      console.error("Failed to load financial summary:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [plotId, refreshTrigger]);

  if (loading) {
    return (
      <div className="border-b border-black/[0.08] py-[21px]">
        <div className="h-[120px] bg-neutral-50 rounded-[3px] animate-pulse flex items-center justify-center text-xs text-[var(--ink-muted)]">
          Memuat unit economics & kalkulasi anggaran modal kerja...
        </div>
      </div>
    );
  }

  if (!summary) return null;

  // Lahan berstatus Bera / 0 HST jika dioperkan langsung atau jika target_harvest_date bernilai null
  const isBera =
    isFallow !== undefined
      ? isFallow
      : (currentHst !== undefined ? currentHst === 0 : summary.target_harvest_date === null);

  const effStatus = summary.efficiency_status;
  const isOptimal = effStatus === "optimal";
  const isWarning = effStatus === "waspada";

  // Bapanas Reference Threshold Invariants:
  // Projected HPP <= 5500: Hijau (Optimal / Efisien)
  // 5500 < Projected HPP <= 6500: Kuning (Waspada / Rata-rata)
  // Projected HPP > 6500: Merah (Kritis / Defisit)
  const hpp = summary.projected_hpp_per_kg;
  const bapanasLevel =
    hpp <= 5500 ? "optimal" : hpp <= 6500 ? "waspada" : "kritis";
  const bapanasConfig = {
    optimal: {
      label: "Optimal (≤ Rp 5.500)",
      tag: "Bapanas: Efisien",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      textClass: "text-[#1b4332]",
      dotClass: "bg-emerald-500",
    },
    waspada: {
      label: "Waspada (≤ Rp 6.500)",
      tag: "Bapanas: Waspada",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      textClass: "text-amber-700",
      dotClass: "bg-amber-500",
    },
    kritis: {
      label: "Kritis (> Rp 6.500)",
      tag: "Bapanas: Kritis",
      badgeClass: "bg-red-50 text-red-800 border-red-200",
      textClass: "text-red-700",
      dotClass: "bg-red-500",
    },
  }[bapanasLevel];

  const totalCost = summary.total_running_cost || 1;
  const laborPct = Math.round(((summary.cost_breakdown.labor || 0) / totalCost) * 100);
  const saprotanPct = Math.round(((summary.cost_breakdown.saprotan || 0) / totalCost) * 100);
  const irrigationPct = Math.round(((summary.cost_breakdown.irrigation || 0) / totalCost) * 100);
  const landPct = Math.round(((summary.cost_breakdown.land_rental || 0) / totalCost) * 100);

  return (
    <div className="border-b border-black/[0.08] py-[21px]">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#1b4332]" />
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              {isBera
                ? "Rencana Anggaran Modal Kerja Pra-Tanam & Input Musim Baru"
                : "Unit Economics & Running HPP Berjalan"}
            </h3>
            {isBera && (
              <span className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase bg-amber-50 text-amber-800 border border-amber-300">
                Pra-Tanam (0 HST)
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            {isBera
              ? "Alokasi modal persiapan olah tanah, perbaikan pematang terasiring, pengadaan benih Inpari 32, dan pupuk dasar"
              : "Akumulasi biaya riil petak dan kalkulasi Harga Pokok Penjualan (HPP) per kg gabah"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenSaprotanModal && (
            <button
              onClick={onOpenSaprotanModal}
              className="h-[30px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-medium text-[var(--ink)] hover:bg-black/[0.03] flex items-center gap-1.5 transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-[#1b4332]" />
              {isBera ? "Input Pupuk Dasar" : "Aplikasi Saprotan"}
            </button>
          )}

          {!isBera && onOpenPostHarvestModal && (
            <button
              onClick={onOpenPostHarvestModal}
              className="h-[30px] px-3 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium flex items-center gap-1.5 hover:bg-[#143225] transition-colors"
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              Tutup Musim (Panen 14%)
            </button>
          )}
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Total Cost */}
        <div className="p-4 bg-[var(--surface)] border border-black/[0.06] rounded-[3px]">
          <span className="text-xs text-[var(--ink-muted)] font-medium block mb-1">
            {isBera ? "Realisasi Modal Pra-Tanam Berjalan" : "Total Biaya Berjalan Petak"}
          </span>
          <div className="text-xl font-mono tabular-nums font-bold text-[var(--ink)]">
            Rp {summary.total_running_cost.toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-[var(--ink-muted)] mt-1">
            Luas Petak: <span className="font-mono tabular-nums font-medium">{summary.area_hectares} Ha</span> |{" "}
            {summary.labor_logs_count} HOK Pra-Tanam, {summary.saprotan_applications_count} Aplikasi
          </p>
        </div>

        {/* Running HPP with Bapanas Threshold Indicator */}
        <div className="p-4 bg-[var(--surface)] border border-black/[0.06] rounded-[3px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--ink-muted)] font-medium block">
              {isBera ? "Target HPP Proyeksi Gabah" : "HPP Proyeksi per Kg (GDD Model)"}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-semibold border ${bapanasConfig.badgeClass}`}
              title="Acuan Ambang Batas Badan Pangan Nasional (Bapanas)"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${bapanasConfig.dotClass}`} />
              {bapanasConfig.tag}
            </span>
          </div>
          <div className={`text-xl font-mono tabular-nums font-bold ${bapanasConfig.textClass}`}>
            Rp {summary.projected_hpp_per_kg.toLocaleString("id-ID")}
            <span className="text-xs font-normal text-[var(--ink-muted)] font-sans ml-1">/ kg</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-[var(--ink-muted)]">
            <span>
              Target Panen:{" "}
              <span className="font-mono tabular-nums font-medium">
                {summary.projected_yield_ton} Ton ({summary.projected_yield_kg.toLocaleString("id-ID")} kg)
              </span>
            </span>
            <span className="font-mono text-[10px] text-[var(--ink-muted)]">
              {bapanasConfig.label}
            </span>
          </div>
        </div>

        {/* Efficiency Ratio & Status */}
        <div className="p-4 bg-[var(--surface)] border border-black/[0.06] rounded-[3px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--ink-muted)] font-medium">
              {isBera ? "Rasio Efisiensi Anggaran Modal" : "Rasio Efisiensi Biaya"}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-semibold ${
                isOptimal
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : isWarning
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {isOptimal ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <AlertCircle className="w-3 h-3 text-amber-600" />
              )}
              {isOptimal ? "Optimal (≤70%)" : isWarning ? "Waspada (70-90%)" : "Defisit (>90%)"}
            </span>
          </div>

          <div className="text-xl font-mono tabular-nums font-bold text-[var(--ink)]">
            {(summary.efficiency_ratio * 100).toFixed(1)}%
          </div>

          <p className="text-[11px] text-[var(--ink-muted)] mt-1">
            Harga Acuan Pasar GKP:{" "}
            <span className="font-mono tabular-nums font-medium">
              Rp {summary.market_reference_price_per_kg.toLocaleString("id-ID")} / kg
            </span>
          </p>
        </div>
      </div>

      {/* Rincian Alokasi Modal Kerja Pra-Tanam (HOK & Input Utama) */}
      {isBera && (
        <div className="mb-4 bg-emerald-50/40 border border-emerald-200/70 rounded-[3px] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
            <span className="text-xs font-semibold text-[#1b4332] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              Rencana Alokasi Modal Kerja Pra-Tanam Riil (0,37 Ha)
            </span>
            <span className="text-[11px] font-mono font-medium text-emerald-800">
              Varietas: Inpari 32 HDB
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {/* Olah Tanah I */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Tractor className="w-3.5 h-3.5 text-[#1b4332]" />
                  Olah Tanah I (Bajak Singkal)
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 240.000</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                2 HOK Traktor @ Rp 120.000 • Pembalikan & aerasi tanah awal
              </p>
            </div>

            {/* Perbaikan Galengan */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Shovel className="w-3.5 h-3.5 text-[#1b4332]" />
                  Perbaikan Galengan & Pematang
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 270.000</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                3 HOK @ Rp 90.000 • Penguatan pematang kontur terasiring lereng
              </p>
            </div>

            {/* Pelumpuran & Perataan */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-[#1b4332]" />
                  Pelumpuran & Perataan Tanah II
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 240.000</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                2 HOK @ Rp 120.000 • Puddling halus penyediaan media semai
              </p>
            </div>

            {/* Benih Inpari 32 */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5 text-[#1b4332]" />
                  Benih Inpari 32 HDB
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 160.000</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                10 kg bibit unggul bersertifikat @ Rp 16.000 • Tahan kresek HDB
              </p>
            </div>

            {/* Pupuk Dasar */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#1b4332]" />
                  Pupuk Dasar (NPK + Urea)
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 567.500</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                NPK Phonska (40 kg) & Urea (35 kg) • Nutrisi basal awal
              </p>
            </div>

            {/* Sewa Lahan */}
            <div className="bg-white border border-emerald-100 rounded-[3px] p-2.5 shadow-sm">
              <div className="flex items-center justify-between font-medium text-[var(--ink)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-[#1b4332]" />
                  Sewa Lahan Proporsional
                </span>
                <span className="font-mono font-bold text-[#1b4332]">Rp 925.000</span>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)]">
                Alokasi sewa 0,37 Ha (Rp 2,5 jt/ha/musim) • Beban modal tetap
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stacked Cost Composition Bar */}
      <div className="space-y-1.5 mb-2">
        <div className="flex justify-between text-[11px] text-[var(--ink-muted)] font-medium">
          <span>
            {isBera
              ? "Komposisi Alokasi Modal Usaha Tani Pra-Tanam"
              : "Komposisi Biaya Usaha Tani Berjalan"}
          </span>
          <span>Total: 100%</span>
        </div>

        <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${laborPct}%` }}
            className="bg-[#1b4332] h-full transition-all duration-500"
            title={`Upah HOK: ${laborPct}%`}
          />
          <div
            style={{ width: `${saprotanPct}%` }}
            className="bg-[#40916c] h-full transition-all duration-500"
            title={`Pupuk / Saprotan: ${saprotanPct}%`}
          />
          <div
            style={{ width: `${irrigationPct}%` }}
            className="bg-[#74c69d] h-full transition-all duration-500"
            title={`BBM Irigasi: ${irrigationPct}%`}
          />
          <div
            style={{ width: `${landPct}%` }}
            className="bg-[#b7e4c7] h-full transition-all duration-500"
            title={`Sewa Lahan: ${landPct}%`}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1b4332] shrink-0" />
            <span className="text-[var(--ink-muted)]">{isBera ? "HOK Olah Lahan:" : "HOK:"}</span>
            <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
              Rp {summary.cost_breakdown.labor.toLocaleString("id-ID")} ({laborPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#40916c] shrink-0" />
            <span className="text-[var(--ink-muted)]">{isBera ? "Pupuk Dasar:" : "Saprotan:"}</span>
            <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
              Rp {summary.cost_breakdown.saprotan.toLocaleString("id-ID")} ({saprotanPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#74c69d] shrink-0" />
            <span className="text-[var(--ink-muted)]">BBM Irigasi:</span>
            <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
              Rp {summary.cost_breakdown.irrigation.toLocaleString("id-ID")} ({irrigationPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#b7e4c7] shrink-0" />
            <span className="text-[var(--ink-muted)]">Sewa Lahan:</span>
            <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
              Rp {summary.cost_breakdown.land_rental.toLocaleString("id-ID")} ({landPct}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
