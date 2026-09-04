"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Sprout,
  Wheat,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
  FileText,
  X,
  Check,
  Building2,
  CloudSun,
  Droplets,
  Flame,
  Activity,
  Eye,
  Waves,
  Cloud,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { WeatherWidget, ForecastChart } from "@/components/weather";
import { PlotAlertList } from "@/components/alerts";
import { PhenologyTimeline, PlotIndicesChart } from "@/components/plot";
import PlotSatellitePanel from "@/components/satellite/PlotSatellitePanel";
import { api } from "@/lib/api";
import { CropVariety, PlantingSeason, Plot, PlotDetail } from "@/types";

export default function DetailPetakPage() {
  const params = useParams();
  const router = useRouter();
  const plotId = params?.id as string;

  // Data states
  const [plot, setPlot] = useState<Plot | null>(null);
  const [plotDetail, setPlotDetail] = useState<PlotDetail | null>(null);
  const [seasons, setSeasons] = useState<PlantingSeason[]>([]);
  const [varieties, setVarieties] = useState<CropVariety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Weather & Satellite panel states
  const [showWeatherForecast, setShowWeatherForecast] = useState<boolean>(false);
  const [showSatelliteModal, setShowSatelliteModal] = useState<boolean>(false);

  // Notification / Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<PlantingSeason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states - Create Season
  const [newVarietyId, setNewVarietyId] = useState<number | "">("");
  const [newPlantingDate, setNewPlantingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newYieldEstimate, setNewYieldEstimate] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");

  // Form states - Harvest / Selesaikan
  const [harvestDate, setHarvestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [harvestYield, setHarvestYield] = useState<string>("");
  const [harvestNotes, setHarvestNotes] = useState<string>("");

  // Form states - Mark Failed
  const [failedHarvestDate, setFailedHarvestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [failedNotes, setFailedNotes] = useState<string>("");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const formatIndoDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const fetchData = useCallback(async () => {
    if (!plotId) return;
    try {
      setLoading(true);
      setError(null);

      const [plotRes, detailRes, seasonsRes, varietiesRes] = await Promise.all([
        api.get<Plot>(`/plots/${plotId}`),
        api.get<PlotDetail>(`/plots/${plotId}/detail`).catch((err) => {
          console.warn("Gagal memuat detail komprehensif petak, menggunakan fallback:", err);
          return null;
        }),
        api.get<PlantingSeason[]>(`/plots/${plotId}/seasons`),
        api.get<CropVariety[]>("/varieties"),
      ]);

      setPlot(plotRes.data);
      if (detailRes && detailRes.data) {
        setPlotDetail(detailRes.data);
      }
      setSeasons(seasonsRes.data);
      setVarieties(varietiesRes.data);

      if (plotRes.data.variety_id) {
        setNewVarietyId(plotRes.data.variety_id);
      } else if (varietiesRes.data.length > 0) {
        // default to first variety matching plot's crop_type
        const matched = varietiesRes.data.find(
          (v) => v.crop_type === plotRes.data.crop_type
        );
        if (matched) setNewVarietyId(matched.id);
      }
    } catch (err: any) {
      console.error("Gagal memuat data petak:", err);
      setError(
        err.response?.data?.detail || "Gagal memuat informasi petak dan musim tanam."
      );
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check if there is an active season
  const activeSeason = seasons.find((s) => s.status === "active");

  // Handler: Mulai Musim Tanam Baru
  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarietyId) {
      showToast("error", "Silakan pilih varietas tanaman.");
      return;
    }
    if (!newPlantingDate) {
      showToast("error", "Silakan tentukan tanggal tanam.");
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/plots/${plotId}/seasons`, {
        variety_id: Number(newVarietyId),
        planting_date: newPlantingDate,
        yield_estimate_ton_per_ha: newYieldEstimate ? parseFloat(newYieldEstimate) : null,
        notes: newNotes || null,
      });

      showToast("success", "Musim tanam baru berhasil dimulai!");
      setShowCreateModal(false);
      setNewNotes("");
      setNewYieldEstimate("");
      await fetchData();
    } catch (err: any) {
      console.error("Gagal memulai musim tanam:", err);
      showToast(
        "error",
        err.response?.data?.detail || "Gagal mencatat musim tanam baru."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Selesaikan / Panen
  const handleHarvestSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeason) return;

    try {
      setSubmitting(true);
      await api.put(`/seasons/${selectedSeason.id}`, {
        status: "harvested",
        harvest_date: harvestDate,
        yield_estimate_ton_per_ha: harvestYield ? parseFloat(harvestYield) : null,
        notes: harvestNotes || selectedSeason.notes,
      });

      showToast("success", "Musim tanam berhasil diselesaikan dan dicatat sebagai panen!");
      setShowHarvestModal(false);
      setSelectedSeason(null);
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menyelesaikan musim tanam:", err);
      showToast(
        "error",
        err.response?.data?.detail || "Gagal memperbarui status panen."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Tandai Gagal
  const handleFailSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeason) return;

    try {
      setSubmitting(true);
      await api.put(`/seasons/${selectedSeason.id}`, {
        status: "failed",
        harvest_date: failedHarvestDate || null,
        notes: failedNotes
          ? `${selectedSeason.notes ? selectedSeason.notes + " | " : ""}[Gagal]: ${failedNotes}`
          : selectedSeason.notes,
      });

      showToast("success", "Musim tanam ditandai sebagai gagal.");
      setShowFailModal(false);
      setSelectedSeason(null);
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menandai musim tanam gagal:", err);
      showToast(
        "error",
        err.response?.data?.detail || "Gagal memperbarui musim tanam."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openHarvestModal = (season: PlantingSeason) => {
    setSelectedSeason(season);
    setHarvestDate(new Date().toISOString().split("T")[0]);
    setHarvestYield(
      season.yield_estimate_ton_per_ha !== null && season.yield_estimate_ton_per_ha !== undefined
        ? season.yield_estimate_ton_per_ha.toString()
        : ""
    );
    setHarvestNotes(season.notes || "");
    setShowHarvestModal(true);
  };

  const openFailModal = (season: PlantingSeason) => {
    setSelectedSeason(season);
    setFailedHarvestDate(new Date().toISOString().split("T")[0]);
    setFailedNotes("");
    setShowFailModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Aktif
          </span>
        );
      case "harvested":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Dipanen
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            Gagal
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 transition-all duration-300 transform translate-y-0">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link
            href="/peta"
            className="hover:text-emerald-700 flex items-center gap-1 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Peta Monitoring
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-800 font-semibold">
            {plot ? `Petak ${plot.name}` : "Detail Petak"}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Memuat data petak dan musim tanam...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center max-w-lg mx-auto">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-rose-900 mb-2">Terjadi Kesalahan</h2>
            <p className="text-sm text-rose-700 mb-6">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : plot ? (
          <div className="space-y-8">
            {/* Header Informasi Petak */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -z-10 opacity-70" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                      {plot.crop_type === "padi" ? (
                        <Wheat className="w-6 h-6" />
                      ) : (
                        <Sprout className="w-6 h-6" />
                      )}
                    </span>
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                        {plot.name}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        {plot.company_name && (
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <Building2 className="w-3.5 h-3.5" />
                            {plot.company_name}
                          </span>
                        )}
                        {plot.estate_name && (
                          <>
                            <span>•</span>
                            <span>Kebun {plot.estate_name}</span>
                          </>
                        )}
                        {plot.division_name && (
                          <>
                            <span>•</span>
                            <span>Divisi {plot.division_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm hover:shadow transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Mulai Musim Baru
                  </button>
                </div>
              </div>

              {/* Grid Metrik Petak */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Komoditas
                  </span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 capitalize">
                    {plot.crop_type}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Varietas & Target GDD
                  </span>
                  <div className="font-bold text-slate-800 truncate" title={plotDetail?.variety_name || plot.variety_name || "-"}>
                    {plotDetail?.variety_name || plot.variety_name || "-"}
                  </div>
                  {plotDetail?.gdd_target_total ? (
                    <span className="text-[10px] text-slate-500 block">
                      Target: {plotDetail.gdd_target_total} °C-hari
                    </span>
                  ) : null}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Luas Lahan
                  </span>
                  <div className="font-bold text-slate-800">
                    {plot.area_hectares ? `${plot.area_hectares.toFixed(2)} ha` : "0.00 ha"}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Tanggal Tanam
                  </span>
                  <div className="font-bold text-slate-800">
                    {plot.planting_date || "-"}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Umur Tanaman (HST)
                  </span>
                  <div className="font-bold text-emerald-700">
                    {(plotDetail?.current_hst ?? plot.current_hst) > 0
                      ? `${plotDetail?.current_hst ?? plot.current_hst} HST`
                      : "-"}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium block mb-1">
                    Status Musim Tanam
                  </span>
                  <div>
                    {activeSeason ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Musim Aktif
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500">
                        Tidak Ada Siklus Aktif
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Season Banner if present */}
            {activeSeason && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm mt-0.5">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-wider font-bold text-emerald-800">
                        Musim Tanam Sedang Berlangsung
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Varietas: {activeSeason.variety_name || "Tidak ditentukan"} (
                      {activeSeason.planting_date})
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Estimasi Hasil:{" "}
                      <span className="font-semibold text-slate-800">
                        {activeSeason.yield_estimate_ton_per_ha
                          ? `${activeSeason.yield_estimate_ton_per_ha} ton/ha`
                          : "Belum ditentukan"}
                      </span>
                      {activeSeason.notes && (
                        <span className="ml-2 italic">• &quot;{activeSeason.notes}&quot;</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => openHarvestModal(activeSeason)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Selesaikan / Panen
                  </button>
                  <button
                    onClick={() => openFailModal(activeSeason)}
                    className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 text-sm font-semibold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Tandai Gagal
                  </button>
                </div>
              </div>
            )}

            {/* 1. Komponen Progress Bar Fase Fenologi (Tiket 13) */}
            <PhenologyTimeline
              timeline={plotDetail?.phases_timeline || []}
              currentHst={plotDetail?.current_hst ?? plot.current_hst ?? 0}
              currentPhaseName={plotDetail?.current_phase || plot.current_phase}
              gddCumulative={plotDetail?.gdd_cumulative || 0}
            />

            {/* 2. Grid 2 Kolom: Kartu Prediksi Panen & Kebutuhan Air Tanaman (Tiket 13) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card Prediksi Panen */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          Prediksi Panen & Thermal GDD
                        </h3>
                        <p className="text-xs text-slate-500">
                          Akumulasi Growing Degree Days menuju kematangan fisiologis
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                      {plotDetail?.gdd_progress_pct ?? 0}% Selesai
                    </span>
                  </div>

                  {/* Progress Bar Akumulasi GDD */}
                  <div className="space-y-1.5 mb-5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-600">Akumulasi Thermal Terkini</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {plotDetail?.gdd_cumulative ?? 0} / {plotDetail?.gdd_target_total ?? 0} °C-hari
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(0, plotDetail?.gdd_progress_pct ?? 0))}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrik Rincian Panen */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-500 block mb-1">Sisa Kebutuhan GDD</span>
                      <span className="text-lg font-bold text-slate-800">
                        {plotDetail?.remaining_gdd ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400 block">°C-hari lagi</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-500 block mb-1">Estimasi Sisa Hari</span>
                      <span className="text-lg font-bold text-emerald-700">
                        {plotDetail?.estimated_days_to_harvest !== null && plotDetail?.estimated_days_to_harvest !== undefined
                          ? `${plotDetail.estimated_days_to_harvest} Hari`
                          : "-"}
                      </span>
                      <span className="text-[10px] text-slate-400 block">menuju panen fisiologis</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Estimasi Tanggal Panen:</span>
                  <span className="font-bold text-slate-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800">
                    {plotDetail?.predicted_harvest_date
                      ? formatIndoDate(plotDetail.predicted_harvest_date)
                      : "Belum dapat diprediksi"}
                  </span>
                </div>
              </div>

              {/* Card Kebutuhan Air Tanaman (ETc) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                        <Droplets className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          Kebutuhan Air Tanaman (ETc)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Evapotranspirasi aktual tanaman berdasarkan rumus FAO Penman-Monteith
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      Kc Aktif: {plotDetail?.kc_active ? plotDetail.kc_active.toFixed(2) : "-"}
                    </span>
                  </div>

                  {/* Metrik Air Hari Ini */}
                  <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                    <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-100">
                      <span className="text-blue-700 block mb-1 font-semibold">ETc Hari Ini (Aktual)</span>
                      <span className="text-2xl font-black text-blue-900">
                        {plotDetail?.etc_today !== null && plotDetail?.etc_today !== undefined
                          ? `${plotDetail.etc_today} mm`
                          : "-"}
                      </span>
                      <span className="text-[10px] text-blue-600 block mt-0.5">mm/hari per satuan luas</span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <span className="text-slate-500 block mb-1 font-medium">ET₀ Acuan Hari Ini</span>
                      <span className="text-2xl font-bold text-slate-800">
                        {plotDetail?.et0_today !== null && plotDetail?.et0_today !== undefined
                          ? `${plotDetail.et0_today} mm`
                          : "-"}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">stasiun cuaca kebun</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-800 block mb-0.5">Formula Irigasi:</span>
                    ETc = ET₀ ({plotDetail?.et0_today ?? 0} mm) × Kc ({plotDetail?.kc_active ? plotDetail.kc_active.toFixed(2) : "1.00"}).
                    Dibutuhkan pasokan air sekitar{" "}
                    <span className="font-bold text-blue-700">
                      {plotDetail?.etc_today ? (plotDetail.etc_today * 10).toFixed(0) : "0"} m³/ha/hari
                    </span>{" "}
                    untuk menjaga hidrasi optimum tanpa stres kekeringan.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Status Kebutuhan Air:</span>
                  <span className="font-bold text-blue-800">
                    {(plotDetail?.kc_active ?? 1.0) >= 1.15
                      ? "Fase Kritis (Kebutuhan Air Maksimal)"
                      : (plotDetail?.kc_active ?? 1.0) < 0.8
                      ? "Fase Rendah (Kebutuhan Air Berkurang)"
                      : "Kebutuhan Air Normal Stabil"}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Komponen Grafik Time-Series Multi-Garis Recharts (Tiket 13) */}
            <PlotIndicesChart
              plotId={Number(plotId)}
              plantingDate={plot.planting_date}
              cropType={plot.crop_type}
            />

            {/* 4. Tabel Data Observasi Satelit Terbaru (Tiket 13) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-600" />
                    Data Observasi Satelit Terbaru (Sentinel-2 & Sentinel-1 SAR)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hasil ekstraksi penginderaan jauh spektral dan backscatter radar petak
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSatelliteModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
                  >
                    <Eye className="w-4 h-4 text-emerald-400" />
                    Buka Panel Satelit Lengkap
                  </button>
                </div>
              </div>

              {/* Table Data */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">
                        Tanggal Observasi
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        NDVI (Kehijauan)
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        NDRE (Klorofil)
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        NDWI (Kadar Air)
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        SAVI (Koreksi Tanah)
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        BSI (Keterbukaan)
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        SAR Backscatter
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Status Genangan
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/70 transition-colors font-medium">
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-900">
                        {plotDetail?.observation_date
                          ? formatIndoDate(plotDetail.observation_date)
                          : "Belum ada observasi"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plotDetail?.latest_ndvi !== null && plotDetail?.latest_ndvi !== undefined ? (
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-700 text-sm">
                              {plotDetail.latest_ndvi.toFixed(3)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              {plotDetail.vegetation_health || "Sehat"}
                            </span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plotDetail?.latest_ndre !== null && plotDetail?.latest_ndre !== undefined ? (
                          <span className="font-bold text-blue-700 text-sm">
                            {plotDetail.latest_ndre.toFixed(3)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plotDetail?.latest_ndwi !== null && plotDetail?.latest_ndwi !== undefined ? (
                          <span className="font-bold text-cyan-700 text-sm">
                            {plotDetail.latest_ndwi.toFixed(3)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                        {plotDetail?.latest_savi !== null && plotDetail?.latest_savi !== undefined
                          ? plotDetail.latest_savi.toFixed(3)
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                        {plotDetail?.latest_bsi !== null && plotDetail?.latest_bsi !== undefined
                          ? plotDetail.latest_bsi.toFixed(3)
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-700">
                        {plotDetail?.sar_vv_db !== null && plotDetail?.sar_vv_db !== undefined ? (
                          <span>
                            VV: {plotDetail.sar_vv_db} dB | VH: {plotDetail.sar_vh_db ?? "-"} dB
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plotDetail?.is_flooded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            Terindikasi Banjir
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Normal (Aman)
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section Peringatan & Anomali Petak (Alert Engine) */}
            <PlotAlertList plotId={Number(plotId)} plotName={plot.name} />

            {/* Section Musim Tanam (Planting Seasons History) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    Riwayat Musim Tanam
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Histori siklus tanam, varietas bibit, produktivitas panen, dan status petak.
                  </p>
                </div>

                <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg self-start sm:self-auto font-medium">
                  Total Musim: {seasons.length}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">
                        Tanggal Tanam
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Komoditas & Varietas
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Tanggal Panen
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Estimasi Hasil
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Catatan
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {seasons.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                          <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                          <p className="font-medium text-slate-500">
                            Belum ada riwayat musim tanam untuk petak ini.
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Klik tombol &quot;Mulai Musim Baru&quot; untuk mencatat siklus tanam pertama.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      seasons.map((season) => (
                        <tr
                          key={season.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            season.status === "active" ? "bg-emerald-50/30 font-medium" : ""
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-semibold">
                            {season.planting_date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="capitalize px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-medium">
                                {season.crop_type || plot.crop_type}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {season.variety_name || "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(season.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                            {season.harvest_date || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {season.yield_estimate_ton_per_ha !== null &&
                            season.yield_estimate_ton_per_ha !== undefined ? (
                              <span className="font-semibold text-slate-800">
                                {season.yield_estimate_ton_per_ha} ton/ha
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate" title={season.notes || ""}>
                            {season.notes || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {season.status === "active" ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openHarvestModal(season)}
                                  className="text-xs px-2.5 py-1.5 font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 shadow-sm"
                                  title="Selesaikan musim tanam & catat panen"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Panen
                                </button>
                                <button
                                  onClick={() => openFailModal(season)}
                                  className="text-xs px-2.5 py-1.5 font-medium rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 transition-colors flex items-center gap-1"
                                  title="Tandai musim tanam gagal"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Gagal
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Selesai</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* MODAL: Mulai Musim Tanam Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <Sprout className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mulai Musim Tanam Baru</h3>
                  <p className="text-xs text-slate-500">Mencatat siklus tanam baru pada petak ini</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSeason} className="p-6 space-y-4">
              {activeSeason && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Peringatan: Ada Musim Tanam Aktif!</span>
                    Petak ini sudah memiliki musim tanam aktif ({activeSeason.planting_date}). Anda harus
                    menyelesaikan atau menandai musim tanam sebelumnya terlebih dahulu sebelum memulai musim baru.
                  </div>
                </div>
              )}

              {/* Varietas */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Varietas Benih <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newVarietyId}
                  onChange={(e) => setNewVarietyId(e.target.value ? Number(e.target.value) : "")}
                  required
                  disabled={!!activeSeason}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- Pilih Varietas Benih --</option>
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.crop_type.toUpperCase()}] {v.name} ({v.cycle_days} hari)
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal Tanam */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Tanam <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={newPlantingDate}
                  onChange={(e) => setNewPlantingDate(e.target.value)}
                  required
                  disabled={!!activeSeason}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Estimasi Hasil */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Estimasi Hasil Panen (ton/ha)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Contoh: 6.5"
                  value={newYieldEstimate}
                  onChange={(e) => setNewYieldEstimate(e.target.value)}
                  disabled={!!activeSeason}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Pemupukan dasar urea & TSP telah diberikan."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  disabled={!!activeSeason}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!activeSeason}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {submitting ? "Menyimpan..." : "Simpan Musim Tanam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Selesaikan / Panen */}
      {showHarvestModal && selectedSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Selesaikan & Catat Panen</h3>
                  <p className="text-xs text-slate-500">
                    Petak {plot?.name} • Tanam: {selectedSeason.planting_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHarvestModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleHarvestSeason} className="p-6 space-y-4">
              {/* Tanggal Panen */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Panen <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={harvestDate}
                  onChange={(e) => setHarvestDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Realisasi Hasil Panen */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Realisasi Hasil Panen (ton/ha)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Contoh: 6.8"
                  value={harvestYield}
                  onChange={(e) => setHarvestYield(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Estimasi awal: {selectedSeason.yield_estimate_ton_per_ha ?? "-"} ton/ha
                </span>
              </div>

              {/* Catatan Panen */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Panen
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Kualitas gabah sangat baik, rendemen tinggi."
                  value={harvestNotes}
                  onChange={(e) => setHarvestNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHarvestModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {submitting ? "Menyimpan..." : "Konfirmasi Panen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tandai Gagal */}
      {showFailModal && selectedSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Tandai Musim Tanam Gagal</h3>
                  <p className="text-xs text-slate-500">
                    Petak {plot?.name} • Tanam: {selectedSeason.planting_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFailModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFailSeason} className="p-6 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                Tindakan ini akan menghentikan musim tanam aktif dan mencatatnya sebagai gagal panen.
              </div>

              {/* Tanggal Berakhir */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Berakhir / Dibatalkan
                </label>
                <input
                  type="date"
                  value={failedHarvestDate}
                  onChange={(e) => setFailedHarvestDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              {/* Alasan / Catatan Kegagalan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Alasan Kegagalan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Jelaskan penyebab kegagalan (misal: serangan hama wereng coklat masif, banjir bandang, atau kekeringan ekstrem)."
                  value={failedNotes}
                  onChange={(e) => setFailedNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFailModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {submitting ? "Memproses..." : "Tandai Gagal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Panel Detail Satelit & SAR */}
      {showSatelliteModal && plot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <PlotSatellitePanel
              plotId={plot.id}
              plotName={plot.name}
              cropType={plot.crop_type}
              onClose={() => setShowSatelliteModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
