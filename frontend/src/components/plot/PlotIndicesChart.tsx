"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, Calendar, Filter, Info, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { SpectralIndex, SpectralIndexListResponse } from "@/types";

interface PlotIndicesChartProps {
  plotId: number;
  plantingDate?: string | null;
  cropType?: string;
}

type TimeRangeFilter = "all" | "30d" | "14d";

export default function PlotIndicesChart({
  plotId,
  plantingDate,
  cropType = "padi",
}: PlotIndicesChartProps) {
  const [data, setData] = useState<SpectralIndex[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterRange, setFilterRange] = useState<TimeRangeFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<SpectralIndexListResponse>(`/plots/${plotId}/indices?satellite=sentinel-2`);
      setData(res.data.items || []);
    } catch (err: any) {
      console.error("Gagal memuat time-series satelit:", err);
      setError("Gagal memuat data grafik time-series indeks vegetasi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (plotId) {
      fetchIndices();
    }
  }, [plotId]);

  // Format and filter data for Recharts (chronological ascending)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Filter only optical records that have observation_date and at least one index
    const validRecords = data.filter(
      (item) => item.observation_date && (item.ndvi !== null || item.ndre !== null || item.ndwi !== null)
    );

    // Sort ascending by date
    const sorted = [...validRecords].sort((a, b) =>
      a.observation_date.localeCompare(b.observation_date)
    );

    if (filterRange === "all") {
      return sorted.map((item) => ({
        date: item.observation_date,
        displayDate: formatDateShort(item.observation_date),
        ndvi: item.ndvi !== null && item.ndvi !== undefined ? Number(item.ndvi.toFixed(3)) : null,
        ndre: item.ndre !== null && item.ndre !== undefined ? Number(item.ndre.toFixed(3)) : null,
        ndwi: item.ndwi !== null && item.ndwi !== undefined ? Number(item.ndwi.toFixed(3)) : null,
      }));
    }

    const now = new Date();
    const days = filterRange === "30d" ? 30 : 14;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const filtered = sorted.filter((item) => item.observation_date >= cutoffStr);

    return filtered.map((item) => ({
      date: item.observation_date,
      displayDate: formatDateShort(item.observation_date),
      ndvi: item.ndvi !== null && item.ndvi !== undefined ? Number(item.ndvi.toFixed(3)) : null,
      ndre: item.ndre !== null && item.ndre !== undefined ? Number(item.ndre.toFixed(3)) : null,
      ndwi: item.ndwi !== null && item.ndwi !== undefined ? Number(item.ndwi.toFixed(3)) : null,
    }));
  }, [data, filterRange]);

  function formatDateShort(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
  }

  function formatFullDate(dateStr: string) {
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
  }

  // Custom Tooltip dalam Bahasa Indonesia
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const fullDate = payload[0]?.payload?.date
        ? formatFullDate(payload[0].payload.date)
        : label;

      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[200px] backdrop-blur-sm">
          <p className="font-bold text-slate-200 border-b border-slate-700/80 pb-1.5 mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            {fullDate}
          </p>
          <div className="space-y-1.5">
            {payload.map((entry: any) => {
              let labelIndo = entry.name;
              let desc = "";
              if (entry.dataKey === "ndvi") {
                labelIndo = "NDVI (Kehijauan Vegetasi)";
                desc = "Biomassa & fotosintesis";
              } else if (entry.dataKey === "ndre") {
                labelIndo = "NDRE (Klorofil Red-Edge)";
                desc = "Kecukupan nitrogen";
              } else if (entry.dataKey === "ndwi") {
                labelIndo = "NDWI (Kadar Air Kanopi)";
                desc = "Hidrasi tanaman";
              }

              return (
                <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-slate-300 font-medium">{labelIndo}</span>
                  </div>
                  <span className="font-mono font-bold text-white">
                    {entry.value !== null && entry.value !== undefined
                      ? entry.value.toFixed(3)
                      : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      {/* Header Grafik & Filter Rentang Waktu */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Grafik Time-Series Indeks Spektral Satelit
              </h3>
              <p className="text-xs text-slate-500">
                Pemantauan historis Sentinel-2 sejak tanggal tanam ({plantingDate || "Awal Siklus"})
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tombol */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilterRange("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterRange === "all"
                  ? "bg-white text-emerald-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setFilterRange("30d")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterRange === "30d"
                  ? "bg-white text-emerald-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 Hari
            </button>
            <button
              type="button"
              onClick={() => setFilterRange("14d")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterRange === "14d"
                  ? "bg-white text-emerald-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              14 Hari
            </button>
          </div>

          <button
            type="button"
            onClick={fetchIndices}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50"
            title="Muat ulang data grafik"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Konten Utama Grafik */}
      {loading ? (
        <div className="h-72 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
          <span className="text-xs font-medium">Memuat data time-series satelit...</span>
        </div>
      ) : error ? (
        <div className="h-72 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
          <p className="text-rose-600 font-semibold mb-2">{error}</p>
          <button
            type="button"
            onClick={fetchIndices}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
          <Activity className="w-8 h-8 text-slate-300 mb-2" />
          <p className="font-semibold text-slate-600">Belum ada rekaman observasi satelit.</p>
          <p className="text-slate-400 mt-1 max-w-sm">
            Data observasi optik Sentinel-2 akan muncul secara otomatis setelah siklus perekaman citra selesai.
          </p>
        </div>
      ) : (
        <div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  stroke="#64748b"
                  fontSize={11}
                  dy={6}
                />
                <YAxis
                  domain={[-0.2, 1.0]}
                  ticks={[-0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => val.toFixed(1)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingBottom: 12, fontSize: "12px", fontWeight: 600 }}
                  formatter={(value) => {
                    if (value === "ndvi") return "NDVI (Kehijauan)";
                    if (value === "ndre") return "NDRE (Klorofil)";
                    if (value === "ndwi") return "NDWI (Kadar Air)";
                    return value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ndvi"
                  name="ndvi"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#10b981" }}
                  activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ndre"
                  name="ndre"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#3b82f6" }}
                  activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ndwi"
                  name="ndwi"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#06b6d4" }}
                  activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Keterangan & Panduan Indeks Spektral */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div className="flex items-start gap-2 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 block">NDVI (0.0 - 1.0)</span>
                <span className="text-slate-500">
                  Indeks biomassa & kehijauan daun. Nilai &gt; 0.60 menunjukkan tajuk tanaman sangat sehat.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 block">NDRE (0.0 - 1.0)</span>
                <span className="text-slate-500">
                  Sensitif terhadap klorofil & nitrogen pada kanopi lebat tanpa mengalami saturasi optik.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-cyan-50/50 p-2.5 rounded-xl border border-cyan-100">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 mt-1 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 block">NDWI (-0.3 - 0.6)</span>
                <span className="text-slate-500">
                  Kandungan kelembapan kanopi daun. Mendeteksi cekaman kekeringan air lebih dini.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
