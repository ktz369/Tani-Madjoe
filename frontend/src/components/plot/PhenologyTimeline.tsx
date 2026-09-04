"use client";

import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  Flame,
  Info,
  Layers,
  Sparkles,
  Sprout,
} from "lucide-react";
import { PhaseProgressItem } from "@/types";

interface PhenologyTimelineProps {
  timeline: PhaseProgressItem[];
  currentHst: number;
  currentPhaseName?: string | null;
  gddCumulative: number;
}

export default function PhenologyTimeline({
  timeline = [],
  currentHst,
  currentPhaseName,
  gddCumulative,
}: PhenologyTimelineProps) {
  // Find currently active phase index
  const activeIndex = timeline.findIndex((p) => p.status === "active");
  const defaultSelected = activeIndex >= 0 ? activeIndex : Math.max(0, timeline.length - 1);
  const [selectedIndex, setSelectedIndex] = useState<number>(defaultSelected);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">
        <Sprout className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">
          Belum ada data tahapan fase fenologi.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Pastikan varietas benih dan siklus tumbuh tanaman sudah terkonfigurasi.
        </p>
      </div>
    );
  }

  const selectedPhase = timeline[selectedIndex] || timeline[0];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
            <Sprout className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Alur Fase Fenologi & Pertumbuhan Tanaman
            </h3>
            <p className="text-xs text-slate-500">
              Tahapan siklus hidup berdasarkan akumulasi unit termal GDD (°C-hari) & HST
            </p>
          </div>
        </div>

        {/* Badge Fase Aktif */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Fase Aktif:</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            {currentPhaseName || "Dalam Pertumbuhan"}
          </span>
        </div>
      </div>

      {/* Horizontal Stepper Timeline Container */}
      <div className="overflow-x-auto pb-4 pt-2 -mx-2 px-2">
        <div className="min-w-[640px] flex items-center justify-between relative">
          {/* Connector Line Background */}
          <div className="absolute top-5 left-6 right-6 h-1 bg-slate-200 -z-0" />

          {timeline.map((phase, idx) => {
            const isCompleted = phase.status === "completed";
            const isActive = phase.status === "active";
            const isUpcoming = phase.status === "upcoming";
            const isSelected = selectedIndex === idx;

            // Compute connector line color before this node
            return (
              <div
                key={phase.phase_code}
                onClick={() => setSelectedIndex(idx)}
                className="relative z-10 flex flex-col items-center cursor-pointer group focus:outline-none"
              >
                {/* Step Circle Node */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-sm ${
                    isActive
                      ? "bg-blue-600 text-white ring-4 ring-blue-100 scale-110 shadow-blue-200"
                      : isCompleted
                      ? "bg-emerald-600 text-white ring-2 ring-emerald-100 hover:bg-emerald-700"
                      : "bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200"
                  } ${isSelected && !isActive ? "ring-2 ring-slate-400" : ""}`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  ) : isActive ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  ) : (
                    <span>{phase.phase_code}</span>
                  )}
                </div>

                {/* Node Label */}
                <div className="mt-2.5 text-center max-w-[100px]">
                  <span
                    className={`block text-xs font-bold leading-tight truncate ${
                      isActive
                        ? "text-blue-700"
                        : isCompleted
                        ? "text-slate-800"
                        : "text-slate-400"
                    }`}
                    title={phase.phase_name}
                  >
                    {phase.phase_code}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    {phase.hst_start}-{phase.hst_end} HST
                  </span>
                </div>

                {/* Status Indicator Pill */}
                <div className="mt-1">
                  {isActive ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap">
                      Aktif
                    </span>
                  ) : isCompleted ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Selesai
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-slate-100 text-slate-400">
                      Akan Datang
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Phase Detail Box */}
      {selectedPhase && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs">
                {selectedPhase.phase_code}
              </span>
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                {selectedPhase.phase_name}
              </h4>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Status Fase:</span>
              <span
                className={`font-semibold capitalize px-2 py-0.5 rounded-md ${
                  selectedPhase.status === "active"
                    ? "bg-blue-100 text-blue-800 font-bold"
                    : selectedPhase.status === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {selectedPhase.status === "active"
                  ? "Sedang Berlangsung"
                  : selectedPhase.status === "completed"
                  ? "Telah Dilewati"
                  : "Tahap Mendatang"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-3 rounded-lg border border-slate-200/70">
              <span className="text-slate-500 block mb-1 flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Rentang Usia Tanam
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {selectedPhase.hst_start} - {selectedPhase.hst_end} HST
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Usia saat ini: {currentHst} HST
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200/70">
              <span className="text-slate-500 block mb-1 flex items-center gap-1 font-medium">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                Target Thermal GDD
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {selectedPhase.gdd_target} °C-hari
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Akumulasi: {gddCumulative} °C-hari
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200/70">
              <span className="text-slate-500 block mb-1 flex items-center gap-1 font-medium">
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                Koefisien Tanaman (Kc)
              </span>
              <span className="font-bold text-blue-700 text-sm">
                {selectedPhase.kc_value.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Pengali ET₀ untuk ETc
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200/70">
              <span className="text-slate-500 block mb-1 flex items-center gap-1 font-medium">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                Kebutuhan Pengelolaan
              </span>
              <span className="font-semibold text-slate-700 text-xs line-clamp-2">
                {selectedPhase.kc_value >= 1.15
                  ? "Kebutuhan air tinggi (fase kritis pembungaan)"
                  : selectedPhase.kc_value < 0.8
                  ? "Kebutuhan air minimal (fase pemasakan/pembibitan)"
                  : "Kebutuhan air moderat stabil"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
