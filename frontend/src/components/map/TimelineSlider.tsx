"use client";

import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Calendar,
  Activity,
  Clock,
} from "lucide-react";

interface TimelineSliderProps {
  dates: string[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  isNdviMode: boolean;
  onToggleNdviMode: () => void;
  avgNdvi?: number | null;
  totalPlots?: number;
}

export default function TimelineSlider({
  dates,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  isNdviMode,
  onToggleNdviMode,
  avgNdvi,
  totalPlots = 0,
}: TimelineSliderProps) {
  // Format tanggal bahasa indonesia
  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const currentDateStr = dates[currentIndex] || "";
  const formattedDate = formatDateIndo(currentDateStr);

  const handlePrev = () => {
    if (dates.length === 0) return;
    const newIdx = currentIndex <= 0 ? dates.length - 1 : currentIndex - 1;
    onIndexChange(newIdx);
  };

  const handleNext = () => {
    if (dates.length === 0) return;
    const newIdx = currentIndex >= dates.length - 1 ? 0 : currentIndex + 1;
    onIndexChange(newIdx);
  };

  if (dates.length === 0) {
    return (
      <div className="bg-white/85 backdrop-blur-[14px] px-4 py-2.5 rounded-[3px] border border-black/[0.08] shadow-[0_2px_16px_rgba(0,0,0,0.10)] text-xs text-[var(--ink-2)] flex items-center gap-2">
        <Clock className="w-4 h-4 text-[var(--ink-3)] animate-spin" />
        <span>Memuat timeline pengamatan vegetasi...</span>
      </div>
    );
  }

  // Helper status warna rata-rata NDVI (kondisi < 0.30 adalah bera / tanah terbuka netral)
  const getNdviBadge = (val?: number | null) => {
    if (val === null || val === undefined) return { label: "N/A", bg: "bg-slate-100 text-slate-600" };
    if (val < 0.3) {
      return {
        label: `${val.toFixed(2)} (Bera / Terbuka)`,
        bg: "bg-slate-100 text-slate-700 border border-slate-300",
      };
    }
    if (val < 0.55) return { label: `${val.toFixed(2)} (Waspada)`, bg: "bg-amber-100 text-amber-800" };
    if (val <= 0.75) return { label: `${val.toFixed(2)} (Baik)`, bg: "bg-emerald-100 text-emerald-800" };
    return { label: `${val.toFixed(2)} (Sangat Baik)`, bg: "bg-teal-100 text-teal-800" };
  };

  const ndviBadge = getNdviBadge(avgNdvi);

  return (
    <div className="w-full max-w-3xl bg-white/85 backdrop-blur-[14px] rounded-[3px] shadow-[0_2px_16px_rgba(0,0,0,0.10)] border border-black/[0.08] p-3 sm:p-4 text-[var(--ink)] select-none transition-all">
      {/* Top Header Controls: Mode Toggle & Status Observasi */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-black/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600/10 text-emerald-700 flex items-center justify-center font-bold">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Observasi Temporal ({currentIndex + 1} dari {dates.length})
              </span>
              {isPlaying && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  Timelapse Berjalan ({speed}x)
                </span>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {formattedDate}
            </h3>
          </div>
        </div>

        {/* Right Info: Mode Switcher & NDVI Stat */}
        <div className="flex items-center gap-2">
          {/* Mode Layer Switch: NDVI vs Komoditas */}
          <button
            type="button"
            onClick={onToggleNdviMode}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              isNdviMode
                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
            }`}
            title={isNdviMode ? "Beralih ke warna komoditas tanaman" : "Beralih ke spektrum NDVI"}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isNdviMode ? "Mode NDVI Aktif" : "Warna Komoditas"}</span>
          </button>

          {/* Rata-rata NDVI pada tanggal ini */}
          {avgNdvi !== undefined && avgNdvi !== null && (
            <div
              className={`hidden sm:flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${ndviBadge.bg}`}
              title="Rata-rata NDVI seluruh petak pada tanggal observasi ini"
            >
              <span className="text-[10px] uppercase font-bold text-slate-500">Rerata:</span>
              <span>{ndviBadge.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Slider & Playback Controls Row */}
      <div className="flex items-center gap-3">
        {/* Play / Pause Button */}
        <button
          type="button"
          onClick={onTogglePlay}
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md transition-transform active:scale-95 ${
            isPlaying
              ? "bg-amber-500 hover:bg-amber-600"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
          title={isPlaying ? "Jeda animasi timelapse" : "Putar animasi timelapse NDVI"}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
        </button>

        {/* Step Prev Button */}
        <button
          type="button"
          onClick={handlePrev}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="Tanggal sebelumnya"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Temporal Range Slider */}
        <div className="flex-1 relative flex flex-col justify-center">
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            value={currentIndex}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 hover:accent-emerald-700 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />

          {/* Timeline Step Ticks */}
          <div className="flex justify-between w-full mt-1.5 px-0.5 text-[9px] font-medium text-slate-400">
            <span>{formatDateIndo(dates[0])}</span>
            <span className="hidden sm:inline">
              {dates.length > 2 ? formatDateIndo(dates[Math.floor(dates.length / 2)]) : ""}
            </span>
            <span>{formatDateIndo(dates[dates.length - 1])}</span>
          </div>
        </div>

        {/* Step Next Button */}
        <button
          type="button"
          onClick={handleNext}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="Tanggal berikutnya"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Speed Toggle (1x / 2x) */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => onSpeedChange(1)}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
              speed === 1
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
            title="Kecepatan normal (1.5 detik/langkah)"
          >
            1x
          </button>
          <button
            type="button"
            onClick={() => onSpeedChange(2)}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
              speed === 2
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
            title="Kecepatan ganda (0.75 detik/langkah)"
          >
            2x
          </button>
        </div>
      </div>
    </div>
  );
}
