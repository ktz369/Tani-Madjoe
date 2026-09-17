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
    <main className="min-h-screen bg-[var(--canvas)] font-sans pt-[68px] flex flex-col justify-between">
      {/* Header Navigation */}
      <Navbar />

      <div className="w-full">
        {/* Hero Section */}
        <section className="border-b border-black/[0.08] bg-[var(--canvas)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[3px] bg-white border border-black/[0.08] text-[var(--accent-ink)] text-[12px] font-medium mb-5 tracking-tight">
              <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Platform Monitoring Lahan & Tanaman Presisi</span>
            </div>
            
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--ink)] mb-4 leading-tight">
              TANDUR — Monitoring Pertanian Modern
            </h1>
            
            <p className="text-[14px] sm:text-[15px] text-[var(--ink-2)] max-w-2xl mx-auto leading-relaxed mb-8">
              Solusi pemantauan agrikultur terintegrasi menggunakan citra satelit Sentinel-2, 
              kalkulasi indeks vegetasi (NDVI/EVI/NDWI), prediksi fenologi tanaman, dan ramalan cuaca terpadu.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Buka Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <Link
                href="/admin/organisasi"
                className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <FolderTree className="w-3.5 h-3.5 text-[var(--ink-2)]" />
                <span>Hierarki Organisasi</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Feature & Modules Section */}
        <section className="border-b border-black/[0.08] py-12 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Quick Access Card: Hierarki Organisasi */}
            <div className="border border-black/[0.08] rounded-[3px] p-[21px] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] bg-[var(--field)] border border-black/[0.08] text-[var(--ink-2)] text-[11px] font-medium">
                  <Building2 className="w-3 h-3 text-[var(--accent)]" />
                  <span>Modul Organisasi Lahan</span>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-[var(--ink)]">
                  Struktur Hierarki Lahan Perkebunan
                </h3>
                <p className="text-[13px] text-[var(--ink-2)] max-w-2xl leading-relaxed">
                  Atur hierarki bertingkat Company → Estate → Division lengkap dengan koordinat spasial PostGIS untuk titik cuaca dan stasiun satelit.
                </p>
              </div>
              <Link
                href="/admin/organisasi"
                className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors shrink-0"
              >
                <span>Buka Pohon Organisasi</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Key Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="border border-black/[0.08] rounded-[3px] p-[21px] bg-white flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 rounded-[3px] bg-[var(--field)] border border-black/[0.08] text-[var(--accent)] flex items-center justify-center mb-3.5">
                    <Satellite className="w-4 h-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)] mb-1.5">
                    Citra Satelit & Indeks NDVI
                  </h3>
                  <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                    Integrasi Google Earth Engine dengan Sentinel-2 untuk analisis kesehatan tanaman, kanopi vegetasi, dan kadar air lahan secara berkala.
                  </p>
                </div>
              </div>

              <div className="border border-black/[0.08] rounded-[3px] p-[21px] bg-white flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 rounded-[3px] bg-[var(--field)] border border-black/[0.08] text-[var(--accent)] flex items-center justify-center mb-3.5">
                    <CloudSun className="w-4 h-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)] mb-1.5">
                    Prakiraan Cuaca & Evapotranspirasi
                  </h3>
                  <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                    Data meteorologi Open-Meteo, kalkulasi kebutuhan air harian (ET₀), dan akumulasi Growing Degree Days (GDD) untuk estimasi masa panen.
                  </p>
                </div>
              </div>

              <div className="border border-black/[0.08] rounded-[3px] p-[21px] bg-white flex flex-col justify-between">
                <div>
                  <div className="w-9 h-9 rounded-[3px] bg-[var(--field)] border border-black/[0.08] text-[var(--accent)] flex items-center justify-center mb-3.5">
                    <BellRing className="w-4 h-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)] mb-1.5">
                    Peringatan Dini Anomali
                  </h3>
                  <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                    Sistem deteksi dini otomatis untuk penurunan kesehatan tanaman, kekeringan, atau anomali cuaca ekstrem secara real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* System Health Status Section */}
        <section className="py-12">
          <div className="max-w-xl mx-auto px-4 sm:px-6">
            <div className="border border-black/[0.08] rounded-[3px] p-[21px] bg-white">
              <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-black/[0.08]">
                <h2 className="text-[13px] font-semibold text-[var(--ink)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--accent)]" />
                  <span>Status Konektivitas Sistem</span>
                </h2>
                <span className="text-[11px] text-[var(--ink-3)] font-mono uppercase tracking-wider">Telemetry</span>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-6 text-[var(--ink-2)] text-[13px]">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--accent)] border-t-transparent mr-2.5"></div>
                  Memeriksa status backend dan database...
                </div>
              )}

              {!loading && error && (
                <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-[3px] text-rose-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-medium text-[12px]">Koneksi Backend Bermasalah</p>
                    <p className="text-[11px] text-rose-600 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {!loading && health && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-center space-x-3">
                    <div className="p-1.5 bg-white border border-black/[0.08] text-[var(--accent)] rounded-[3px]">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--ink-3)] uppercase tracking-wider">FastAPI</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span className="text-[12px] font-semibold text-[var(--ink)] uppercase">{health.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-center space-x-3">
                    <div className="p-1.5 bg-white border border-black/[0.08] text-blue-600 rounded-[3px]">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--ink-3)] uppercase tracking-wider">PostGIS</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span className="text-[12px] font-semibold text-[var(--ink)] capitalize">{health.database}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Architectural Footer */}
      <footer className="border-t border-black/[0.08] bg-white py-6 text-center text-[12px] text-[var(--ink-3)]">
        <p>© 2026 TANDUR SaaS Platform. Seluruh hak cipta dilindungi undang-undang.</p>
      </footer>
    </main>
  );
}
