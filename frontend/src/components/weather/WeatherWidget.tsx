"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  SunMedium,
  Gauge,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Sparkles,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { WeatherCurrentResponse } from "@/types";
import {
  formatIndonesianDate,
  getWeatherConditionInfo,
} from "./weatherUtils";

interface WeatherWidgetProps {
  estateId?: number | null;
  estateName?: string;
  initialData?: WeatherCurrentResponse | null;
  compact?: boolean;
  className?: string;
  showForecastToggle?: boolean;
  isForecastOpen?: boolean;
  onToggleForecast?: () => void;
  onDataLoaded?: (data: WeatherCurrentResponse) => void;
}

export default function WeatherWidget({
  estateId,
  estateName,
  initialData = null,
  compact = false,
  className = "",
  showForecastToggle = false,
  isForecastOpen = false,
  onToggleForecast,
  onDataLoaded,
}: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherCurrentResponse | null>(initialData);
  const [loading, setLoading] = useState<boolean>(!initialData && !!estateId);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(
    async (forceSync = false) => {
      if (!estateId) {
        setData(null);
        setLoading(false);
        return;
      }

      try {
        if (forceSync) {
          setRefreshing(true);
          try {
            await api.post(`/jobs/weather?estate_id=${estateId}`);
          } catch (syncErr) {
            console.warn("Manual weather sync notice:", syncErr);
          }
        } else if (!data) {
          setLoading(true);
        }

        setError(null);
        const res = await api.get<WeatherCurrentResponse>(
          `/estates/${estateId}/weather/current`
        );
        setData(res.data);
        if (onDataLoaded) {
          onDataLoaded(res.data);
        }
      } catch (err: any) {
        console.error("Gagal memuat data cuaca:", err);
        const msg =
          err.response?.data?.detail ||
          "Data cuaca belum tersedia untuk kebun ini. Pastikan koordinat lokasi kebun sudah diatur.";
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [estateId, data, onDataLoaded]
  );

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    } else if (estateId) {
      fetchWeather(false);
    } else {
      setData(null);
      setLoading(false);
    }
  }, [estateId, initialData]);

  if (!estateId) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500 shadow-sm ${className}`}
      >
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium">Pilih kebun untuk melihat kondisi cuaca.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center min-h-[220px] ${className}`}
      >
        <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">
          Memuat data observasi cuaca terkini...
        </p>
        <p className="text-[11px] text-slate-400 mt-1">Open-Meteo API & Kalkulasi ET₀</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className={`bg-white rounded-2xl border border-rose-200 p-6 shadow-sm ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-rose-900">Cuaca Belum Tersedia</h4>
            <p className="text-xs text-rose-700 mt-1">{error}</p>
            <button
              onClick={() => fetchWeather(true)}
              disabled={refreshing}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              <span>{refreshing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cond = getWeatherConditionInfo(
    data?.condition_text,
    data?.rainfall_mm,
    data?.solar_radiation_mjm2,
    data?.wind_speed_ms
  );
  const ConditionIcon = cond.icon;

  const currentTemp =
    data?.temp_mean_c !== null && data?.temp_mean_c !== undefined
      ? Math.round(data.temp_mean_c)
      : data?.temp_max_c !== null &&
        data?.temp_max_c !== undefined &&
        data?.temp_min_c !== null &&
        data?.temp_min_c !== undefined
      ? Math.round((data.temp_max_c + data.temp_min_c) / 2)
      : null;

  // Compact Variant (e.g. for sidebar or petak detail page widget)
  if (compact) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-hidden ${className}`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${cond.bgColor} ${cond.iconColor}`}>
              <ConditionIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Cuaca Terkini
                </h4>
                {data?.is_forecast && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded border border-blue-200">
                    Prakiraan
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-slate-900">{cond.label}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black text-slate-900">
              {currentTemp !== null ? `${currentTemp}°C` : "-"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {data?.temp_max_c !== null && data?.temp_max_c !== undefined
                ? `${data.temp_max_c.toFixed(1)}°`
                : "-"}
              {" / "}
              {data?.temp_min_c !== null && data?.temp_min_c !== undefined
                ? `${data.temp_min_c.toFixed(1)}°`
                : "-"}
            </div>
          </div>
        </div>

        {/* 4 Mini Metrics */}
        <div className="grid grid-cols-2 gap-2.5 pt-3 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Kelembapan</span>
              <span className="font-bold text-slate-800">
                {data?.humidity_pct !== null && data?.humidity_pct !== undefined
                  ? `${Math.round(data.humidity_pct)}%`
                  : "-"}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
            <Wind className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Angin</span>
              <span className="font-bold text-slate-800">
                {data?.wind_speed_ms !== null && data?.wind_speed_ms !== undefined
                  ? `${data.wind_speed_ms.toFixed(1)} m/s`
                  : "-"}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Curah Hujan</span>
              <span className="font-bold text-slate-800">
                {data?.rainfall_mm !== null && data?.rainfall_mm !== undefined
                  ? `${data.rainfall_mm.toFixed(1)} mm`
                  : "0 mm"}
              </span>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <span className="text-[10px] text-emerald-700 block font-medium">
                ET₀ Acuan
              </span>
              <span className="font-bold text-emerald-900">
                {data?.et0_mm !== null && data?.et0_mm !== undefined
                  ? `${data.et0_mm.toFixed(1)} mm/hr`
                  : "-"}
              </span>
            </div>
          </div>
        </div>

        {showForecastToggle && onToggleForecast && (
          <button
            onClick={onToggleForecast}
            className="w-full mt-3 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
          >
            <span>{isForecastOpen ? "Tutup Prakiraan 16 Hari" : "Lihat Prakiraan 16 Hari"}</span>
            {isForecastOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
        )}
      </div>
    );
  }

  // Full Standard Dashboard Card Variant
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all ${className}`}
    >
      {/* Top Banner / Header */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-emerald-300 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-xs flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Cuaca & Evapotranspirasi Hari Ini
              </span>
              {data?.is_forecast && (
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 text-[11px] font-semibold">
                  Prediksi Harian
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2 text-slate-300 text-xs">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold text-white text-sm">
                {data?.estate_name || estateName || "Perkebunan"}
              </span>
              <span>•</span>
              <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>
                {data?.observation_date
                  ? formatIndonesianDate(data.observation_date, { short: false })
                  : "Hari Ini"}
              </span>
            </div>
          </div>

          {/* Action Buttons: Refresh & Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchWeather(true)}
              disabled={refreshing}
              title="Sinkronisasi Data Cuaca dari Open-Meteo"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`}
              />
              <span className="hidden sm:inline">
                {refreshing ? "Sinkronisasi..." : "Sinkronkan"}
              </span>
            </button>

            {showForecastToggle && onToggleForecast && (
              <button
                onClick={onToggleForecast}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <span>{isForecastOpen ? "Sembunyikan Grafik" : "Prakiraan 16 Hari"}</span>
                {isForecastOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Primary Temperature & Condition Hero */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-white/10 pt-5">
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 ${cond.iconColor}`}
            >
              <ConditionIcon className="w-10 h-10 text-white" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                  {currentTemp !== null ? `${currentTemp}°` : "-"}
                </span>
                <span className="text-xl font-bold text-slate-300">C</span>
              </div>
              <p className="text-sm font-bold text-emerald-300 mt-0.5">
                {cond.label}
              </p>
            </div>
          </div>

          {/* Min / Max Temperature badge */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xs px-4 py-2 rounded-xl border border-white/10 text-xs self-start sm:self-auto">
            <div className="flex items-center gap-1 text-amber-300">
              <span className="font-semibold text-slate-300">Maks:</span>
              <span className="font-bold text-sm">
                {data?.temp_max_c !== null && data?.temp_max_c !== undefined
                  ? `${data.temp_max_c.toFixed(1)}°C`
                  : "-"}
              </span>
            </div>
            <span className="text-white/30">|</span>
            <div className="flex items-center gap-1 text-sky-300">
              <span className="font-semibold text-slate-300">Min:</span>
              <span className="font-bold text-sm">
                {data?.temp_min_c !== null && data?.temp_min_c !== undefined
                  ? `${data.temp_min_c.toFixed(1)}°C`
                  : "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Meteorological Metrics Grid */}
      <div className="p-5 sm:p-6 bg-white">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* 1. Kelembapan Relatif */}
          <div className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold">Kelembapan Relatif</span>
              <Droplets className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-900">
                {data?.humidity_pct !== null && data?.humidity_pct !== undefined
                  ? Math.round(data.humidity_pct)
                  : "-"}
              </span>
              <span className="text-xs font-bold text-slate-500">%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Kadar uap air udara</p>
          </div>

          {/* 2. Kecepatan Angin */}
          <div className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold">Kecepatan Angin</span>
              <Wind className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-900">
                {data?.wind_speed_ms !== null && data?.wind_speed_ms !== undefined
                  ? data.wind_speed_ms.toFixed(1)
                  : "-"}
              </span>
              <span className="text-xs font-bold text-slate-500">m/s</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Kecepatan angin 10m</p>
          </div>

          {/* 3. Curah Hujan */}
          <div className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold">Curah Hujan</span>
              <CloudRain className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-900">
                {data?.rainfall_mm !== null && data?.rainfall_mm !== undefined
                  ? data.rainfall_mm.toFixed(1)
                  : "0.0"}
              </span>
              <span className="text-xs font-bold text-slate-500">mm</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Akumulasi presipitasi</p>
          </div>

          {/* 4. Radiasi Surya */}
          <div className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold">Radiasi Surya</span>
              <SunMedium className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-slate-900">
                {data?.solar_radiation_mjm2 !== null && data?.solar_radiation_mjm2 !== undefined
                  ? data.solar_radiation_mjm2.toFixed(1)
                  : "-"}
              </span>
              <span className="text-xs font-bold text-slate-500">MJ/m²</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Energi insolasi harian</p>
          </div>

          {/* 5. Evapotranspirasi Acuan ET₀ */}
          <div className="col-span-2 sm:col-span-1 bg-emerald-50/80 hover:bg-emerald-50 transition-colors p-3.5 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between text-emerald-800 mb-2">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">ET₀ Acuan FAO-56</span>
                <span
                  title="Evapotranspirasi acuan rumput standar FAO-56. Menunjukkan besaran laju kehilangan air harian."
                  className="cursor-help"
                >
                  <Info className="w-3.5 h-3.5 text-emerald-600" />
                </span>
              </div>
              <Gauge className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-emerald-950">
                {data?.et0_mm !== null && data?.et0_mm !== undefined
                  ? data.et0_mm.toFixed(2)
                  : "-"}
              </span>
              <span className="text-xs font-bold text-emerald-800">mm/hari</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">
              Kebutuhan air tanaman acuan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
