"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { HealthCheckResponse } from "@/types";
import { 
  Activity, 
  Satellite, 
  CloudSun, 
  BellRing, 
  CheckCircle2, 
  AlertCircle,
  Database,
  Server,
  Building2,
  ArrowRight,
  FolderTree
} from "lucide-react";

export default function HomePage() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        setLoading(true);
        const res = await api.get<HealthCheckResponse>("/health");
        setHealth(res.data);
        setError(null);
      } catch (err: any) {
        console.error("Health check error:", err);
        setError(err.response?.data?.detail?.message || "Gagal menghubungi backend API");
      } finally {
        setLoading(false);
      }
    }

    checkHealth();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <div>
        {/* Header Navigation */}
        <Navbar />

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium mb-4">
              <Activity className="w-4 h-4" /> Platform Monitoring Lahan & Tanaman Presisi
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
              Tani — Monitoring Pertanian Modern
            </h1>
            <p className="text-lg text-slate-600">
              Solusi pemantauan agrikultur terintegrasi menggunakan citra satelit Sentinel-2, 
              kalkulasi indeks vegetasi (NDVI/EVI/NDWI), prediksi fenologi tanaman, dan ramalan cuaca terpadu.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/admin/organisasi"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all hover:-translate-y-0.5"
              >
                <FolderTree className="w-5 h-5" />
                <span>Kelola Hierarki Organisasi</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Quick Access Card: Hierarki Organisasi */}
          <div className="max-w-3xl mx-auto mb-12">
            <div className="p-6 bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm">
                  <Building2 className="w-3.5 h-3.5" /> Modul Organisasi Lahan
                </div>
                <h3 className="text-xl font-extrabold">Struktur Hierarki Lahan Perkebunan</h3>
                <p className="text-emerald-100 text-sm max-w-lg">
                  Atur hierarki bertingkat Company → Estate → Division lengkap dengan koordinat spasial PostGIS untuk titik cuaca dan stasiun satelit.
                </p>
              </div>
              <Link
                href="/admin/organisasi"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-emerald-900 bg-white hover:bg-emerald-50 shadow transition-colors flex-shrink-0"
              >
                <span>Buka Pohon Organisasi</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* System Health Status Card */}
          <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-12">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Status Konektivitas Sistem
            </h2>

            {loading && (
              <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mr-3"></div>
                Memeriksa status backend dan database...
              </div>
            )}

            {!loading && error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <p className="font-medium text-sm">Koneksi Backend Bermasalah</p>
                  <p className="text-xs text-rose-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {!loading && health && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">FastAPI Backend</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-800 uppercase">{health.status}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-md">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">PostGIS Database</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-800 capitalize">{health.database}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Satellite className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Citra Satelit & Indeks NDVI</h3>
              <p className="text-sm text-slate-600">
                Integrasi Google Earth Engine dengan Sentinel-2 untuk analisis kesehatan tanaman, kanopi vegetasi, dan kadar air lahan secara berkala.
              </p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
                <CloudSun className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Prakiraan Cuaca & Evapotranspirasi</h3>
              <p className="text-sm text-slate-600">
                Data meteorologi Open-Meteo, kalkulasi kebutuhan air harian (ET₀), dan akumulasi Growing Degree Days (GDD) untuk estimasi masa panen.
              </p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
                <BellRing className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Peringatan Dini Anomali</h3>
              <p className="text-sm text-slate-600">
                Sistem deteksi dini otomatis untuk penurunan kesehatan tanaman, kekeringan, atau anomali cuaca ekstrem secara real-time.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500">
        <p>© 2026 Tani SaaS Platform. Seluruh hak cipta dilindungi undang-undang.</p>
      </footer>
    </main>
  );
}
