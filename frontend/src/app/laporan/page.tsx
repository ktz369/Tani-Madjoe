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
  ChevronRight,
  Info,
  ShieldAlert,
  ArrowDownToLine,
  History,
  Layers,
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

  // Loading States untuk masing-masing kartu download
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);
  const [loadingHarvest, setLoadingHarvest] = useState<boolean>(false);
  const [loadingWater, setLoadingWater] = useState<boolean>(false);
  const [loadingCsv, setLoadingCsv] = useState<boolean>(false);

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
        setEstates(res.data || []);
        if (res.data && res.data.length > 0) {
          setSelectedEstateId(res.data[0].id);
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
        setHistoryReports(res.data || []);
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
        const plotsData = res.data || [];
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

  // Helper Preset Tanggal Cepat
  const applyDatePreset = (days: number) => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);

    setEndDate(today.toISOString().split("T")[0]);
    setStartDate(past.toISOString().split("T")[0]);
  };

  // Helper Eksekusi Unduhan Blob
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

  // -------------------------------------------------------------
  // Handler 1: Unduh PDF Laporan Kesehatan
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Handler 2: Unduh PDF Laporan Prediksi Panen
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Handler 3: Unduh PDF Laporan Kebutuhan Air
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Handler 4: Unduh CSV Time-Series
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Handler 5: Unduh Arsip dari Riwayat
  // -------------------------------------------------------------
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
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Header Title & Deskripsi */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl shadow-inner">
                  <FileText className="w-7 h-7 text-emerald-700" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Pusat Laporan & Ekspor Data Operasional
                  </h1>
                  <p className="text-sm text-slate-500">
                    Generate dokumen resmi PDF agronomi dan unduh dataset gabungan satelit serta agroklimat dalam format CSV.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Status / Auto-schedule info */}
            <div className="flex items-center gap-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 sm:px-4 text-xs text-emerald-900">
              <Clock className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <span className="font-semibold block">Otomasi Mingguan Aktif</span>
                <span>Generate otomatis tiap Senin 07:00 WIB</span>
              </div>
            </div>
          </div>

          {/* Feedback Toast / Alert Banner */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl flex items-center justify-between shadow-sm transition-all border ${
                statusMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : statusMessage.type === "error"
                  ? "bg-rose-50 text-rose-900 border-rose-200"
                  : "bg-blue-50 text-blue-900 border-blue-200"
              }`}
            >
              <div className="flex items-center gap-3">
                {statusMessage.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <span className="text-sm font-medium">{statusMessage.text}</span>
              </div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-xs font-semibold hover:underline opacity-80"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Control Panel: Pilihan Estate & Rentang Tanggal */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span>Pengaturan Filter Unit Lahan & Periode Laporan</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dropdown Estate */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pilih Unit Estate (Kebun)
                </label>
                <div className="relative">
                  <select
                    value={selectedEstateId}
                    onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                    className="w-full pl-3 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800 font-medium"
                  >
                    {estates.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.name} ({est.kabupaten || est.province || "Indonesia"})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedEstateObj && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Mencakup {selectedEstateObj.division_count || 0} divisi dan{" "}
                    {selectedEstateObj.petak_count || 0} petak lahan.
                  </p>
                )}
              </div>

              {/* Tanggal Awal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Mulai Analisis
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800 font-medium"
                  />
                </div>
              </div>

              {/* Tanggal Akhir & Quick Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tanggal Akhir Analisis
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800 font-medium"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Preset cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(7)}
                    className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-600 rounded-md transition-colors"
                  >
                    7 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(30)}
                    className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-600 rounded-md transition-colors"
                  >
                    30 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset(90)}
                    className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-600 rounded-md transition-colors"
                  >
                    90 Hari
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4 Kartu Generator Laporan */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-600" />
                <span>Pilihan Dokumen Laporan & Ekspor Data</span>
              </h2>
              <p className="text-xs text-slate-500">
                Pilih format dokumen laporan yang ingin digenerate secara on-demand sesuai kebutuhan operasional.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Laporan Kesehatan Lahan (PDF) */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl group-hover:scale-105 transition-transform">
                      <HeartPulse className="w-7 h-7" />
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      PDF Dokumen
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                      1. Laporan Kesehatan Lahan & Anomali
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Evaluasi visual kesehatan tajuk vegetasi komprehensif per petak lahan berdasarkan citra satelit Sentinel-2.
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-600 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ringkasan statistik NDVI & luas area total estate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tabel petak: fase fenologi, HST, dan klasifikasi kanopi</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Daftar alert anomali aktif (Defisiensi N, Cekaman Air)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Rekomendasi agronomis & panduan penanganan lapangan</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={handleDownloadHealthReport}
                    disabled={loadingHealth || !selectedEstateId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingHealth ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
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

              {/* Card 2: Laporan Prediksi Panen (PDF) */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-amber-50 text-amber-700 rounded-xl group-hover:scale-105 transition-transform">
                      <CalendarClock className="w-7 h-7" />
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      PDF Dokumen
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                      2. Laporan Prediksi Panen & Progres GDD
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Proyeksi tanggal kematangan fisiologis dan estimasi tonase panen berbasis akumulasi satuan panas Growing Degree Days.
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-600 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Akumulasi GDD harian & kumulatif vs target varietas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Prediksi tanggal panen akurat per petak lahan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Estimasi tonase hasil panen (Ton/Ha & Total Produksi)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>SOP protokol pengeringan sawah 7-10 hari pra-panen</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={handleDownloadHarvestReport}
                    disabled={loadingHarvest || !selectedEstateId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingHarvest ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
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

              {/* Card 3: Laporan Manajemen Air & Irigasi (PDF) */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-sky-50 text-sky-700 rounded-xl group-hover:scale-105 transition-transform">
                      <Droplets className="w-7 h-7" />
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      PDF Dokumen
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                      3. Laporan Kebutuhan Air & Manajemen Irigasi
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Analisis neraca air tanaman dan rekomendasi debit irigasi presisi berbasis nilai evapotranspirasi (ET0 & ETc).
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-600 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>Rata-rata ET0 kebun (FAO Penman-Monteith) & curah hujan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>ETc harian tanaman (ET0 × Kc fase fenologi aktif)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>Total estimasi volume kebutuhan air (m³) per petak</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>Petunjuk pola irigasi hemat air intermiten AWD</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={handleDownloadWaterReport}
                    disabled={loadingWater || !selectedEstateId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingWater ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
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

              {/* Card 4: Export Data Mentah Agroklimat & Satelit (CSV) */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl group-hover:scale-105 transition-transform">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      CSV Dataset
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                      4. Ekspor Dataset Agroklimat & Satelit (CSV)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Ekspor data deret waktu (time-series) gabungan untuk analisis statistik mandiri di Microsoft Excel atau Python/R.
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs text-slate-600 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Indeks Satelit: NDVI, NDRE, NDWI, SAVI, SAR VV/VH dB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Cuaca Harian: Suhu Tmax/Tmin, Curah Hujan, dan ET0</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Termal & Konsumsi Air: GDD Harian/Kumulatif dan ETc (mm)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Metadata: Nama Petak, Divisi, Komoditas, Varietas, dan HST</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={handleDownloadCsv}
                    disabled={loadingCsv || !selectedEstateId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingCsv ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Mengekstrak Dataset CSV...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-4 h-4" />
                        <span>Unduh Dataset Mentah (CSV)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Bagian Interaktif: Analisis Komparasi Antar Musim */}
          <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <span>Analisis Komparasi Antar Musim Tanam Petak</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Bandingkan produktivitas, dinamika kehijauan NDVI, dan akumulasi iklim antar musim tanam pada petak yang sama.
                </p>
              </div>

              {/* Dropdown Petak Lahan */}
              <div className="min-w-[220px]">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Petak Lahan
                </label>
                <select
                  value={selectedPlotId}
                  onChange={(e) => setSelectedPlotId(Number(e.target.value) || "")}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800 font-medium"
                >
                  {estatePlots.map((plot) => (
                    <option key={plot.id} value={plot.id}>
                      {plot.name} ({plot.crop_type} - {plot.area_hectares} Ha)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingComparison ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                <p className="text-xs font-medium">Menganalisis data komparasi musim tanam...</p>
              </div>
            ) : seasonComparison ? (
              <div className="space-y-6">
                {/* Insights AI Card */}
                {seasonComparison.comparison_insights &&
                  seasonComparison.comparison_insights.length > 0 && (
                    <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <span>Insight Agronomis Komparatif</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-emerald-950">
                        {seasonComparison.comparison_insights.map((insight, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Grid Perbandingan Musim Aktif vs Historis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Musim Aktif */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider px-2 py-0.5 bg-emerald-100 rounded-md">
                        Musim Berjalan (Aktif)
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        {seasonComparison.current_season?.planting_date || "-"}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        Varietas: {seasonComparison.current_season?.variety_name || "Standar"}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Durasi Tanam: {seasonComparison.current_season?.duration_days || 0} HST
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase">Puncak NDVI</span>
                        <span className="text-sm font-extrabold text-emerald-600">
                          {seasonComparison.current_season?.peak_ndvi?.toFixed(2) || "-"}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase">Akumulasi Hujan</span>
                        <span className="text-sm font-extrabold text-slate-800">
                          {seasonComparison.current_season?.total_rainfall_mm?.toFixed(0) || "-"} mm
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase">Target / Est. Hasil</span>
                        <span className="text-sm font-extrabold text-emerald-700">
                          {seasonComparison.current_season?.yield_ton_per_ha?.toFixed(1) || "-"} T/Ha
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Musim Sebelumnya (Histori Terakhir) */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider px-2 py-0.5 bg-slate-200 rounded-md">
                        Musim Sebelumnya (Selesai)
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {seasonComparison.historical_seasons[0]?.planting_date || "Tidak ada data"}
                      </span>
                    </div>

                    {seasonComparison.historical_seasons.length > 0 ? (
                      <>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">
                            Varietas: {seasonComparison.historical_seasons[0].variety_name || "Standar"}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Total Durasi: {seasonComparison.historical_seasons[0].duration_days} Hari
                          </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Puncak NDVI</span>
                            <span className="text-sm font-extrabold text-slate-700">
                              {seasonComparison.historical_seasons[0].peak_ndvi?.toFixed(2) || "-"}
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Akumulasi Hujan</span>
                            <span className="text-sm font-extrabold text-slate-700">
                              {seasonComparison.historical_seasons[0].total_rainfall_mm?.toFixed(0) || "-"} mm
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Realisasi Hasil</span>
                            <span className="text-sm font-extrabold text-slate-700">
                              {seasonComparison.historical_seasons[0].yield_ton_per_ha?.toFixed(1) || "-"} T/Ha
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400 italic">
                        Belum ada riwayat musim tanam terdahulu yang tercatat pada sistem untuk petak ini.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                Pilih petak lahan untuk melihat analisis komparasi antar musim.
              </div>
            )}
          </section>

          {/* Bagian: Riwayat Arsip Laporan Mingguan */}
          <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  <span>Riwayat Arsip Dokumen Laporan Mingguan</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar laporan otomatis yang diarsip secara berkala oleh scheduler sistem pada unit estate ini.
                </p>
              </div>
              <button
                onClick={() => selectedEstateId && fetchHistory(Number(selectedEstateId))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
                title="Segarkan Riwayat"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Segarkan</span>
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600" />
                <p className="text-xs">Memuat arsip laporan...</p>
              </div>
            ) : historyReports.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-1">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">Belum Ada Arsip Laporan</p>
                <p className="text-xs text-slate-400">
                  Laporan otomatis akan terbit setiap Senin pukul 07:00 WIB atau melalui tombol generate di atas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Judul Dokumen & Tipe</th>
                      <th className="py-3 px-4">Periode Evaluasi</th>
                      <th className="py-3 px-4">Ukuran</th>
                      <th className="py-3 px-4">Waktu Terbit</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {historyReports.map((report) => {
                      const isDownloading = downloadingHistoryId === report.id;
                      const sizeKb = Math.round(report.file_size_bytes / 1024);
                      const isPdf = report.file_name.endsWith(".pdf");

                      return (
                        <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              {isPdf ? (
                                <span className="p-1.5 bg-rose-50 text-rose-700 rounded-md font-bold text-[10px]">
                                  PDF
                                </span>
                              ) : (
                                <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-md font-bold text-[10px]">
                                  CSV
                                </span>
                              )}
                              <div>
                                <span className="font-semibold text-slate-900 block">{report.title}</span>
                                <span className="text-[11px] text-slate-400">{report.file_name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {report.period_start && report.period_end ? (
                              <span>
                                {report.period_start} s/d {report.period_end}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono">{sizeKb > 0 ? `${sizeKb} KB` : "< 1 KB"}</td>
                          <td className="py-3 px-4">
                            {new Date(report.created_at).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDownloadArchivedReport(report)}
                              disabled={isDownloading}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50"
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
          </section>
        </main>
      </div>
    </AuthGuard>
  );
}
