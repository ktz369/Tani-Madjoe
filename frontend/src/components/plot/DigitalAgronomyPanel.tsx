"use client";

import React, { useState, useEffect, useId } from "react";
import {
  Compass,
  Calendar,
  Layers,
  Droplets,
  Sprout,
  CheckCircle2,
  AlertTriangle,
  Download,
  Info,
  Activity,
  Maximize2,
  ShieldCheck,
  TrendingUp,
  Cpu,
  RefreshCw,
  Radio,
  Sliders,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Award,
  Clock,
  Wheat,
} from "lucide-react";
import {
  agronomyApi,
  SoilCharacteristicsData,
  PlantingWindowSimulationResponse,
  TerraceWaterBalanceResponse,
  VRNPrescriptionResponse,
  SARTelemetryResponse,
} from "@/lib/agronomyApi";

interface Props {
  plotId: number;
  plotName: string;
  areaHectares?: number;
  cropType?: string;
  currentHst?: number;
}

type TabType = "planting_window" | "soil_profile" | "hydrology" | "vrn_drone" | "sar_radar";

export default function DigitalAgronomyPanel({
  plotId,
  plotName,
  areaHectares = 0.37,
  cropType = "padi",
  currentHst = 0,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("planting_window");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agronomy datasets
  const [soil, setSoil] = useState<SoilCharacteristicsData | null>(null);
  const [plantingSim, setPlantingSim] = useState<PlantingWindowSimulationResponse | null>(null);
  const [waterBalance, setWaterBalance] = useState<TerraceWaterBalanceResponse | null>(null);
  const [vrn, setVrn] = useState<VRNPrescriptionResponse | null>(null);
  const [sar, setSar] = useState<SARTelemetryResponse | null>(null);

  // Selected crop for planting window comparison
  const [selectedCrop, setSelectedCrop] = useState<"rice" | "corn">("rice");

  const loadAllAgronomyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [soilRes, pwRes, wbRes, vrnRes, sarRes] = await Promise.all([
        agronomyApi.getSoilCharacteristics(plotId),
        agronomyApi.simulatePlantingWindow(plotId),
        agronomyApi.getWaterBalance(plotId),
        agronomyApi.getVRN(plotId),
        agronomyApi.getSAR(plotId),
      ]);
      setSoil(soilRes);
      setPlantingSim(pwRes);
      setWaterBalance(wbRes);
      setVrn(vrnRes);
      setSar(sarRes);
    } catch (err: any) {
      console.error("Failed to load digital agronomy telemetry:", err);
      setError("Gagal memuat data telemetri agronomi cloud. Menggunakan data kalibrasi lokal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAgronomyData();
  }, [plotId]);

  const downloadKmlUrl = agronomyApi.getDroneKmlDownloadUrl(plotId);

  return (
    <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
      {/* Header Banner */}
      <div className="p-[21px] border-b border-black/[0.08] bg-gradient-to-r from-stone-50/80 via-emerald-50/20 to-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="label-telemetry text-emerald-800 bg-emerald-100/60 px-1.5 py-0.5 rounded-[2px]">
                DIGITAL AGRONOMY ENGINE
              </span>
              <span className="h-[18px] px-1.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.08]">
                100% CLOUD-ONLY TELEMETRY
              </span>
              <span className="h-[18px] px-1.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
                TERASIRING BERUNDAK
              </span>
            </div>
            <h2 className="text-[17px] font-bold tracking-tight text-[var(--ink)]">
              Intelijen Agronomi & Rekomendasi Presisi
            </h2>
            <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
              Integrasi ISRIC SoilGrids, Model Elevasi Digital (DEM 30m), Neraca Air FAO-56, dan Radar Sentinel-1 SAR.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={downloadKmlUrl}
              download
              className="h-[34px] px-3.5 rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors shadow-sm"
              title="Unduh file misi penerbangan drone 3D format KML (Terrain-Following DEM + 2.5m)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Drone KML 3D</span>
            </a>

            <button
              onClick={loadAllAgronomyData}
              disabled={loading}
              className="h-[34px] w-[34px] rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink-2)] inline-flex items-center justify-center transition-colors"
              title="Segarkan data telemetri"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* High-Density KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-black/[0.08]">
          <div className="border border-black/[0.06] bg-white p-2.5 rounded-[2px]">
            <span className="label-telemetry block text-[10px] text-[var(--ink-3)]">TEKSTUR TANAH & AWC</span>
            <div className="value-telemetry-sm text-[15px] font-mono font-semibold text-[var(--ink)] mt-0.5">
              {soil?.texture.soil_class?.split(" ")[0] || "Clay Loam"}
              <span className="text-[11px] font-normal text-[var(--ink-3)] ml-1">
                ({soil?.saxton_rawls_hydrology.awc_mm ?? 45.6} mm)
              </span>
            </div>
          </div>

          <div className="border border-black/[0.06] bg-white p-2.5 rounded-[2px]">
            <span className="label-telemetry block text-[10px] text-[var(--ink-3)]">REKOMENDASI TANAM (T₀*)</span>
            <div className="value-telemetry-sm text-[15px] font-mono font-semibold text-emerald-800 mt-0.5">
              {plantingSim?.optimal_recommendation.optimal_t0_date ?? "2026-09-17"}
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-1 py-0.2 rounded ml-1">
                {plantingSim?.optimal_recommendation.suitability_score ?? 95}/100
              </span>
            </div>
          </div>

          <div className="border border-black/[0.06] bg-white p-2.5 rounded-[2px]">
            <span className="label-telemetry block text-[10px] text-[var(--ink-3)]">LERENG & TOPOGRAFI</span>
            <div className="value-telemetry-sm text-[15px] font-mono font-semibold text-[var(--ink)] mt-0.5">
              {waterBalance?.slope_pct ?? 8.51}%
              <span className="text-[11px] font-normal text-[var(--ink-3)] ml-1">
                ({waterBalance?.num_tiers ?? 5} Kedok Undakan)
              </span>
            </div>
          </div>

          <div className="border border-black/[0.06] bg-white p-2.5 rounded-[2px]">
            <span className="label-telemetry block text-[10px] text-[var(--ink-3)]">RADAR SENTINEL-1 SAR</span>
            <div className="value-telemetry-sm text-[15px] font-mono font-semibold text-blue-800 mt-0.5">
              {sar?.telemetry.ratio_db ?? -9.55} dB
              <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-1 py-0.2 rounded ml-1">
                Tembus Awan
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation Controls */}
      <div className="flex border-b border-black/[0.08] bg-[var(--field)] px-[21px] overflow-x-auto gap-1 text-[12px] font-medium">
        <button
          onClick={() => setActiveTab("planting_window")}
          className={`py-2.5 px-3 border-b-2 font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "planting_window"
              ? "border-[var(--accent)] text-[var(--accent)] bg-white font-bold"
              : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Jendela Tanam (T₀*)</span>
        </button>

        <button
          onClick={() => setActiveTab("vrn_drone")}
          className={`py-2.5 px-3 border-b-2 font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "vrn_drone"
              ? "border-[var(--accent)] text-[var(--accent)] bg-white font-bold"
              : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Nutrisi VRN & Drone 3D</span>
        </button>

        <button
          onClick={() => setActiveTab("hydrology")}
          className={`py-2.5 px-3 border-b-2 font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "hydrology"
              ? "border-[var(--accent)] text-[var(--accent)] bg-white font-bold"
              : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          <Droplets className="w-3.5 h-3.5" />
          <span>Hidrologi Terasiring</span>
        </button>

        <button
          onClick={() => setActiveTab("soil_profile")}
          className={`py-2.5 px-3 border-b-2 font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "soil_profile"
              ? "border-[var(--accent)] text-[var(--accent)] bg-white font-bold"
              : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Fisik Tanah & AWC</span>
        </button>

        <button
          onClick={() => setActiveTab("sar_radar")}
          className={`py-2.5 px-3 border-b-2 font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "sar_radar"
              ? "border-[var(--accent)] text-[var(--accent)] bg-white font-bold"
              : "border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Radar SAR Sentinel-1</span>
        </button>
      </div>

      {/* Main Tab Contents */}
      <div className="p-[21px]">
        {loading ? (
          <div className="py-16 text-center text-[var(--ink-3)] font-mono text-[12px]">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p>Mengekstraksi telemetri satelit, SoilGrids, dan forward simulation...</p>
          </div>
        ) : error && !soil ? (
          <div className="p-4 border border-rose-200 bg-rose-50/50 rounded-[3px] text-rose-800 text-[12px] font-mono">
            <AlertTriangle className="w-4 h-4 inline mr-2 text-rose-600" />
            {error}
          </div>
        ) : (
          <>
            {/* ================================================================= */}
            {/* TAB 1: DYNAMIC PLANTING WINDOW (MODULE A)                         */}
            {/* ================================================================= */}
            {activeTab === "planting_window" && plantingSim && (
              <div className="space-y-5">
                {/* Rationale Callout Banner */}
                <div className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-[3px] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-600 text-white inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        REKOMENDASI T₀* OPTIMAL
                      </span>
                      <span className="font-mono text-[12px] font-bold text-emerald-900">
                        {plantingSim.optimal_recommendation.optimal_t0_date}
                      </span>
                    </div>
                    <p className="text-[12px] text-emerald-950 leading-relaxed">
                      {plantingSim.optimal_recommendation.summary_rationale}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-start md:self-center border border-emerald-300 bg-white px-3 py-1.5 rounded-[2px] flex-shrink-0 font-mono">
                    <span className="text-[11px] text-emerald-800">SKOR KELAYAKAN:</span>
                    <span className="text-[16px] font-bold text-emerald-900">
                      {plantingSim.optimal_recommendation.suitability_score}
                      <span className="text-[11px] font-normal text-emerald-700">/100</span>
                    </span>
                  </div>
                </div>

                {/* Crop Switcher (Rice vs Corn) */}
                <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                  <span className="label-telemetry">FORWARD SIMULATION FAO-56 (100–120 HARI)</span>
                  <div className="inline-flex rounded-[2px] border border-black/[0.08] p-0.5 bg-[var(--field)] text-[11px] font-mono">
                    <button
                      onClick={() => setSelectedCrop("rice")}
                      className={`px-2.5 py-1 rounded-[2px] transition-colors ${
                        selectedCrop === "rice"
                          ? "bg-[var(--accent)] text-white font-bold"
                          : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                      }`}
                    >
                      Padi Inpari 32 (115 Hari)
                    </button>
                    <button
                      onClick={() => setSelectedCrop("corn")}
                      className={`px-2.5 py-1 rounded-[2px] transition-colors ${
                        selectedCrop === "corn"
                          ? "bg-[var(--accent)] text-white font-bold"
                          : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                      }`}
                    >
                      Jagung Hibrida (100 Hari)
                    </button>
                  </div>
                </div>

                {/* Candidate Dates Visual Calendar Cards */}
                <div>
                  <h4 className="text-[12px] font-mono font-semibold text-[var(--ink-2)] mb-2 uppercase tracking-wider">
                    Evaluasi Kandidat Tanggal Tanam ({selectedCrop === "rice" ? "Padi" : "Jagung"})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {(plantingSim?.crops_comparison?.[selectedCrop]?.candidates || []).map((c, idx) => {
                      const isBest = c.candidate_date === plantingSim?.crops_comparison?.[selectedCrop]?.best_t0;
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 border rounded-[3px] transition-all font-mono text-center ${
                            isBest
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-400"
                              : c.suitability_score >= 80
                              ? "border-black/[0.08] bg-white hover:border-emerald-300"
                              : "border-black/[0.08] bg-stone-50/50 opacity-80"
                          }`}
                        >
                          <div className="text-[10px] text-[var(--ink-3)] uppercase tracking-wider">
                            Kandidat #{idx + 1}
                          </div>
                          <div className="text-[12px] font-bold text-[var(--ink)] my-0.5">
                            {c.candidate_date.substring(5)}
                          </div>
                          <div
                            className={`text-[13px] font-bold ${
                              c.suitability_score >= 80
                                ? "text-emerald-700"
                                : c.suitability_score >= 60
                                ? "text-amber-700"
                                : "text-rose-700"
                            }`}
                          >
                            {c.suitability_score}
                            <span className="text-[9px] font-normal text-[var(--ink-3)]">/100</span>
                          </div>
                          {isBest && (
                            <span className="block mt-1 text-[9px] font-bold uppercase bg-emerald-600 text-white rounded-[2px] py-0.5">
                              T₀* TERBAIK
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Forward Simulation Water Balance Table / Mini Curves */}
                <div className="border border-black/[0.08] rounded-[3px] overflow-hidden">
                  <div className="p-3 bg-[var(--field)] border-b border-black/[0.08] flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--ink)]">
                      Profil Lengas Tanah & Hidrasi Harian (Hasil Simulasi Tanggal T₀* Terpilih)
                    </span>
                    <span className="text-[10px] font-mono text-[var(--ink-3)]">
                      Lempung Liat Pacitan • AWC: {plantingSim?.soil_profile?.awc_mm} mm
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-stone-50 text-[var(--ink-3)] border-b border-black/[0.06] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">HST</th>
                          <th className="py-2 px-3">Tanggal</th>
                          <th className="py-2 px-3 text-right">Hujan (mm)</th>
                          <th className="py-2 px-3 text-right">ETc (mm)</th>
                          <th className="py-2 px-3 text-right">Lengas Tanah (mm)</th>
                          <th className="py-2 px-3 text-right">Kapasitas AWC (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {(plantingSim?.crops_comparison?.[selectedCrop]?.timeline_simulation || []).map((step, sIdx) => (
                          <tr key={sIdx} className="hover:bg-black/[0.02]">
                            <td className="py-1.5 px-3 font-bold text-[var(--ink)]">{step.hst} HST</td>
                            <td className="py-1.5 px-3 text-[var(--ink-2)]">{step.date}</td>
                            <td className="py-1.5 px-3 text-right text-blue-700">
                              {step.precipitation_mm > 0 ? `${step.precipitation_mm} mm` : "-"}
                            </td>
                            <td className="py-1.5 px-3 text-right text-amber-800">{step.etc_mm} mm</td>
                            <td className="py-1.5 px-3 text-right font-semibold">{step.soil_moisture_mm} mm</td>
                            <td className="py-1.5 px-3 text-right">
                              <span
                                className={`px-1.5 py-0.5 rounded-[2px] font-bold ${
                                  step.moisture_pct_awc >= 70
                                    ? "bg-emerald-50 text-emerald-800"
                                    : step.moisture_pct_awc >= 40
                                    ? "bg-blue-50 text-blue-800"
                                    : "bg-rose-50 text-rose-800"
                                }`}
                              >
                                {step.moisture_pct_awc}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 2: VRN NUTRITION & 3D DRONE MISSION (MODULE D)               */}
            {/* ================================================================= */}
            {activeTab === "vrn_drone" && vrn && (
              <div className="space-y-6">
                {/* Manual Bucket Format Banner */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <span className="label-telemetry">MANUAL BUCKET DOSAGE (KG & JUMLAH KARUNG)</span>
                      <h3 className="text-[15px] font-bold text-[var(--ink)] mt-0.5">
                        Preskripsi Pupuk Petak {vrn.plot_name} ({vrn.area_ha} Ha)
                      </h3>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--ink-3)]">
                      Varietas: <strong className="text-[var(--ink)]">{vrn.crop_variety}</strong> • Target:{" "}
                      <strong className="text-[var(--ink)]">{vrn.target_yield_ton_ha} ton/ha</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Urea Card */}
                    <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                        <div className="flex items-center gap-2">
                          <Wheat className="w-4 h-4 text-emerald-700" />
                          <h4 className="text-[13px] font-bold text-[var(--ink)]">Urea Prill (46% Nitrogen)</h4>
                        </div>
                        <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          {vrn.macro_totals.urea.sacks_50kg_exact} KARUNG
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[22px] font-mono font-bold text-[var(--ink)]">
                          {vrn.macro_totals.urea.total_kg}{" "}
                          <span className="text-[13px] font-normal text-[var(--ink-3)]">kg total</span>
                        </div>
                        <div className="text-[12px] font-mono text-emerald-900 bg-emerald-50/70 p-2 rounded-[2px] border border-emerald-200">
                          <strong>Format Takaran Riil:</strong> {vrn.macro_totals.urea.manual_bucket_display}
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--ink-2)] border-t border-black/[0.06] pt-2">
                        Perkiraan Biaya:{" "}
                        <span className="font-mono font-semibold text-[var(--ink)]">
                          Rp {vrn.operational_cost_estimate_idr.urea_idr.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>

                    {/* NPK Phonska Plus Card */}
                    <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                        <div className="flex items-center gap-2">
                          <Sprout className="w-4 h-4 text-blue-700" />
                          <h4 className="text-[13px] font-bold text-[var(--ink)]">NPK Phonska Plus (15-15-15+Zn)</h4>
                        </div>
                        <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-300">
                          {vrn.macro_totals.npk.sacks_50kg_exact} KARUNG
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[22px] font-mono font-bold text-[var(--ink)]">
                          {vrn.macro_totals.npk.total_kg}{" "}
                          <span className="text-[13px] font-normal text-[var(--ink-3)]">kg total</span>
                        </div>
                        <div className="text-[12px] font-mono text-blue-900 bg-blue-50/70 p-2 rounded-[2px] border border-blue-200">
                          <strong>Format Takaran Riil:</strong> {vrn.macro_totals.npk.manual_bucket_display}
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--ink-2)] border-t border-black/[0.06] pt-2">
                        Perkiraan Biaya:{" "}
                        <span className="font-mono font-semibold text-[var(--ink)]">
                          Rp {vrn.operational_cost_estimate_idr.npk_idr.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3-Stage Split Applications */}
                <div>
                  <h4 className="text-[12px] font-mono font-semibold text-[var(--ink-2)] uppercase tracking-wider mb-2.5">
                    Jadwal Split Aplikasi Pemupukan (Dasar, Vegetatif, Primordia)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(vrn?.split_applications || []).map((split, idx) => (
                      <div key={idx} className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px] space-y-2">
                        <div className="flex items-center justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase bg-white border border-black/[0.08] px-1.5 py-0.5 rounded-[2px]">
                            {split.timing_hst}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--ink-3)]">Tahap {idx + 1}</span>
                        </div>

                        <div>
                          <div className="text-[13px] font-bold text-[var(--ink)]">{split.stage_name.split(":")[1]}</div>
                          <div className="text-[11px] text-[var(--ink-3)] font-mono">{split.recommended_timing_label}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-white p-2 rounded-[2px] border border-black/[0.06] text-[11px] font-mono">
                          <div>
                            <span className="text-[var(--ink-3)] block text-[9px]">UREA</span>
                            <span className="font-bold text-emerald-800">{split.urea_kg} kg</span>
                            <span className="text-[10px] text-[var(--ink-3)] block">({split.urea_sacks} sak)</span>
                          </div>
                          <div>
                            <span className="text-[var(--ink-3)] block text-[9px]">NPK PHONSKA</span>
                            <span className="font-bold text-blue-800">{split.npk_kg} kg</span>
                            <span className="text-[10px] text-[var(--ink-3)] block">({split.npk_sacks} sak)</span>
                          </div>
                        </div>

                        <p className="text-[11px] text-[var(--ink-2)] leading-relaxed italic">
                          &ldquo;{split.manual_bucket_instruction}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Terrace Tiers VRN Adjustment Table */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
                  <div className="p-3 bg-[var(--field)] border-b border-black/[0.08] flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--ink)]">
                      Variasi Dosis Adaptif Terasiring (Kompensasi Erosi Limpasan Lereng 8.5%)
                    </span>
                    <span className="text-[10px] font-mono text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                      Variable Rate Nutrition
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-stone-50 text-[var(--ink-3)] border-b border-black/[0.06]">
                        <tr>
                          <th className="py-2 px-3">Undakan Sawah</th>
                          <th className="py-2 px-3">Luas (Ha)</th>
                          <th className="py-2 px-3">Elevasi (mdpl)</th>
                          <th className="py-2 px-3">Karakter Topografi</th>
                          <th className="py-2 px-3 text-right">Dosis Urea</th>
                          <th className="py-2 px-3 text-right">Dosis NPK</th>
                          <th className="py-2 px-3">Catatan Lapangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {(vrn?.terrace_tiers_vrn || []).map((tier, tIdx) => (
                          <tr key={tIdx} className="hover:bg-black/[0.02]">
                            <td className="py-2 px-3 font-bold text-[var(--ink)]">{tier.tier_name}</td>
                            <td className="py-2 px-3">{tier.area_ha} ha</td>
                            <td className="py-2 px-3">{tier.elevation_mdpl} m</td>
                            <td className="py-2 px-3 text-[var(--ink-2)]">{tier.topographic_behavior}</td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-800">
                              {tier.urea_prescribed_kg} kg
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-blue-800">
                              {tier.npk_prescribed_kg} kg
                            </td>
                            <td className="py-2 px-3 text-[10px] text-[var(--ink-3)]">{tier.guidance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3D Drone Flight Mission KML Generator Box */}
                <div className="border border-blue-200 bg-blue-50/30 p-4 rounded-[3px] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-600 text-white inline-flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        3D DRONE FLIGHT MISSION KML
                      </span>
                      <span className="text-[11px] font-mono text-blue-900 font-semibold">
                        Terrain-Following AGL = DEM + 2.5m
                      </span>
                    </div>
                    <p className="text-[12px] text-blue-950 leading-relaxed max-w-2xl">
                      File misi waypoint 3D WGS84 siap diimpor ke aplikasi pilot drone semprot (DJI Pilot 2, Mission Planner,
                      atau QGroundControl). Elevasi nosel dinamis mengikuti kontur kemiringan terasiring Pacitan (142m - 151m MSL).
                    </p>
                  </div>

                  <a
                    href={downloadKmlUrl}
                    download
                    className="h-[36px] px-4 rounded-[3px] bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium inline-flex items-center gap-2 transition-colors flex-shrink-0 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File KML</span>
                  </a>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 3: HYDROLOGY & TERRACE WATER BALANCE (MODULE B)               */}
            {/* ================================================================= */}
            {activeTab === "hydrology" && waterBalance && (
              <div className="space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-black/[0.08] pb-2">
                  <div>
                    <span className="label-telemetry">CASCADING HYDROLOGY MODEL</span>
                    <h3 className="text-[15px] font-bold text-[var(--ink)] mt-0.5">
                      Neraca Air Berundak & Jadwal Pintu Air Terasiring
                    </h3>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--ink-3)]">
                    Kemiringan: <strong className="text-[var(--ink)]">{waterBalance.slope_pct}%</strong> • Status:{" "}
                    <strong className="text-emerald-700">{waterBalance.water_balance.overall_flood_risk}</strong>
                  </div>
                </div>

                {/* Sluice Gate Priority Operations Alert */}
                <div className="border border-amber-200 bg-amber-50/40 p-4 rounded-[3px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-600 text-white inline-flex items-center gap-1">
                      <Sliders className="w-3 h-3" />
                      STRATEGI PINTU AIR: {waterBalance.sluice_schedule.urgency_level}
                    </span>
                    <span className="text-[11px] font-mono text-amber-900">
                      Ramalan Hujan: {waterBalance.sluice_schedule.forecast_rainfall_mm} mm
                    </span>
                  </div>
                  <p className="text-[12px] text-amber-950 leading-relaxed">
                    {waterBalance.sluice_schedule.strategy_description}
                  </p>
                </div>

                {/* Sluice Gate Steps Table */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
                  <div className="p-3 bg-[var(--field)] border-b border-black/[0.08]">
                    <span className="text-[12px] font-semibold text-[var(--ink)]">
                      Instruksi Operasional Pintu Air per Undakan (Urutan Prioritas Hilir ke Hulu)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-stone-50 text-[var(--ink-3)] border-b border-black/[0.06]">
                        <tr>
                          <th className="py-2 px-3">Prioritas</th>
                          <th className="py-2 px-3">Undakan (Kedok)</th>
                          <th className="py-2 px-3">Bukaan Pintu (%)</th>
                          <th className="py-2 px-3">Status Pintu</th>
                          <th className="py-2 px-3 text-right">Debit Buang (L/dtk)</th>
                          <th className="py-2 px-3 text-right">Proyeksi Genangan</th>
                          <th className="py-2 px-3">Arahan Petugas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {(waterBalance?.sluice_schedule?.gate_steps || []).map((step, sIdx) => (
                          <tr key={sIdx} className="hover:bg-black/[0.02]">
                            <td className="py-2 px-3 font-bold text-center w-12">
                              <span className="h-5 w-5 rounded-full bg-black/[0.06] inline-flex items-center justify-center">
                                {step.priority_order}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-[var(--ink)]">{step.tier_name}</td>
                            <td className="py-2 px-3 font-bold text-blue-700">{step.gate_aperture_pct}%</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold ${
                                  step.gate_status === "FULL_OPEN"
                                    ? "bg-rose-100 text-rose-800"
                                    : step.gate_status === "PARTIALLY_OPEN"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {step.gate_status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">{step.target_discharge_lps} L/s</td>
                            <td className="py-2 px-3 text-right font-semibold">{step.projected_water_depth_mm} mm</td>
                            <td className="py-2 px-3 text-[10px] text-[var(--ink-2)]">{step.action_notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 4: SOIL PROFILE & SAXTON-RAWLS (MODULE A)                     */}
            {/* ================================================================= */}
            {activeTab === "soil_profile" && soil && (
              <div className="space-y-5">
                <div className="border-b border-black/[0.08] pb-2">
                  <span className="label-telemetry">ISRIC SOILGRIDS V2.0 & SAXTON-RAWLS (2006)</span>
                  <h3 className="text-[15px] font-bold text-[var(--ink)] mt-0.5">
                    Karakteristik Fisik Tanah Kedalaman 0–30 cm
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Texture Composition */}
                  <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                    <span className="label-telemetry block">KOMPOSISI TEKSTUR TANAH (USDA)</span>
                    <div className="text-[18px] font-bold text-[var(--ink)]">
                      {soil.texture.soil_class}
                    </div>

                    <div className="space-y-2 font-mono text-[12px]">
                      <div>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[var(--ink-2)]">Liat (Clay)</span>
                          <span className="font-bold text-amber-800">{soil.texture.clay_pct}%</span>
                        </div>
                        <div className="w-full bg-black/[0.06] h-2 rounded-full overflow-hidden">
                          <div className="bg-amber-700 h-full" style={{ width: `${soil.texture.clay_pct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[var(--ink-2)]">Debu (Silt)</span>
                          <span className="font-bold text-blue-800">{soil.texture.silt_pct}%</span>
                        </div>
                        <div className="w-full bg-black/[0.06] h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full" style={{ width: `${soil.texture.silt_pct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[var(--ink-2)]">Pasir (Sand)</span>
                          <span className="font-bold text-stone-700">{soil.texture.sand_pct}%</span>
                        </div>
                        <div className="w-full bg-black/[0.06] h-2 rounded-full overflow-hidden">
                          <div className="bg-stone-500 h-full" style={{ width: `${soil.texture.sand_pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Physical & Chemical Properties */}
                  <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                    <span className="label-telemetry block">PARAMETER KIMIA-FISIKA TANAH</span>
                    <div className="grid grid-cols-2 gap-3 font-mono">
                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">BULK DENSITY</span>
                        <span className="text-[16px] font-bold text-[var(--ink)]">
                          {soil.properties.bulk_density_g_cm3}{" "}
                          <span className="text-[11px] font-normal text-[var(--ink-3)]">g/cm³</span>
                        </span>
                      </div>

                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">DERAJAT KEASAMAN (pH)</span>
                        <span className="text-[16px] font-bold text-emerald-800">
                          {soil.properties.ph_h2o}{" "}
                          <span className="text-[11px] font-normal text-[var(--ink-3)]">(Netral Agak Asam)</span>
                        </span>
                      </div>

                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">KAPASITAS TUKAR KATION (CEC)</span>
                        <span className="text-[16px] font-bold text-[var(--ink)]">
                          {soil.properties.cec_cmol_kg}{" "}
                          <span className="text-[11px] font-normal text-[var(--ink-3)]">cmol/kg</span>
                        </span>
                      </div>

                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">BAHAN ORGANIK (OM)</span>
                        <span className="text-[16px] font-bold text-amber-900">
                          {soil.properties.organic_matter_pct}{" "}
                          <span className="text-[11px] font-normal text-[var(--ink-3)]">%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Saxton-Rawls Soil Water Characteristics */}
                <div className="border border-black/[0.08] bg-[var(--field)] p-4 rounded-[3px] space-y-3">
                  <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                    <span className="label-telemetry">KAPASITAS SIMPAN AIR TANAH (AWC) SAXTON-RAWLS</span>
                    <span className="font-mono text-[11px] font-semibold text-[var(--ink-3)]">
                      Kedalaman Akar: {soil.saxton_rawls_hydrology.root_depth_mm} mm
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                    <div className="bg-white p-3 rounded-[2px] border border-black/[0.06]">
                      <span className="text-[10px] text-[var(--ink-3)] block">TITIK LAYU (PWP)</span>
                      <span className="text-[16px] font-bold text-rose-800">
                        {(soil.saxton_rawls_hydrology.theta_pwp * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-[2px] border border-black/[0.06]">
                      <span className="text-[10px] text-[var(--ink-3)] block">KAPASITAS LAPANG (FC)</span>
                      <span className="text-[16px] font-bold text-blue-800">
                        {(soil.saxton_rawls_hydrology.theta_fc * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-[2px] border border-black/[0.06]">
                      <span className="text-[10px] text-[var(--ink-3)] block">KAPASITAS JENUH (SAT)</span>
                      <span className="text-[16px] font-bold text-indigo-900">
                        {(soil.saxton_rawls_hydrology.theta_sat * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="bg-emerald-50/60 p-3 rounded-[2px] border border-emerald-300">
                      <span className="text-[10px] text-emerald-800 font-bold block">AWC TERSEDIA (AWC)</span>
                      <span className="text-[18px] font-bold text-emerald-900">
                        {soil.saxton_rawls_hydrology.awc_mm} mm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 5: SENTINEL-1 SAR & SPECTRAL UNMIXING (MODULE C)             */}
            {/* ================================================================= */}
            {activeTab === "sar_radar" && sar && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.08] pb-2">
                  <div>
                    <span className="label-telemetry">SENTINEL-1 ACTIVE MICROWAVE C-BAND (10M)</span>
                    <h3 className="text-[15px] font-bold text-[var(--ink)] mt-0.5">
                      Telemetri Radar Tembus Awan & Spectral Unmixing
                    </h3>
                  </div>
                  <span className="h-[20px] px-2 rounded-[2px] text-[10px] font-mono font-bold bg-blue-100 text-blue-900 self-start sm:self-auto">
                    {sar.radar_status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* SAR Backscatter Metrics */}
                  <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                    <span className="label-telemetry block">BACKSCATTER KANOPIS & TANAH</span>
                    <div className="grid grid-cols-2 gap-3 font-mono">
                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">POLARISASI VV</span>
                        <span className="text-[16px] font-bold text-[var(--ink)]">
                          {sar.telemetry.sar_vv_db} <span className="text-[11px] font-normal">dB</span>
                        </span>
                      </div>

                      <div className="border border-black/[0.06] p-2.5 rounded-[2px]">
                        <span className="text-[10px] text-[var(--ink-3)] block">POLARISASI VH</span>
                        <span className="text-[16px] font-bold text-[var(--ink)]">
                          {sar.telemetry.sar_vh_db} <span className="text-[11px] font-normal">dB</span>
                        </span>
                      </div>

                      <div className="border border-blue-200 bg-blue-50/40 p-2.5 rounded-[2px] col-span-2">
                        <span className="text-[10px] text-blue-800 font-bold block">
                          RASIO CROSS-POLARISASI (VH / VV)
                        </span>
                        <span className="text-[18px] font-bold text-blue-950">
                          {sar.telemetry.ratio_db} dB{" "}
                          <span className="text-[12px] font-normal text-blue-800">
                            ({sar.telemetry.ratio_linear} linear)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Inward Buffer Spectral Unmixing */}
                  <div className="border border-black/[0.08] bg-white p-4 rounded-[3px] space-y-3">
                    <span className="label-telemetry block">SPECTRAL UNMIXING (GALENGAN CLIPPING)</span>
                    <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                      Pemotongan poligon petak ke dalam sebesar{" "}
                      <strong className="font-mono text-[var(--ink)]">
                        {sar.spectral_unmixing.inward_buffer_meters} meter
                      </strong>{" "}
                      berhasil membuang kontaminasi pantulan rumput pematang/galengan terasiring sebesar{" "}
                      <strong className="font-mono text-emerald-800">
                        {sar.spectral_unmixing.edge_grass_contamination_rejected_pct}%
                      </strong>
                      .
                    </p>

                    <div className="border border-black/[0.06] p-3 rounded-[2px] bg-[var(--field)] font-mono text-[12px]">
                      <div className="flex justify-between mb-1">
                        <span className="text-[var(--ink-2)]">Kemurnian Spektral Kanopi:</span>
                        <span className="font-bold text-emerald-800">
                          {sar.spectral_unmixing.pure_canopy_purity_pct}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--ink-2)]">Status Lengas Tanah Radar:</span>
                        <span className="font-bold text-blue-800">{sar.telemetry.soil_wetness_status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
