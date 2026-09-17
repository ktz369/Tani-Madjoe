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
import { Activity, Calendar, RefreshCw } from "lucide-react";
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

    const validRecords = data.filter(
      (item) => item.observation_date && (item.ndvi !== null || item.ndre !== null || item.ndwi !== null)
    );

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const fullDate = payload[0]?.payload?.date
        ? formatFullDate(payload[0].payload.date)
        : label;

      return (
        <div className="bg-white text-[var(--ink)] p-3 rounded-[3px] border border-black/[0.12] text-xs min-w-[200px] shadow-none font-sans">
          <p className="font-semibold text-[var(--ink)] border-b border-black/[0.08] pb-1.5 mb-2 flex items-center gap-1.5 font-mono text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
            {fullDate}
          </p>
          <div className="space-y-1.5">
            {payload.map((entry: any) => {
              let labelIndo = entry.name;
              if (entry.dataKey === "ndvi") {
                labelIndo = "NDVI (Kehijauan)";
              } else if (entry.dataKey === "ndre") {
                labelIndo = "NDRE (Klorofil)";
              } else if (entry.dataKey === "ndwi") {
                labelIndo = "NDWI (Kadar Air)";
              }

              return (
                <div key={entry.dataKey} className="flex items-center justify-between gap-3 font-mono text-[12px]">
                  <div className="flex items-center gap-1.5 font-sans">
                    <span
                      className="w-2 h-2 rounded-[2px]"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-[var(--ink-2)] text-[11px]">{labelIndo}</span>
                  </div>
                  <span className="font-bold text-[var(--ink)] tabular-nums">
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
    <div className="w-full bg-white border border-black/[0.08] rounded-[3px] p-[21px] space-y-[21px]">
      {/* Header Grafik & Filter Rentang Waktu */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-[13px]">
        <div>
          <span className="label-telemetry block">DATA TIME-SERIES SPEKTRAL</span>
          <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
            Tren Indeks Spektral Satelit (Sentinel-2)
          </h3>
          <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
            Pemantauan dinamika vegetasi historis sejak awal siklus ({plantingDate || "Awal Musim"})
          </p>
        </div>

        {/* Filter Tombol */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-[3px] border border-black/[0.08] bg-white p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilterRange("all")}
              className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
                filterRange === "all"
                  ? "bg-[var(--accent)] text-white font-medium"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
              }`}
            >
              SEMUA
            </button>
            <button
              type="button"
              onClick={() => setFilterRange("30d")}
              className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
                filterRange === "30d"
                  ? "bg-[var(--accent)] text-white font-medium"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
              }`}
            >
              30 HARI
            </button>
            <button
              type="button"
              onClick={() => setFilterRange("14d")}
              className={`h-[26px] px-2.5 rounded-[2px] text-[11px] transition-all ${
                filterRange === "14d"
                  ? "bg-[var(--accent)] text-white font-medium"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.03]"
              }`}
            >
              14 HARI
            </button>
          </div>

          <button
            type="button"
            onClick={fetchIndices}
            disabled={loading}
            className="h-[28px] px-2 rounded-[3px] border border-black/[0.08] hover:bg-black/[0.04] text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors disabled:opacity-50 inline-flex items-center justify-center"
            title="Muat ulang data grafik"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Konten Utama Grafik Bleeding Full Width */}
      {loading ? (
        <div className="h-72 flex flex-col items-center justify-center text-[var(--ink-3)] gap-2 font-mono">
          <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
          <span className="text-[12px]">Memuat deret waktu satelit...</span>
        </div>
      ) : error ? (
        <div className="h-72 flex flex-col items-center justify-center text-[var(--ink-2)] text-xs p-6 text-center font-mono">
          <p className="text-rose-600 font-semibold mb-2">{error}</p>
          <button
            type="button"
            onClick={fetchIndices}
            className="h-[30px] px-3 rounded-[3px] bg-[var(--accent)] text-white text-[12px] font-sans font-medium hover:bg-emerald-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-[var(--ink-3)] text-xs border border-dashed border-black/[0.12] rounded-[3px] p-6 text-center">
          <Activity className="w-7 h-7 text-[var(--ink-3)] opacity-50 mb-2" />
          <p className="font-semibold text-[var(--ink-2)] text-[13px]">Belum ada rekaman observasi satelit optik.</p>
          <p className="text-[11px] text-[var(--ink-3)] mt-1 max-w-sm font-mono">
            Data observasi Sentinel-2 akan diperbarui otomatis setiap orbit revisi selesai.
          </p>
        </div>
      ) : (
        <div className="w-full">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.06)" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  stroke="#94A3B8"
                  fontSize={11}
                  fontFamily="monospace"
                  dy={6}
                />
                <YAxis
                  domain={[-0.2, 1.0]}
                  ticks={[-0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                  stroke="#94A3B8"
                  fontSize={11}
                  fontFamily="monospace"
                  tickLine={false}
                  tickFormatter={(val) => val.toFixed(1)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ paddingBottom: 12, fontSize: "11px", fontWeight: 500, fontFamily: "monospace" }}
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
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#059669" }}
                  activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ndre"
                  name="ndre"
                  stroke="#2563eb"
                  strokeWidth={1.8}
                  dot={{ r: 2, fill: "#2563eb" }}
                  activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ndwi"
                  name="ndwi"
                  stroke="#0891b2"
                  strokeWidth={1.8}
                  dot={{ r: 2, fill: "#0891b2" }}
                  activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Keterangan & Panduan Indeks Spektral */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-black/[0.08] text-xs">
            <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
              <span className="label-telemetry block mb-1">NDVI (0.0 - 1.0)</span>
              <span className="text-[var(--ink-2)] text-[11px] leading-relaxed block">
                Indeks biomassa & kehijauan daun. Nilai &gt; 0.60 menandakan fotosintesis prima & kanopi lebat.
              </span>
            </div>

            <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
              <span className="label-telemetry block mb-1">NDRE (0.0 - 1.0)</span>
              <span className="text-[var(--ink-2)] text-[11px] leading-relaxed block">
                Sensitif terhadap klorofil & nitrogen pada kanopi padat tanpa mengalami saturasi optik.
              </span>
            </div>

            <div className="border border-black/[0.08] bg-[var(--field)] p-3 rounded-[3px]">
              <span className="label-telemetry block mb-1">NDWI (-0.3 - 0.6)</span>
              <span className="text-[var(--ink-2)] text-[11px] leading-relaxed block">
                Kandungan kelembapan kanopi daun. Mendeteksi cekaman kekeringan air lebih dini.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
