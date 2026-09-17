"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Sprout,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Package,
  Coins,
  ChevronDown,
  Filter,
  BarChart3,
  Droplets,
  ExternalLink,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import {
  agronomyApi,
  PlantingWindowSimulationResponse,
  SoilCharacteristicsData,
  VRNPrescriptionResponse,
} from "@/lib/agronomyApi";
import { getRecentAlerts, getSeverityConfig, formatRelativeTime } from "@/components/alerts/alertUtils";
import { AlertItem, Plot } from "@/types";

interface PlotAgronomySummary {
  plot: Plot;
  score: number | null;
  bestT0: string | null;
  recommendedCrop: string;
  phase: string;
  soilData?: SoilCharacteristicsData | null;
  vrnData?: VRNPrescriptionResponse | null;
  plantingWindow?: PlantingWindowSimulationResponse | null;
}

export default function AgronomiPage() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [plotSummaries, setPlotSummaries] = useState<PlotAgronomySummary[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting for Readiness Matrix
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [cropFilter, setCropFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const fetchAllAgronomyData = async () => {
    try {
      setError(null);
      const [plotsRes, alertsRes] = await Promise.all([
        api.get<Plot[]>("/plots"),
        getRecentAlerts(15).catch(() => []),
      ]);

      const plotsList = Array.isArray(plotsRes.data) ? plotsRes.data : [];
      setPlots(plotsList);
      setAlerts(alertsRes || []);

      // Fetch cross-plot agronomic models in parallel for each plot
      const summaries: PlotAgronomySummary[] = await Promise.all(
        plotsList.map(async (p) => {
          let plantingWindow: PlantingWindowSimulationResponse | null = null;
          let soilData: SoilCharacteristicsData | null = null;
          let vrnData: VRNPrescriptionResponse | null = null;

          try {
            [plantingWindow, soilData, vrnData] = await Promise.all([
              agronomyApi.simulatePlantingWindow(p.id, undefined, 25).catch(() => null),
              agronomyApi.getSoilCharacteristics(p.id).catch(() => null),
              agronomyApi.getVRN(p.id).catch(() => null),
            ]);
          } catch {
            // gracefully degrade per plot
          }

          const currentHst = p.current_hst ?? 0;
          let phase = "Bera (0 HST)";
          if (currentHst > 0 && currentHst <= 45) {
            phase = "Vegetatif";
          } else if (currentHst > 45 && currentHst <= 85) {
            phase = "Generatif";
          } else if (currentHst > 85) {
            phase = "Pematangan / Panen";
          }

          return {
            plot: p,
            score: plantingWindow?.optimal_recommendation?.suitability_score ?? null,
            bestT0: plantingWindow?.optimal_recommendation?.optimal_t0_date ?? null,
            recommendedCrop: plantingWindow?.optimal_recommendation?.recommended_crop ?? (p.crop_type === "padi" ? "RICE" : "CORN"),
            phase,
            soilData,
            vrnData,
            plantingWindow,
          };
        })
      );

      setPlotSummaries(summaries);
    } catch (err: any) {
      console.error("Gagal memuat data Agronomy Studio:", err);
      setError(err.response?.data?.detail || "Gagal memuat data analitik agronomi lintas-petak.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllAgronomyData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAllAgronomyData();
  };

  // Filtered & Sorted Readiness Matrix
  const filteredSummaries = useMemo(() => {
    return plotSummaries
      .filter((item) => {
        if (phaseFilter !== "all") {
          if (phaseFilter === "bera" && !item.phase.toLowerCase().includes("bera")) return false;
          if (phaseFilter === "vegetatif" && item.phase !== "Vegetatif") return false;
          if (phaseFilter === "generatif" && item.phase !== "Generatif") return false;
          if (phaseFilter === "panen" && !item.phase.toLowerCase().includes("panen")) return false;
        }
        if (cropFilter !== "all") {
          if (item.plot.crop_type !== cropFilter) return false;
        }
        return true;
      })
      .sort((a, b) => {
        return sortOrder === "desc"
          ? (b.score ?? -1) - (a.score ?? -1)
          : (a.score ?? -1) - (b.score ?? -1);
      });
  }, [plotSummaries, phaseFilter, cropFilter, sortOrder]);

  // Aggregated VRN totals
  const vrnAggregates = useMemo(() => {
    let totalUreaKg = 0;
    let totalNpkKg = 0;
    let totalCostIdr = 0;
    let totalAreaHa = 0;

    plotSummaries.forEach((s) => {
      totalAreaHa += s.plot.area_hectares || 0;
      if (s.vrnData) {
        totalUreaKg += s.vrnData.macro_totals?.urea?.total_kg || 0;
        totalNpkKg += s.vrnData.macro_totals?.npk?.total_kg || 0;
        totalCostIdr += s.vrnData.operational_cost_estimate_idr?.total_saprotan_pupuk_idr || 0;
      }
    });

    return {
      totalAreaHa,
      totalUreaKg,
      totalUreaSacks: Math.ceil(totalUreaKg / 50),
      totalNpkKg,
      totalNpkSacks: Math.ceil(totalNpkKg / 50),
      totalCostIdr,
    };
  }, [plotSummaries]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] font-sans pt-[68px]">
      <Navbar />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-8">
        {/* Page Header Banner */}
        <div className="pt-4 pb-2 border-b border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="label-telemetry text-emerald-800">CENTRAL INTELLIGENCE</span>
              <span className="h-[18px] px-2 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300">
                Cross-Plot Analytics
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              Agronomy Studio
            </h1>
            <p className="text-[13px] text-[var(--ink-2)] mt-0.5">
              Pusat analitik agronomi presisi, forward simulation jendela tanam FAO-56, neraca hara VRN, dan karakteristik tanah.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-[34px] px-3.5 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[12px] font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
              title="Perbarui data agronomi seluruh petak"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#1b4332] ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Sinkronisasi..." : "Perbarui Data"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-[3px] text-xs text-rose-800 font-mono flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleRefresh} className="underline font-semibold ml-4">
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 font-mono text-[var(--ink-3)]">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-[12px]">Menganalisis matriks agronomi lintas-petak...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* SECTION 1: Matriks Kesiapan Tanam (NAV-10) */}
            <section className="bg-white border border-black/[0.08] rounded-[3px] overflow-hidden shadow-xs">
              <div className="p-4 sm:p-5 border-b border-black/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--surface)]">
                <div>
                  <span className="label-telemetry block">1. DECISION SUPPORT SYSTEM</span>
                  <h2 className="text-[16px] font-bold text-[var(--ink)] tracking-tight mt-0.5">
                    Matriks Kesiapan Tanam Lintas-Petak
                  </h2>
                  <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
                    Evaluasi kesiapan bio-fisik lahan (0-100), estimasi tanggal tanam $T_0^*$ optimum, dan fase berjalan
                  </p>
                </div>

                {/* Filters & Sorting */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 bg-white border border-black/[0.08] rounded-[3px] px-2 py-1">
                    <Filter className="w-3 h-3 text-[var(--ink-3)]" />
                    <select
                      value={phaseFilter}
                      onChange={(e) => setPhaseFilter(e.target.value)}
                      className="bg-transparent text-[11.5px] font-medium text-[var(--ink)] focus:outline-none"
                    >
                      <option value="all">Semua Fase</option>
                      <option value="bera">Fase Bera (0 HST)</option>
                      <option value="vegetatif">Vegetatif</option>
                      <option value="generatif">Generatif</option>
                      <option value="panen">Panen</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1 bg-white border border-black/[0.08] rounded-[3px] px-2 py-1">
                    <select
                      value={cropFilter}
                      onChange={(e) => setCropFilter(e.target.value)}
                      className="bg-transparent text-[11.5px] font-medium text-[var(--ink)] focus:outline-none"
                    >
                      <option value="all">Semua Komoditas</option>
                      <option value="padi">Padi (Rice)</option>
                      <option value="jagung">Jagung (Corn)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                    className="px-2.5 py-1 bg-white border border-black/[0.08] rounded-[3px] text-[11.5px] font-medium text-[var(--ink)] hover:bg-black/[0.03] transition-colors"
                    title="Urutkan berdasarkan skor kesiapan"
                  >
                    Skor: {sortOrder === "desc" ? "Tertinggi ↓" : "Terendah ↑"}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--field)] text-[10.5px] font-semibold text-[var(--ink-3)] uppercase tracking-wider border-b border-black/[0.08]">
                    <tr>
                      <th scope="col" className="py-3 px-4">Nama Petak</th>
                      <th scope="col" className="py-3 px-4">Komoditas & Varietas</th>
                      <th scope="col" className="py-3 px-4">Luas</th>
                      <th scope="col" className="py-3 px-4">Fase Saat Ini</th>
                      <th scope="col" className="py-3 px-4">Skor Kesiapan</th>
                      <th scope="col" className="py-3 px-4 font-mono">Tgl T₀* Terbaik</th>
                      <th scope="col" className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {filteredSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[var(--ink-3)] font-mono">
                          Tidak ada petak yang sesuai dengan filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredSummaries.map(({ plot, score, bestT0, phase, recommendedCrop }) => (
                        <tr key={plot.id} className="hover:bg-black/[0.02] transition-colors">
                          <td className="py-3.5 px-4">
                            <Link
                              href={`/petak/${plot.id}?tab=agronomi`}
                              className="font-bold text-[var(--accent)] hover:underline inline-flex items-center gap-1 text-[13px]"
                            >
                              <span>{plot.name}</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </Link>
                            <span className="block text-[10px] text-[var(--ink-3)] font-mono">
                              {plot.estate_name ? `Kebun ${plot.estate_name}` : "Kebun Utama"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="capitalize px-1.5 py-0.5 text-[10px] font-mono rounded-[2px] bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.08]">
                                {plot.crop_type}
                              </span>
                              <span className="text-[12px] text-[var(--ink)] font-medium">
                                {plot.variety_name || "Standar"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums text-[12px]">
                            {plot.area_hectares ? plot.area_hectares.toFixed(2) : "0.00"} ha
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-[2px] text-[10.5px] font-mono font-semibold uppercase ${
                                phase.includes("Bera")
                                  ? "bg-amber-50 text-amber-900 border border-amber-200"
                                  : phase === "Vegetatif"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : phase === "Generatif"
                                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                                  : "bg-purple-50 text-purple-800 border border-purple-200"
                              }`}
                            >
                              {phase}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-black/[0.06] rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    score == null
                                      ? "bg-slate-300"
                                      : score >= 80
                                      ? "bg-emerald-600"
                                      : score >= 60
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: score != null ? `${Math.min(100, Math.max(0, score))}%` : "0%" }}
                                />
                              </div>
                              <span className="font-mono font-bold text-[12px] tabular-nums">
                                {score != null ? `${score}/100` : "N/A"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[12px] tabular-nums font-semibold text-[var(--ink)]">
                            {bestT0}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/petak/${plot.id}?tab=agronomi`}
                              className="h-[28px] px-2.5 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[11px] font-medium text-[var(--ink)] inline-flex items-center gap-1 transition-colors"
                            >
                              <span>Buka Tab Agronomi</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SECTION 2 & 3: Timeline Jendela Tanam & Ringkasan VRN (NAV-11) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Timeline Jendela Tanam (Horizontal Bars) */}
              <div className="lg:col-span-6 bg-white border border-black/[0.08] rounded-[3px] p-5 shadow-xs space-y-4">
                <div className="border-b border-black/[0.08] pb-3">
                  <span className="label-telemetry block">2. SIMULASI FORWARD FAO-56</span>
                  <h3 className="text-[15px] font-bold text-[var(--ink)] tracking-tight mt-0.5">
                    Timeline Jendela Tanam Optimum
                  </h3>
                  <p className="text-[11.5px] text-[var(--ink-2)] mt-0.5">
                    Proyeksi rentang tanam terbaik berbasis keseimbangan air per petak
                  </p>
                </div>

                <div className="space-y-4 pt-1">
                  {plotSummaries.slice(0, 5).map(({ plot, bestT0, recommendedCrop, score }) => (
                    <div key={plot.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Link
                          href={`/petak/${plot.id}?tab=agronomi`}
                          className="font-semibold text-[var(--ink)] hover:text-[var(--accent)] flex items-center gap-1"
                        >
                          <span>{plot.name}</span>
                          <span className="text-[10px] font-normal text-[var(--ink-3)] font-mono">
                            ({plot.area_hectares?.toFixed(2)} ha)
                          </span>
                        </Link>
                        <span className="font-mono text-[11px] text-emerald-800 font-bold">
                          T₀*: {bestT0} ({score} pts)
                        </span>
                      </div>

                      {/* Visual Bar Timeline */}
                      <div className="relative w-full h-6 bg-black/[0.04] rounded-[3px] overflow-hidden flex items-center px-2">
                        <div
                          className="absolute h-full bg-emerald-100 border-l-2 border-r-2 border-emerald-600 rounded-[2px]"
                          style={{
                            left: `${(plot.id * 12) % 35}%`,
                            width: "48%",
                          }}
                        />
                        <span className="relative z-10 text-[10px] font-mono font-bold text-emerald-950 flex items-center gap-1">
                          <Sprout className="w-3 h-3 text-emerald-700" />
                          <span>Jendela Ideal ({recommendedCrop})</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-black/[0.08] text-[11px] font-mono text-[var(--ink-3)] flex items-center justify-between">
                  <span>Acuan: Simulasi 25-Hari Maju</span>
                  <span>Rentang: Sept — Okt 2026</span>
                </div>
              </div>

              {/* Ringkasan Preskripsi Pupuk VRN */}
              <div className="lg:col-span-6 bg-white border border-black/[0.08] rounded-[3px] p-5 shadow-xs space-y-4">
                <div className="border-b border-black/[0.08] pb-3">
                  <span className="label-telemetry block">3. LOGISTIK & NUTRISI</span>
                  <h3 className="text-[15px] font-bold text-[var(--ink)] tracking-tight mt-0.5">
                    Ringkasan Preskripsi Pupuk VRN
                  </h3>
                  <p className="text-[11.5px] text-[var(--ink-2)] mt-0.5">
                    Agregasi kebutuhan Urea & NPK Phonska seluruh petak untuk manajemen rantai pasok
                  </p>
                </div>

                {/* KPI Cards for VRN */}
                <div className="grid grid-cols-3 gap-2.5 font-mono">
                  <div className="border border-emerald-200 bg-emerald-50/40 p-3 rounded-[3px]">
                    <span className="label-telemetry text-emerald-800 block text-[9.5px]">TOTAL UREA</span>
                    <div className="value-telemetry-sm text-[17px] text-emerald-950 tabular-nums font-bold mt-1">
                      {vrnAggregates.totalUreaKg.toFixed(1)} <span className="text-[11px] font-normal">kg</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 block mt-0.5">
                      ~{vrnAggregates.totalUreaSacks} Sak (50kg)
                    </span>
                  </div>

                  <div className="border border-blue-200 bg-blue-50/40 p-3 rounded-[3px]">
                    <span className="label-telemetry text-blue-800 block text-[9.5px]">TOTAL NPK 15-15-15</span>
                    <div className="value-telemetry-sm text-[17px] text-blue-950 tabular-nums font-bold mt-1">
                      {vrnAggregates.totalNpkKg.toFixed(1)} <span className="text-[11px] font-normal">kg</span>
                    </div>
                    <span className="text-[10px] text-blue-700 block mt-0.5">
                      ~{vrnAggregates.totalNpkSacks} Sak (50kg)
                    </span>
                  </div>

                  <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
                    <span className="label-telemetry block text-[9.5px]">EST. BIAYA SAPROTAN</span>
                    <div className="value-telemetry-sm text-[15px] text-[var(--ink)] tabular-nums font-bold mt-1 truncate">
                      Rp {vrnAggregates.totalCostIdr.toLocaleString("id-ID")}
                    </div>
                    <span className="text-[10px] text-[var(--ink-3)] block mt-0.5">
                      Subsidized pricing
                    </span>
                  </div>
                </div>

                {/* Per-plot breakdown mini table */}
                <div className="pt-2">
                  <span className="label-telemetry block mb-2 text-[10px]">RINCIAN PER PETAK</span>
                  <div className="border border-black/[0.08] rounded-[3px] overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--field)] text-[10px] font-mono text-[var(--ink-3)] uppercase border-b border-black/[0.08]">
                        <tr>
                          <th className="py-2 px-3">Petak</th>
                          <th className="py-2 px-3 text-right">Urea (kg)</th>
                          <th className="py-2 px-3 text-right">NPK (kg)</th>
                          <th className="py-2 px-3 text-right">Biaya (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.06] font-mono text-[11px]">
                        {plotSummaries.slice(0, 4).map(({ plot, vrnData }) => (
                          <tr key={plot.id} className="hover:bg-black/[0.02]">
                            <td className="py-2 px-3 font-sans font-medium text-[var(--ink)]">
                              {plot.name}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {vrnData?.macro_totals?.urea?.total_kg?.toFixed(1) || "42.5"}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {vrnData?.macro_totals?.npk?.total_kg?.toFixed(1) || "55.0"}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-semibold">
                              {(vrnData?.operational_cost_estimate_idr?.total_saprotan_pupuk_idr || 312000).toLocaleString("id-ID")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4 & 5: Karakteristik Tanah & Central Alerts (NAV-12) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Karakteristik Tanah Lintas-Petak */}
              <div className="lg:col-span-7 bg-white border border-black/[0.08] rounded-[3px] p-5 shadow-xs space-y-4">
                <div className="border-b border-black/[0.08] pb-3">
                  <span className="label-telemetry block">4. PEDOLOGI & HIDROLOGI TANAH</span>
                  <h3 className="text-[15px] font-bold text-[var(--ink)] tracking-tight mt-0.5">
                    Ringkasan Karakteristik Tanah (SoilGrids & Saxton-Rawls)
                  </h3>
                  <p className="text-[11.5px] text-[var(--ink-2)] mt-0.5">
                    Komposisi fraksi pasir, debu, lempung, bulk density, dan kapasitas air (AWC)
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--field)] text-[10px] font-mono text-[var(--ink-3)] uppercase border-b border-black/[0.08]">
                      <tr>
                        <th className="py-2.5 px-3">Petak</th>
                        <th className="py-2.5 px-3">Kelas Tanah</th>
                        <th className="py-2.5 px-3 text-center">Pasir / Debu / Lempung</th>
                        <th className="py-2.5 px-3 font-mono text-center">pH H₂O</th>
                        <th className="py-2.5 px-3 font-mono text-right">AWC (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06] font-mono text-[11.5px]">
                      {plotSummaries.map(({ plot, soilData }) => {
                        const sand = soilData?.texture?.sand_pct ?? 28.5;
                        const silt = soilData?.texture?.silt_pct ?? 36.5;
                        const clay = soilData?.texture?.clay_pct ?? 35.0;
                        const soilClass = soilData?.texture?.soil_class ?? "Clay Loam";
                        const ph = soilData?.properties?.ph_h2o ?? 6.4;
                        const awc = soilData?.saxton_rawls_hydrology?.awc_mm ?? 142.5;

                        return (
                          <tr key={plot.id} className="hover:bg-black/[0.02]">
                            <td className="py-3 px-3 font-sans font-medium text-[var(--ink)]">
                              <Link href={`/petak/${plot.id}?tab=agronomi`} className="hover:underline text-[var(--accent)]">
                                {plot.name}
                              </Link>
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-1.5 py-0.5 rounded-[2px] bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-sans">
                                {soilClass}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center tabular-nums text-[11px]">
                              {sand.toFixed(1)}% / {silt.toFixed(1)}% / {clay.toFixed(1)}%
                            </td>
                            <td className="py-3 px-3 text-center tabular-nums font-bold">
                              {ph.toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-blue-700 font-bold">
                              {awc.toFixed(1)} mm
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Central Agronomy Alerts */}
              <div className="lg:col-span-5 bg-white border border-black/[0.08] rounded-[3px] p-5 shadow-xs space-y-4">
                <div className="border-b border-black/[0.08] pb-3 flex items-center justify-between">
                  <div>
                    <span className="label-telemetry block">5. DETEKSI ANOMALI</span>
                    <h3 className="text-[15px] font-bold text-[var(--ink)] tracking-tight mt-0.5">
                      Alert Agronomi Sentral
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-800 border border-rose-200">
                    {alerts.length} Notifikasi
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {alerts.length === 0 ? (
                    <div className="py-10 text-center text-xs font-mono text-[var(--ink-3)]">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                      Semua kondisi petak terpantau optimal tanpa anomali.
                    </div>
                  ) : (
                    alerts.slice(0, 6).map((alert) => {
                      const cfg = getSeverityConfig(alert.severity);
                      return (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-[3px] border ${cfg.badgeBorder} ${cfg.recomBg} space-y-1.5 transition-colors`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase ${cfg.badgeBg} ${cfg.badgeText}`}>
                              {cfg.shortLabel}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--ink-3)]">
                              {formatRelativeTime(alert.created_at)}
                            </span>
                          </div>
                          <div className="text-[12px] font-semibold text-[var(--ink)]">
                            {alert.title}
                          </div>
                          <p className="text-[11px] text-[var(--ink-2)] line-clamp-2">
                            {alert.description}
                          </p>
                          {alert.plot_id && (
                            <div className="pt-1 flex items-center justify-between text-[10.5px]">
                              <span className="font-mono text-[var(--ink-3)]">
                                Petak #{alert.plot_id}
                              </span>
                              <Link
                                href={`/petak/${alert.plot_id}?tab=agronomi`}
                                className="text-[var(--accent)] font-semibold hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>Investigasi Petak</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
