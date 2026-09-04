"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  CloudRain,
  Thermometer,
  Calendar,
  Gauge,
  Droplets,
  Wind,
  SunMedium,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { WeatherForecastResponse, WeatherDataItem } from "@/types";
import {
  formatIndonesianDate,
  getWeatherConditionInfo,
} from "./weatherUtils";

interface ForecastChartProps {
  estateId?: number | null;
  estateName?: string;
  initialData?: WeatherForecastResponse | null;
  className?: string;
}

export default function ForecastChart({
  estateId,
  estateName,
  initialData = null,
  className = "",
}: ForecastChartProps) {
  const [data, setData] = useState<WeatherForecastResponse | null>(initialData);
  const [loading, setLoading] = useState<boolean>(!initialData && !!estateId);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(0);
  const [chartMetric, setChartMetric] = useState<"combined" | "rain" | "et0">(
    "combined"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchForecast = useCallback(async () => {
    if (!estateId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<WeatherForecastResponse>(
        `/estates/${estateId}/weather/forecast?days=16`
      );
      setData(res.data);
    } catch (err: any) {
      console.error("Gagal memuat prakiraan cuaca:", err);
      setError(
        err.response?.data?.detail ||
          "Gagal memuat prakiraan cuaca 16 hari. Pastikan lokasi kebun sudah diisi."
      );
    } finally {
      setLoading(false);
    }
  }, [estateId]);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    } else if (estateId) {
      fetchForecast();
    } else {
      setData(null);
      setLoading(false);
    }
  }, [estateId, initialData, fetchForecast]);

  // Transform data items for Recharts
  const chartData = useMemo(() => {
    if (!data || !data.items) return [];

    return data.items.map((item, idx) => {
      const parts = item.observation_date ? item.observation_date.split("-") : [];
      let label = item.observation_date;
      if (parts.length === 3) {
        const monthShorts = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "Mei",
          "Jun",
          "Jul",
          "Agu",
          "Sep",
          "Okt",
          "Nov",
          "Des",
        ];
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        label = `${d} ${monthShorts[m] || ""}`;
      }

      return {
        index: idx,
        date: item.observation_date,
        displayDate: label,
        fullDate: formatIndonesianDate(item.observation_date, { short: false }),
        tempMax: item.temp_max_c ?? null,
        tempMin: item.temp_min_c ?? null,
        tempMean:
          item.temp_max_c && item.temp_min_c
            ? Number(((item.temp_max_c + item.temp_min_c) / 2).toFixed(1))
            : null,
        rainfall: item.rainfall_mm ?? 0,
        humidity: item.humidity_pct ?? null,
        windSpeed: item.wind_speed_ms ?? null,
        solarRadiation: item.solar_radiation_mjm2 ?? null,
        et0: item.et0_mm ?? null,
      };
    });
  }, [data]);

  const selectedItem: WeatherDataItem | null = useMemo(() => {
    if (!data || !data.items || selectedDayIndex === null) return null;
    return data.items[selectedDayIndex] || null;
  }, [data, selectedDayIndex]);

  if (!estateId) {
    return null;
  }

  if (loading) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm flex flex-col items-center justify-center min-h-[300px] ${className}`}
      >
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">
          Memuat data prakiraan cuaca 16 hari...
        </p>
        <p className="text-xs text-slate-400 mt-1">Open-Meteo & FAO-56 Penman-Monteith</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`bg-white rounded-2xl border border-rose-200 p-6 text-center shadow-sm ${className}`}
      >
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-rose-900">
          Prakiraan Cuaca Tidak Tersedia
        </h4>
        <p className="text-xs text-rose-600 mt-1 max-w-md mx-auto">{error}</p>
        <button
          onClick={fetchForecast}
          className="mt-3 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Coba Muat Ulang</span>
        </button>
      </div>
    );
  }

  if (!data || !data.items || data.items.length === 0) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 shadow-sm ${className}`}
      >
        <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium">
          Belum ada catatan prakiraan cuaca untuk kebun ini.
        </p>
      </div>
    );
  }

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pData = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-md min-w-[200px]">
          <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1.5 mb-2">
            {pData.fullDate}
          </div>
          <div className="space-y-1.5">
            {pData.tempMax !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Suhu Maks:
                </span>
                <span className="font-bold">{pData.tempMax}°C</span>
              </div>
            )}
            {pData.tempMin !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sky-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Suhu Min:
                </span>
                <span className="font-bold">{pData.tempMin}°C</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-blue-300 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Curah Hujan:
              </span>
              <span className="font-bold">{pData.rainfall.toFixed(1)} mm</span>
            </div>
            {pData.et0 !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-emerald-300 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  ET₀ Acuan:
                </span>
                <span className="font-bold">{pData.et0.toFixed(2)} mm/hari</span>
              </div>
            )}
            {pData.humidity !== null && (
              <div className="flex items-center justify-between gap-4 text-slate-300">
                <span>Kelembapan:</span>
                <span className="font-semibold">{Math.round(pData.humidity)}%</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}
    >
      {/* Header Chart */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Prakiraan Cuaca & Kebutuhan Air (16 Hari)
              </h3>
              <p className="text-xs text-slate-500">
                Proyeksi parameter meteorologi dan laju evapotranspirasi acuan (ET₀)
              </p>
            </div>
          </div>
        </div>

        {/* Chart View Toggle Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 self-start sm:self-auto text-xs font-semibold">
          <button
            onClick={() => setChartMetric("combined")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              chartMetric === "combined"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Suhu & Hujan
          </button>
          <button
            onClick={() => setChartMetric("rain")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              chartMetric === "rain"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Curah Hujan (mm)
          </button>
          <button
            onClick={() => setChartMetric("et0")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              chartMetric === "et0"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            ET₀ Acuan (mm/hr)
          </button>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="p-4 sm:p-6">
        <div className="w-full h-[280px] sm:h-[320px]">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 15, right: 15, bottom: 5, left: -15 }}
                onClick={(e: any) => {
                  if (e && e.activeTooltipIndex !== undefined) {
                    setSelectedDayIndex(e.activeTooltipIndex);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />

                {chartMetric === "combined" && (
                  <>
                    <YAxis
                      yAxisId="temp"
                      orientation="left"
                      domain={["dataMin - 2", "dataMax + 2"]}
                      unit="°C"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="rain"
                      orientation="right"
                      domain={[0, "auto"]}
                      unit="mm"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                      formatter={(val: string) => {
                        if (val === "rainfall") return "Curah Hujan (mm)";
                        if (val === "tempMax") return "Suhu Maks (°C)";
                        if (val === "tempMin") return "Suhu Min (°C)";
                        if (val === "et0") return "ET₀ Acuan (mm/hari)";
                        return val;
                      }}
                    />
                    <Bar
                      yAxisId="rain"
                      dataKey="rainfall"
                      name="rainfall"
                      fill="#38bdf8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      opacity={0.8}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMax"
                      name="tempMax"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#f59e0b" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMin"
                      name="tempMin"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#0284c7" }}
                      activeDot={{ r: 5 }}
                    />
                  </>
                )}

                {chartMetric === "rain" && (
                  <>
                    <YAxis
                      domain={[0, "auto"]}
                      unit="mm"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="rainfall"
                      name="rainfall"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </>
                )}

                {chartMetric === "et0" && (
                  <>
                    <YAxis
                      domain={[0, "auto"]}
                      unit="mm"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="et0"
                      name="et0"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={{ r: 3.5, fill: "#059669" }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 16-Day Forecast Cards Horizontal Reel / Grid */}
      <div className="border-t border-slate-100 p-4 sm:p-6 bg-slate-50/40">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Rincian Harian (16 Hari ke Depan)
          </h4>
          <span className="text-[11px] text-slate-400">
            Geser horizontal untuk melihat seluruh hari
          </span>
        </div>

        <div className="flex items-stretch gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-slate-200">
          {data.items.map((item, idx) => {
            const cond = getWeatherConditionInfo(
              null,
              item.rainfall_mm,
              item.solar_radiation_mjm2,
              item.wind_speed_ms
            );
            const CondIcon = cond.icon;
            const isSelected = selectedDayIndex === idx;

            return (
              <div
                key={item.id || item.observation_date || idx}
                onClick={() => setSelectedDayIndex(idx)}
                className={`flex-shrink-0 w-32 p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  isSelected
                    ? "bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"
                }`}
              >
                {/* Tanggal */}
                <div className="text-center border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 block truncate">
                    {formatIndonesianDate(item.observation_date, {
                      short: true,
                      includeDay: true,
                    })}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {idx === 0 ? "Hari Ini" : `+${idx} hari`}
                  </span>
                </div>

                {/* Weather Condition Icon */}
                <div className="my-2.5 flex flex-col items-center justify-center">
                  <div
                    className={`p-2 rounded-xl mb-1 ${cond.bgColor} ${cond.iconColor}`}
                  >
                    <CondIcon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 text-center line-clamp-1">
                    {cond.label}
                  </span>
                </div>

                {/* Suhu Maks / Min */}
                <div className="text-center bg-slate-50 rounded-lg py-1 px-1.5 mb-2">
                  <div className="text-xs font-extrabold text-slate-900">
                    {item.temp_max_c !== null && item.temp_max_c !== undefined
                      ? `${Math.round(item.temp_max_c)}°`
                      : "-"}
                    <span className="text-slate-400 font-normal mx-0.5">/</span>
                    <span className="text-slate-500">
                      {item.temp_min_c !== null && item.temp_min_c !== undefined
                        ? `${Math.round(item.temp_min_c)}°`
                        : "-"}
                    </span>
                  </div>
                </div>

                {/* Curah Hujan & ET0 */}
                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1 text-slate-400">
                      <CloudRain className="w-3 h-3 text-sky-500" />
                      Hujan:
                    </span>
                    <span
                      className={`font-bold ${
                        (item.rainfall_mm ?? 0) > 0
                          ? "text-blue-600 font-black"
                          : "text-slate-600"
                      }`}
                    >
                      {item.rainfall_mm !== null && item.rainfall_mm !== undefined
                        ? `${item.rainfall_mm.toFixed(1)} mm`
                        : "0 mm"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Gauge className="w-3 h-3 text-emerald-600" />
                      ET₀:
                    </span>
                    <span className="font-bold text-emerald-700">
                      {item.et0_mm !== null && item.et0_mm !== undefined
                        ? `${item.et0_mm.toFixed(1)} mm`
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Day Expanded Details Box */}
        {selectedItem && (
          <div className="mt-4 p-4 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-bold text-slate-900">
                Detail Tanggal:{" "}
                {formatIndonesianDate(selectedItem.observation_date, {
                  short: false,
                })}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-slate-600 font-medium">
              <div className="flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-amber-500" />
                <span>
                  Suhu:{" "}
                  <strong className="text-slate-900">
                    {selectedItem.temp_min_c?.toFixed(1) ?? "-"}°C -{" "}
                    {selectedItem.temp_max_c?.toFixed(1) ?? "-"}°C
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-sky-500" />
                <span>
                  Curah Hujan:{" "}
                  <strong className="text-slate-900">
                    {selectedItem.rainfall_mm?.toFixed(1) ?? "0.0"} mm
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-600" />
                <span>
                  ET₀:{" "}
                  <strong className="text-emerald-700">
                    {selectedItem.et0_mm?.toFixed(2) ?? "-"} mm/hari
                  </strong>
                </span>
              </div>
              {selectedItem.wind_speed_ms !== null && selectedItem.wind_speed_ms !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Wind className="w-4 h-4 text-teal-600" />
                  <span>
                    Angin:{" "}
                    <strong className="text-slate-900">
                      {selectedItem.wind_speed_ms.toFixed(1)} m/s
                    </strong>
                  </span>
                </div>
              )}
              {selectedItem.solar_radiation_mjm2 !== null &&
                selectedItem.solar_radiation_mjm2 !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <SunMedium className="w-4 h-4 text-amber-500" />
                    <span>
                      Radiasi:{" "}
                      <strong className="text-slate-900">
                        {selectedItem.solar_radiation_mjm2.toFixed(1)} MJ/m²
                      </strong>
                    </span>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
