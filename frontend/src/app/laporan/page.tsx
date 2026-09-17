"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Calendar,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HeartPulse,
  CalendarClock,
  Droplets,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
  Sparkles,
  ArrowDownToLine,
  History,
  MapPin,
  Map,
} from "lucide-react";

import AuthGuard from "@/components/layout/AuthGuard";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import {
  Estate,
  GeneratedReportArchive,
  SeasonComparisonResponse,
} from "@/types";

interface SimplePlotItem {
  id: number;
  name: string;
  crop_type: string;
  area_hectares: number;
}

export default function LaporanPage() {
  // State Filter Estate & Rentang Tanggal
  const [estates, setEstates] = useState<Estate[]>([]);
  const [selectedEstateId, setSelectedEstateId] = useState<number | "">("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Loading States untuk unduhan dokumen & ekspor
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);
  const [loadingHarvest, setLoadingHarvest] = useState<boolean>(false);
  const [loadingWater, setLoadingWater] = useState<boolean>(false);
  const [loadingCsv, setLoadingCsv] = useState<boolean>(false);
  const [loadingGeoJson, setLoadingGeoJson] = useState<boolean>(false);

  // Status Notifikasi
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Riwayat Arsip Laporan
  const [historyReports, setHistoryReports] = useState<GeneratedReportArchive[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [downloadingHistoryId, setDownloadingHistoryId] = useState<number | null>(null);

  // Komparasi Antar Musim
  const [estatePlots, setEstatePlots] = useState<SimplePlotItem[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<number | "">("");
  const [seasonComparison, setSeasonComparison] = useState<SeasonComparisonResponse | null>(null);
  const [loadingComparison, setLoadingComparison] = useState<boolean>(false);

  // 1. Inisialisasi Tanggal Default (30 Hari Terakhir)
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    setEndDate(today.toISOString().split("T")[0]);
    setStartDate(thirtyDaysAgo.toISOString().split("T")[0]);
  }, []);

  // 2. Fetch Daftar Estate
  useEffect(() => {
    api
      .get<Estate[]>("/estates")
      .then((res) => {
        const estList = Array.isArray(res.data) ? res.data : [];
        setEstates(estList);
        if (estList.length > 0) {
          setSelectedEstateId(estList[0].id);
        }
      })
      .catch((err) => {
        console.error("Gagal memuat daftar estate:", err);
        setStatusMessage({
          type: "error",
          text: "Gagal memuat daftar unit perkebunan (estate).",
        });
      });
  }, []);

  // 3. Fetch Riwayat Arsip & Petak ketika Estate Terpilih Berubah
  useEffect(() => {
    if (!selectedEstateId) return;

    fetchHistory(Number(selectedEstateId));
    fetchPlots(Number(selectedEstateId));
  }, [selectedEstateId]);

  // 4. Fetch Komparasi Musim saat Petak Dipilih
  useEffect(() => {
    if (!selectedPlotId) {
      setSeasonComparison(null);
      return;
    }

    setLoadingComparison(true);
    api
      .get<SeasonComparisonResponse>(`/plots/${selectedPlotId}/season-comparison`)
      .then((res) => {
        setSeasonComparison(res.data);
      })
      .catch((err) => {
        console.error("Gagal memuat komparasi musim:", err);
        setSeasonComparison(null);
      })
      .finally(() => {
        setLoadingComparison(false);
      });
  }, [selectedPlotId]);

  const fetchHistory = (estateId: number) => {
    setLoadingHistory(true);
    api
      .get<GeneratedReportArchive[]>(`/reports/history?estate_id=${estateId}&limit=10`)
      .then((res) => {
        setHistoryReports(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error("Gagal memuat riwayat laporan:", err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  };

  const fetchPlots = (estateId: number) => {
    api
      .get<any[]>(`/plots?estate_id=${estateId}`)
      .then((res) => {
        const plotsData = Array.isArray(res.data) ? res.data : [];
        setEstatePlots(
          plotsData.map((p: any) => ({
            id: p.id,
            name: p.name,
            crop_type: p.crop_type,
            area_hectares: p.area_hectares,
          }))
        );
        if (plotsData.length > 0) {
          setSelectedPlotId(plotsData[0].id);
        } else {
          setSelectedPlotId("");
        }
      })
      .catch((err) => {
        console.error("Gagal memuat daftar petak:", err);
        setEstatePlots([]);
        setSelectedPlotId("");
      });
  };

  const applyDatePreset = (days: number) => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);

    setEndDate(today.toISOString().split("T")[0]);
    setStartDate(past.toISOString().split("T")[0]);
  };

  const triggerBlobDownload = (data: Blob, fallbackFileName: string, contentDisposition?: string) => {
    let fileName = fallbackFileName;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename=["']?([^"';]+)["']?/);
      if (match && match[1]) {
        fileName = decodeURIComponent(match[1]);
      }
    }

    const blobUrl = window.URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  // Handler 1: Unduh PDF Laporan Kesehatan
  const handleDownloadHealthReport = async () => {
    if (!selectedEstateId) {
      setStatusMessage({ type: "error", text: "Silakan pilih estate terlebih dahulu." });
      return;
    }

    setLoadingHealth(true);
    setStatusMessage(null);

    try {
      const response = await api.post(
        `/reports/health?estate_id=${selectedEstateId}&start_date=${startDate}&end_date=${endDate}`,
        null,
        { responseType: "blob" }
      );

      triggerBlobDownload(
        response.data,
        `Laporan_Kesehatan_Estate_${selectedEstateId}_${endDate}.pdf`,
        response.headers["content-disposition"]
      );

      setStatusMessage({
        type: "success",
        text: "Laporan Kesehatan Lahan (PDF) berhasil diunduh.",
      });
    } catch (err: any) {
      console.error("Error unduh laporan kesehatan:", err);
      setStatusMessage({
        type: "error",
        text: "Gagal menghasilkan Laporan Kesehatan Lahan. Pastikan server aktif.",
      });
    } finally {
      setLoadingHealth(false);
    }
  };

  // Handler 2: Unduh PDF Laporan Prediksi Panen
  const handleDownloadHarvestReport = async () => {
    if (!selectedEstateId) {
      setStatusMessage({ type: "error", text: "Silakan pilih estate terlebih dahulu." });
      return;
    }

    setLoadingHarvest(true);
    setStatusMessage(null);

    try {
      const response = await api.post(
        `/reports/harvest-prediction?estate_id=${selectedEstateId}`,
        null,
        { responseType: "blob" }
      );

      triggerBlobDownload(
        response.data,
        `Laporan_Prediksi_Panen_Estate_${selectedEstateId}.pdf`,
        response.headers["content-disposition"]
      );

      setStatusMessage({
        type: "success",
        text: "Laporan Prediksi Panen (PDF) berhasil diunduh.",
      });
    } catch (err: any) {
      console.error("Error unduh laporan prediksi panen:", err);
      setStatusMessage({
        type: "error",
        text: "Gagal menghasilkan Laporan Prediksi Panen.",
      });
    } finally {
      setLoadingHarvest(false);
    }
  };

  // Handler 3: Unduh PDF Laporan Kebutuhan Air
  const handleDownloadWaterReport = async () => {
    if (!selectedEstateId) {
      setStatusMessage({ type: "error", text: "Silakan pilih estate terlebih dahulu." });
      return;
    }

    setLoadingWater(true);
    setStatusMessage(null);

    try {
      const response = await api.post(
        `/reports/water-usage?estate_id=${selectedEstateId}&start_date=${startDate}&end_date=${endDate}`,
        null,
        { responseType: "blob" }
      );

      triggerBlobDownload(
        response.data,
        `Laporan_Kebutuhan_Air_Estate_${selectedEstateId}_${endDate}.pdf`,
        response.headers["content-disposition"]
      );

      setStatusMessage({
        type: "success",
        text: "Laporan Kebutuhan Air & Irigasi (PDF) berhasil diunduh.",
      });
    } catch (err: any) {
      console.error("Error unduh laporan kebutuhan air:", err);
      setStatusMessage({
        type: "error",
        text: "Gagal menghasilkan Laporan Kebutuhan Air.",
      });
    } finally {
      setLoadingWater(false);
    }
  };

  // Handler 4: Unduh CSV Time-Series
  const handleDownloadCsv = async () => {
    if (!selectedEstateId) {
      setStatusMessage({ type: "error", text: "Silakan pilih estate terlebih dahulu." });
      return;
    }

    setLoadingCsv(true);
    setStatusMessage(null);

    try {
      const response = await api.get(
        `/reports/export-csv?estate_id=${selectedEstateId}&start_date=${startDate}&end_date=${endDate}`,
        { responseType: "blob" }
      );

      triggerBlobDownload(
        response.data,
        `Timeseries_Agroklimat_Estate_${selectedEstateId}_${endDate}.csv`,
        response.headers["content-disposition"]
      );

      setStatusMessage({
        type: "success",
        text: "Dataset Agroklimat & Citra Satelit (CSV) berhasil diekspor.",
      });
    } catch (err: any) {
      console.error("Error unduh CSV:", err);
      setStatusMessage({
        type: "error",
        text: "Gagal mengekspor data time-series CSV.",
      });
    } finally {
      setLoadingCsv(false);
    }
  };

  // Handler 5: Unduh GeoJSON Spasial Petak
  const handleDownloadGeoJson = async () => {
    if (!selectedEstateId) {
      setStatusMessage({ type: "error", text: "Silakan pilih estate terlebih dahulu." });
      return;
    }

    setLoadingGeoJson(true);
    setStatusMessage(null);

    try {
      const res = await api.get<any[]>(`/plots?estate_id=${selectedEstateId}`);
      const plotsData = Array.isArray(res.data) ? res.data : [];
      const featureCollection = {
        type: "FeatureCollection",
        features: plotsData.map((p) => ({
          type: "Feature",
          id: p.id,
          properties: {
            id: p.id,
            name: p.name,
            crop_type: p.crop_type,
            area_hectares: p.area_hectares,
            variety_name: p.variety_name,
            planting_date: p.planting_date,
            current_hst: p.current_hst,
            status: p.current_phase || "active",
          },
          geometry: p.geometry,
        })),
      };

      const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
        type: "application/geo+json",
      });

      triggerBlobDownload(blob, `Boundary_Petak_Estate_${selectedEstateId}_${endDate}.geojson`);

      setStatusMessage({
        type: "success",
        text: "Boundary Spasial Petak (GeoJSON) berhasil diekspor.",
      });
    } catch (err) {
      console.error("Gagal mengekspor GeoJSON:", err);
      setStatusMessage({
        type: "error",
        text: "Gagal mengekspor boundary spasial GeoJSON.",
      });
    } finally {
      setLoadingGeoJson(false);
    }
  };

  // Handler 6: Unduh Arsip dari Riwayat
  const handleDownloadArchivedReport = async (report: GeneratedReportArchive) => {
    setDownloadingHistoryId(report.id);
    try {
      const response = await api.get(`/reports/download/${report.id}`, {
        responseType: "blob",
      });

      triggerBlobDownload(response.data, report.file_name);
      setStatusMessage({
        type: "success",
        text: `Berkas arsip ${report.file_name} berhasil diunduh.`,
      });
    } catch (err) {
      console.error("Gagal mengunduh arsip:", err);
      setStatusMessage({
        type: "error",
        text: "Berkas arsip tidak dapat diunduh atau sudah dipindahkan.",
      });
    } finally {
      setDownloadingHistoryId(null);
    }
  };

  const selectedEstateObj = estates.find((e) => e.id === Number(selectedEstateId));

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[var(--canvas)] font-sans pt-[68px] flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="divide-y divide-black/[0.08]">
            {/* Header Title & Status Strip */}
            <section className="py-[21px] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="label-telemetry">MODUL PELAPORAN & EKSPOR DATA</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
                  Pusat Laporan & Ekspor Data Operasional
                </h1>
                <p className="text-[13px] text-[var(--ink-2)] mt-0.5 max-w-2xl">
                  Generate dokumen PDF agronomi resmi dan ekspor dataset agroklimat serta citra satelit dalam format CSV & GeoJSON.
                </p>
              </div>

              <div className="flex items-center gap-2.5 border border-black/[0.08] bg-white rounded-[3px] px-3.5 py-2 self-start md:self-auto font-mono">
                <Clock className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                <div className="text-[11px]">
                  <span className="font-semibold text-[var(--ink)] block">PENJADWALAN MINGGUAN</span>
                  <span className="text-[var(--ink-3)]">Generate tiap Senin 07:00 WIB</span>
                </div>
              </div>
            </section>

            {/* Notification / Toast Banner */}
            {statusMessage && (
              <div
                className={`my-[13px] p-3 rounded-[3px] border text-[12px] font-mono flex items-center justify-between transition-all ${
                  statusMessage.type === "success"
                    ? "bg-white border-emerald-400 text-emerald-900"
                    : statusMessage.type === "error"
                    ? "bg-white border-rose-400 text-rose-900"
                    : "bg-white border-blue-400 text-blue-900"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {statusMessage.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
                <button
                  onClick={() => setStatusMessage(null)}
                  className="text-[11px] underline opacity-70 hover:opacity-100 ml-4"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Filter Bar: Flat Divider, No Card Shadow */}
            <section className="py-[21px] space-y-4">
              <div className="flex items-center justify-between">
                <span className="label-telemetry">PENGATURAN FILTER UNIT LAHAN & PERIODE</span>
                {selectedEstateObj && (
                  <span className="text-[11px] font-mono text-[var(--ink-3)] tabular-nums">
                    Mencakup {selectedEstateObj.division_count || 0} divisi • {selectedEstateObj.petak_count || 0} petak
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Dropdown Estate */}
                <div>
                  <label className="label-telemetry block mb-1">
                    UNIT ESTATE (KEBUN)
                  </label>
                  <select
                    value={selectedEstateId}
                    onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                    className="w-full h-[34px] px-3 text-[13px] bg-white border border-black/[0.12] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)] font-medium"
                  >
                    {estates.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.name} ({est.kabupaten || est.province || "Indonesia"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tanggal Awal */}
                <div>
                  <label className="label-telemetry block mb-1">
                    TANGGAL MULAI ANALISIS
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-[34px] px-3 text-[13px] font-mono bg-white border border-black/[0.12] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)]"
                  />
                </div>

                {/* Tanggal Akhir & Quick Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label-telemetry">TANGGAL AKHIR ANALISIS</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyDatePreset(7)}
                        className="h-[20px] px-1.5 text-[10px] font-mono font-medium rounded-[2px] border border-black/[0.08] hover:bg-black/[0.04] text-[var(--ink-2)] transition-colors"
                      >
                        7H
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDatePreset(30)}
                        className="h-[20px] px-1.5 text-[10px] font-mono font-medium rounded-[2px] border border-black/[0.08] hover:bg-black/[0.04] text-[var(--ink-2)] transition-colors"
                      >
                        30H
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDatePreset(90)}
                        className="h-[20px] px-1.5 text-[10px] font-mono font-medium rounded-[2px] border border-black/[0.08] hover:bg-black/[0.04] text-[var(--ink-2)] transition-colors"
                      >
                        90H
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-[34px] px-3 text-[13px] font-mono bg-white border border-black/[0.12] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)]"
                  />
                </div>
              </div>
            </section>

            {/* Dokumen Laporan & Ekspor Data (Hairline Grid) */}
            <section className="py-[21px] space-y-4">
              <div>
                <span className="label-telemetry block">DOKUMEN RESMI & EKSPOR DATA OPERASIONAL</span>
                <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                  Pilihan Dokumen Laporan On-Demand
                </h2>
                <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
                  Generate berkas agronomi terstandarisasi untuk monitoring manajemen atau unduh dataset mentah untuk pemodelan
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[21px]">
                {/* Dokumen 1: Laporan Kesehatan Lahan (PDF) */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center">
                        PDF DOKUMEN
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ink-3)]">AGRONOMI</span>
                    </div>

                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                        1. Laporan Kesehatan Lahan & Deteksi Anomali
                      </h3>
                      <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                        Evaluasi status tajuk vegetasi per petak lahan berdasarkan citra satelit Sentinel-2, sebaran indeks NDVI, dan rekomendasi mitigasi stres.
                      </p>
                    </div>

                    <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px] space-y-1 text-[11px] text-[var(--ink-2)] font-mono">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>Statistik agregat NDVI & total luas areal estate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>Daftar petak: fase fenologi, HST, dan status klorofil</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>Daftar alert anomali aktif (Defisiensi N, Stres Air)</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleDownloadHealthReport}
                      disabled={loadingHealth || !selectedEstateId}
                      className="w-full h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {loadingHealth ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menyusun Dokumen PDF...</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" />
                          <span>Unduh Laporan Kesehatan (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Dokumen 2: Laporan Prediksi Panen (PDF) */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center">
                        PDF DOKUMEN
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ink-3)]">PRODUKTIVITAS</span>
                    </div>

                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                        2. Laporan Prediksi Panen & Progres GDD
                      </h3>
                      <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                        Proyeksi tanggal panen fisiologis dan estimasi tonase produksi tanaman padi/jagung berbasis akumulasi thermal Growing Degree Days.
                      </p>
                    </div>

                    <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px] space-y-1 text-[11px] text-[var(--ink-2)] font-mono">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amber-600" />
                        <span>Akumulasi GDD harian & kumulatif vs target varietas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amber-600" />
                        <span>Proyeksi tanggal panen akurat per petak kebun</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amber-600" />
                        <span>Estimasi tonase hasil panen (Ton/Ha & Total Produksi)</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleDownloadHarvestReport}
                      disabled={loadingHarvest || !selectedEstateId}
                      className="w-full h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {loadingHarvest ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menghitung Progres Termal...</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" />
                          <span>Unduh Prediksi Panen (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Dokumen 3: Laporan Kebutuhan Air (PDF) */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center">
                        PDF DOKUMEN
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ink-3)]">IRIGASI FAO-56</span>
                    </div>

                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                        3. Laporan Kebutuhan Air & Manajemen Irigasi
                      </h3>
                      <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                        Analisis neraca air tanaman dan rekomendasi debit irigasi presisi berbasis nilai evapotranspirasi aktual (ET0 & ETc Penman-Monteith).
                      </p>
                    </div>

                    <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px] space-y-1 text-[11px] text-[var(--ink-2)] font-mono">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                        <span>Rata-rata ET0 kebun & curah hujan aktual harian</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                        <span>ETc harian tanaman (ET0 × Kc koefisien fase aktif)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                        <span>Total estimasi volume kebutuhan air (m³) per petak</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleDownloadWaterReport}
                      disabled={loadingWater || !selectedEstateId}
                      className="w-full h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {loadingWater ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menghitung Neraca Air...</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" />
                          <span>Unduh Laporan Air & Irigasi (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Dokumen 4: Ekspor Dataset CSV & GeoJSON */}
                <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300 inline-flex items-center">
                          CSV DATASET
                        </span>
                        <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center">
                          GEOJSON
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--ink-3)]">TIME-SERIES & GIS</span>
                    </div>

                    <div>
                      <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                        4. Ekspor Dataset Agroklimat, Satelit & Spasial
                      </h3>
                      <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                        Ekspor data deret waktu gabungan satelit dan agroklimat dalam format CSV serta boundary poligon spasial format GeoJSON.
                      </p>
                    </div>

                    <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px] space-y-1 text-[11px] text-[var(--ink-2)] font-mono">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>Indeks Satelit: NDVI, NDRE, NDWI, SAVI, SAR dB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>Agroklimat: Suhu Tmax/Tmin, Curah Hujan, GDD, ET0/ETc</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                        <span>GeoJSON: Koordinat boundary WGS84 seluruh petak estate</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleDownloadCsv}
                      disabled={loadingCsv || !selectedEstateId}
                      className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      {loadingCsv ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Mengekstrak...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Ekspor CSV</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadGeoJson}
                      disabled={loadingGeoJson || !selectedEstateId}
                      className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      {loadingGeoJson ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Mengekstrak...</span>
                        </>
                      ) : (
                        <>
                          <Map className="w-4 h-4" />
                          <span>Ekspor GeoJSON</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Analisis Komparasi Antar Musim Tanam Petak */}
            <section className="py-[21px] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="label-telemetry block">ANALISIS KOMPARATIF HISTORIS</span>
                  <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                    Komparasi Antar Musim Tanam Petak
                  </h2>
                  <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
                    Bandingkan produktivitas, dinamika kehijauan NDVI, dan akumulasi iklim antar musim pada petak yang sama
                  </p>
                </div>

                {/* Dropdown Petak Lahan */}
                <div className="min-w-[220px]">
                  <label className="label-telemetry block mb-1">PILIH PETAK LAHAN</label>
                  <select
                    value={selectedPlotId}
                    onChange={(e) => setSelectedPlotId(Number(e.target.value) || "")}
                    className="w-full h-[34px] px-3 text-[13px] bg-white border border-black/[0.12] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)] font-medium font-mono"
                  >
                    {estatePlots.map((plot) => (
                      <option key={plot.id} value={plot.id}>
                        {plot.name} ({plot.crop_type} - {plot.area_hectares} ha)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingComparison ? (
                <div className="py-12 text-center text-[var(--ink-3)] font-mono text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto mb-2" />
                  <p>Menganalisis perbandingan dinamika musim...</p>
                </div>
              ) : seasonComparison ? (
                <div className="space-y-4">
                  {/* AI Comparative Insights */}
                  {seasonComparison.comparison_insights && seasonComparison.comparison_insights.length > 0 && (
                    <div className="border border-black/[0.08] bg-[var(--field)] rounded-[3px] p-[13px] space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--accent-ink)] uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Insight Agronomis Komparatif</span>
                      </div>
                      <ul className="space-y-1 text-[12px] text-[var(--ink)]">
                        {seasonComparison.comparison_insights.map((insight, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[var(--accent)] font-bold font-mono">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Perbandingan Musim: Berjalan vs Historis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[21px]">
                    {/* Musim Berjalan / Lahan Terbuka */}
                    <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] space-y-3">
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                        <span
                          className={`h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider border ${
                            seasonComparison.current_season?.status === "bera"
                              ? "bg-amber-50 text-amber-900 border-amber-300"
                              : "bg-emerald-50 text-emerald-800 border-emerald-300"
                          }`}
                        >
                          {seasonComparison.current_season?.status === "bera"
                            ? "Status: Bera (Persiapan Lahan)"
                            : "Musim Berjalan (Aktif)"}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--ink-3)]">
                          {seasonComparison.current_season?.status === "bera"
                            ? "0 HST"
                            : seasonComparison.current_season?.planting_date || "-"}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-[14px] font-semibold text-[var(--ink)]">
                          {seasonComparison.current_season?.status === "bera"
                            ? "Fase: Lahan Terbuka (Bera)"
                            : `Varietas: ${seasonComparison.current_season?.variety_name || "Standar"}`}
                        </h4>
                        <p className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5">
                          {seasonComparison.current_season?.status === "bera"
                            ? "Kondisi: 0 HST • GDD: 0.0 °C-hari • Persiapan Olah Tanah"
                            : `Durasi Tanam: ${seasonComparison.current_season?.duration_days || 0} HST`}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                          <span className="label-telemetry block text-[9px] mb-0.5">PUNCAK NDVI</span>
                          <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-emerald-700">
                            {seasonComparison.current_season?.peak_ndvi?.toFixed(2) || "-"}
                          </span>
                        </div>
                        <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                          <span className="label-telemetry block text-[9px] mb-0.5">AKUMULASI HUJAN</span>
                          <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-[var(--ink)]">
                            {seasonComparison.current_season?.total_rainfall_mm?.toFixed(0) || "-"} <span className="text-[10px] text-[var(--ink-3)] font-normal">mm</span>
                          </span>
                        </div>
                        <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                          <span className="label-telemetry block text-[9px] mb-0.5">ESTIMASI HASIL</span>
                          <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-[var(--ink)]">
                            {seasonComparison.current_season?.status === "bera"
                              ? "0 T/Ha"
                              : `${(
                                  seasonComparison.current_season?.yield_ton_per_ha ??
                                  (seasonComparison.current_season as any)?.yield_estimate_ton_per_ha
                                )?.toFixed(1) || "-"} T/Ha`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Musim Sebelumnya (Historis Terakhir) */}
                    <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] space-y-3">
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                        <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
                          Siklus Sebelumnya (Panen)
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--ink-3)]">
                          Panen: {seasonComparison.historical_seasons[0]?.harvest_date || "15 Mei 2026"}
                        </span>
                      </div>

                      {seasonComparison.historical_seasons.length > 0 ? (
                        <>
                          <div>
                            <h4 className="text-[14px] font-semibold text-[var(--ink)]">
                              Varietas: {seasonComparison.historical_seasons[0].variety_name || "Inpari 32 HDB"}
                            </h4>
                            <p className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5">
                              Durasi: {seasonComparison.historical_seasons[0].duration_days} Hari (Tanam: {seasonComparison.historical_seasons[0].planting_date})
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2">
                            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                              <span className="label-telemetry block text-[9px] mb-0.5">PUNCAK NDVI</span>
                              <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-[var(--ink)]">
                                {seasonComparison.historical_seasons[0].peak_ndvi?.toFixed(2) || "-"}
                              </span>
                            </div>
                            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                              <span className="label-telemetry block text-[9px] mb-0.5">AKUMULASI HUJAN</span>
                              <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-[var(--ink)]">
                                {seasonComparison.historical_seasons[0].total_rainfall_mm?.toFixed(0) || "-"} <span className="text-[10px] text-[var(--ink-3)] font-normal">mm</span>
                              </span>
                            </div>
                            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
                              <span className="label-telemetry block text-[9px] mb-0.5">HASIL RIIL</span>
                              <span className="value-telemetry-sm text-[16px] font-mono tabular-nums text-emerald-700">
                                {seasonComparison.historical_seasons[0].yield_ton_per_ha?.toFixed(1) || "6.4"} <span className="text-[10px] text-[var(--ink-3)] font-normal">T/Ha</span>
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="py-6 text-center text-xs font-mono text-[var(--ink-3)] italic">
                          Belum ada riwayat musim terdahulu untuk petak ini.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs font-mono text-[var(--ink-3)] italic">
                  Pilih petak lahan untuk melihat analisis komparasi antar musim.
                </div>
              )}
            </section>

            {/* Riwayat Arsip Dokumen Laporan Mingguan (Report Records Table) */}
            <section className="py-[21px] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="label-telemetry block">ARSIP DOKUMEN SISTEM</span>
                  <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                    Riwayat Arsip Dokumen Laporan Otomatis
                  </h2>
                  <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
                    Daftar dokumen laporan mingguan yang diarsip berkala oleh scheduler sistem
                  </p>
                </div>

                <button
                  onClick={() => selectedEstateId && fetchHistory(Number(selectedEstateId))}
                  className="h-[30px] px-[13px] rounded-[3px] border border-black/[0.08] bg-white text-[12px] font-medium text-[var(--ink-2)] hover:bg-black/[0.04] transition-colors inline-flex items-center gap-1.5"
                  title="Segarkan Riwayat"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Segarkan</span>
                </button>
              </div>

              {/* Report Records Table */}
              <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
                {loadingHistory ? (
                  <div className="py-12 text-center text-[var(--ink-3)] font-mono text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto mb-2" />
                    <p>Memuat arsip berkas laporan...</p>
                  </div>
                ) : historyReports.length === 0 ? (
                  <div className="py-10 text-center text-[var(--ink-3)] font-mono text-xs p-6">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-[var(--ink-2)] text-[13px]">Belum Ada Arsip Laporan</p>
                    <p className="mt-1">
                      Dokumen otomatis akan diarsip setiap Senin pukul 07:00 WIB atau melalui tombol generate di atas.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--field)] text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider border-b border-black/[0.08]">
                        <tr>
                          <th className="py-[13px] px-[21px]">Judul Dokumen & Tipe</th>
                          <th className="py-[13px] px-[21px]">Periode Evaluasi</th>
                          <th className="py-[13px] px-[21px] text-right font-mono">Ukuran</th>
                          <th className="py-[13px] px-[21px] text-right font-mono">Waktu Terbit</th>
                          <th className="py-[13px] px-[21px] text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.06]">
                        {historyReports.map((report) => {
                          const isDownloading = downloadingHistoryId === report.id;
                          const sizeKb = Math.round(report.file_size_bytes / 1024);
                          const isPdf = report.file_name.endsWith(".pdf");

                          return (
                            <tr key={report.id} className="hover:bg-black/[0.02] transition-colors">
                              <td className="py-[13px] px-[21px]">
                                <div className="flex items-center gap-2.5">
                                  {isPdf ? (
                                    <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center">
                                      PDF
                                    </span>
                                  ) : (
                                    <span className="h-[20px] px-1.5 rounded-[2px] text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 inline-flex items-center">
                                      CSV
                                    </span>
                                  )}
                                  <div>
                                    <span className="font-semibold text-[var(--ink)] block text-[13px]">{report.title}</span>
                                    <span className="text-[11px] font-mono text-[var(--ink-3)]">{report.file_name}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-[13px] px-[21px] font-mono tabular-nums text-[12px] text-[var(--ink-2)]">
                                {report.period_start && report.period_end ? (
                                  <span>
                                    {report.period_start} s/d {report.period_end}
                                  </span>
                                ) : (
                                  <span className="text-[var(--ink-3)]">-</span>
                                )}
                              </td>
                              <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[12px] text-[var(--ink-2)]">
                                {sizeKb > 0 ? `${sizeKb} KB` : "< 1 KB"}
                              </td>
                              <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[12px] text-[var(--ink-2)]">
                                {new Date(report.created_at).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="py-[13px] px-[21px] text-right">
                                <button
                                  onClick={() => handleDownloadArchivedReport(report)}
                                  disabled={isDownloading}
                                  className="h-[30px] px-[13px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                                >
                                  {isDownloading ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Download className="w-3.5 h-3.5" />
                                  )}
                                  <span>Unduh</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
