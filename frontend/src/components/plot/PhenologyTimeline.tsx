"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Droplets,
  Flame,
  Layers,
  Sprout,
} from "lucide-react";
import { PhaseProgressItem } from "@/types";

/**
 * Standar 7 Fase Pertumbuhan Padi Berbasis Growing Degree Days (GDD)
 * Sesuai Dokumen Spesifikasi Teknis Tani §2.3.B:
 * 1. Vegetatif Awal: 0 <= sum(GDD) < 350
 * 2. Vegetatif Aktif: 350 <= sum(GDD) < 650
 * 3. Inisiasi Malai: 650 <= sum(GDD) < 850
 * 4. Bunting (Booting): 850 <= sum(GDD) < 1050
 * 5. Berbunga (Heading): 1050 <= sum(GDD) < 1250
 * 6. Pengisian Bulir: 1250 <= sum(GDD) < 1600
 * 7. Masak Fisiologis: sum(GDD) >= 1600
 */
export const RICE_7_GROWTH_STAGES: PhaseProgressItem[] = [
  {
    phase_code: "VEG-1",
    phase_name: "Vegetatif Awal",
    hst_start: 0,
    hst_end: 20,
    gdd_target: 350,
    kc_value: 1.05,
    status: "upcoming",
  },
  {
    phase_code: "VEG-2",
    phase_name: "Vegetatif Aktif",
    hst_start: 21,
    hst_end: 40,
    gdd_target: 650,
    kc_value: 1.15,
    status: "upcoming",
  },
  {
    phase_code: "INI-M",
    phase_name: "Inisiasi Malai",
    hst_start: 41,
    hst_end: 55,
    gdd_target: 850,
    kc_value: 1.20,
    status: "upcoming",
  },
  {
    phase_code: "BOOT",
    phase_name: "Bunting (Booting)",
    hst_start: 56,
    hst_end: 70,
    gdd_target: 1050,
    kc_value: 1.25,
    status: "upcoming",
  },
  {
    phase_code: "HEAD",
    phase_name: "Berbunga (Heading)",
    hst_start: 71,
    hst_end: 85,
    gdd_target: 1250,
    kc_value: 1.20,
    status: "upcoming",
  },
  {
    phase_code: "GRAIN",
    phase_name: "Pengisian Bulir",
    hst_start: 86,
    hst_end: 105,
    gdd_target: 1600,
    kc_value: 1.05,
    status: "upcoming",
  },
  {
    phase_code: "MATUR",
    phase_name: "Masak Fisiologis",
    hst_start: 106,
    hst_end: 120,
    gdd_target: 1950,
    kc_value: 0.90,
    status: "upcoming",
  },
];

interface PhenologyTimelineProps {
  timeline?: PhaseProgressItem[];
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
  // Petakan 7 fase fenologi padi aktual terhadap akumulasi GDD
  const effectiveTimeline = useMemo(() => {
    const rawList =
      Array.isArray(timeline) && timeline.length >= 5 ? timeline : RICE_7_GROWTH_STAGES;

    let foundActive = false;
    return rawList.map((phase, idx) => {
      let status: "completed" | "active" | "upcoming" = "upcoming";
      const isLast = idx === rawList.length - 1;

      if (gddCumulative >= phase.gdd_target && !isLast) {
        status = "completed";
      } else if (!foundActive) {
        status = "active";
        foundActive = true;
      } else {
        status = "upcoming";
      }

      return {
        ...phase,
        status,
      };
    });
  }, [timeline, gddCumulative]);

  // Cari fase aktif saat ini
  const activeIndex = effectiveTimeline.findIndex((p) => p.status === "active");
  const defaultSelected = activeIndex >= 0 ? activeIndex : 0;
  const [selectedIndex, setSelectedIndex] = useState<number>(defaultSelected);

  useEffect(() => {
    const actIdx = effectiveTimeline.findIndex((p) => p.status === "active");
    if (actIdx >= 0) {
      setSelectedIndex(actIdx);
    }
  }, [effectiveTimeline]);

  const selectedPhase = effectiveTimeline[selectedIndex] || effectiveTimeline[0];
  const activePhase = effectiveTimeline[activeIndex] || effectiveTimeline[0];

  return (
    <div className="border border-black/[0.08] bg-white rounded-[3px] p-[21px] space-y-[21px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.08] pb-[13px]">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-telemetry">Fase Fenologi & Siklus Tumbuh</span>
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
            Alur Pertumbuhan Tanaman Terintegrasi
          </h3>
          <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
            Tahapan siklus hidup berdasarkan akumulasi unit termal GDD (°C-hari) & umur tanaman (HST)
          </p>
        </div>

        {/* Badge Fase Aktif */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="label-telemetry">FASE AKTIF:</span>
          <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-[3px] border border-emerald-500/20 bg-emerald-50 text-[var(--accent-ink)] text-[11px] font-mono font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            {currentPhaseName || "Dalam Pertumbuhan"}
          </span>
        </div>
      </div>

      {/* Horizontal Stepper Timeline Container */}
      <div className="overflow-x-auto pb-3 pt-1 -mx-1 px-1">
        <div className="min-w-[640px] flex items-center justify-between relative">
          {/* Connector Line Background */}
          <div className="absolute top-4 left-6 right-6 h-[1px] bg-black/[0.08] -z-0" />

          {effectiveTimeline.map((phase, idx) => {
            const isCompleted = phase.status === "completed";
            const isActive = phase.status === "active";
            const isSelected = selectedIndex === idx;

            return (
              <div
                key={phase.phase_code}
                onClick={() => setSelectedIndex(idx)}
                className="relative z-10 flex flex-col items-center cursor-pointer group focus:outline-none"
              >
                {/* Step Node */}
                <div
                  className={`w-8 h-8 rounded-[3px] flex items-center justify-center font-mono font-semibold text-[11px] transition-all ${
                    isActive
                      ? "bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/20 shadow-none"
                      : isCompleted
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-white text-[var(--ink-3)] border border-black/[0.12] hover:border-black/[0.24]"
                  } ${isSelected && !isActive ? "ring-2 ring-black/[0.15]" : ""}`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span>{phase.phase_code}</span>
                  )}
                </div>

                {/* Node Label */}
                <div className="mt-2 text-center max-w-[100px]">
                  <span
                    className={`block text-[11px] font-semibold leading-tight truncate ${
                      isActive
                        ? "text-[var(--accent-ink)]"
                        : isCompleted
                        ? "text-[var(--ink)]"
                        : "text-[var(--ink-3)]"
                    }`}
                    title={phase.phase_name}
                  >
                    {phase.phase_code}
                  </span>
                  <span className="block text-[10px] font-mono tabular-nums text-[var(--ink-3)] mt-0.5">
                    {phase.hst_start}-{phase.hst_end} HST
                  </span>
                </div>

                {/* Status Indicator Pill */}
                <div className="mt-1">
                  {isActive ? (
                    <span className="h-[18px] px-1.5 rounded-[3px] text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block uppercase tracking-wider">
                      Aktif
                    </span>
                  ) : isCompleted ? (
                    <span className="h-[18px] px-1.5 rounded-[3px] text-[9px] font-mono font-medium bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.06] inline-block">
                      Selesai
                    </span>
                  ) : (
                    <span className="h-[18px] px-1.5 rounded-[3px] text-[9px] font-mono text-[var(--ink-3)] border border-transparent inline-block">
                      Berikutnya
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
        <div className="border border-black/[0.08] bg-[var(--field)] rounded-[3px] p-[13px] transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.08] pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="h-[22px] px-2 rounded-[3px] bg-[var(--accent)] text-white font-mono font-semibold text-[11px] inline-flex items-center">
                {selectedPhase.phase_code}
              </span>
              <h4 className="font-semibold text-[var(--ink)] text-[13px]">
                {selectedPhase.phase_name}
              </h4>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="label-telemetry">STATUS:</span>
              <span
                className={`font-mono uppercase font-semibold px-1.5 py-0.5 rounded-[3px] text-[10px] border ${
                  selectedPhase.status === "active"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : selectedPhase.status === "completed"
                    ? "bg-slate-100 text-slate-700 border-black/[0.08]"
                    : "bg-white text-slate-500 border-black/[0.08]"
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
            <div className="bg-white p-3 rounded-[3px] border border-black/[0.08]">
              <span className="label-telemetry block mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[var(--ink-3)]" />
                Rentang HST
              </span>
              <span className="font-mono font-semibold text-[var(--ink)] text-[14px] tabular-nums">
                {selectedPhase.hst_start} - {selectedPhase.hst_end} <span className="text-[11px] text-[var(--ink-3)]">HST</span>
              </span>
              <span className="text-[10px] font-mono tabular-nums text-[var(--ink-3)] block mt-0.5">
                HST saat ini: {currentHst}
              </span>
            </div>

            <div className="bg-white p-3 rounded-[3px] border border-black/[0.08]">
              <span className="label-telemetry block mb-1 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-500" />
                Target GDD
              </span>
              <span className="font-mono font-semibold text-[var(--ink)] text-[14px] tabular-nums">
                {selectedPhase.gdd_target} <span className="text-[11px] text-[var(--ink-3)]">°C-hari</span>
              </span>
              <span className="text-[10px] font-mono tabular-nums text-[var(--ink-3)] block mt-0.5">
                Akumulasi: {gddCumulative} °C-hari
              </span>
            </div>

            <div className="bg-white p-3 rounded-[3px] border border-black/[0.08]">
              <span className="label-telemetry block mb-1 flex items-center gap-1">
                <Droplets className="w-3 h-3 text-blue-500" />
                Koefisien Tanaman (Kc)
              </span>
              <span className="font-mono font-semibold text-blue-700 text-[14px] tabular-nums">
                {selectedPhase.kc_value.toFixed(2)}
              </span>
              <span className="text-[10px] text-[var(--ink-3)] block mt-0.5">
                Pengali ET₀ untuk ETc
              </span>
            </div>

            <div className="bg-white p-3 rounded-[3px] border border-black/[0.08]">
              <span className="label-telemetry block mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3 text-[var(--accent)]" />
                Kebutuhan Air
              </span>
              <span className="font-medium text-[var(--ink-2)] text-[11px] line-clamp-2 leading-relaxed">
                {selectedPhase.kc_value >= 1.15
                  ? "Kebutuhan air tinggi (fase kritis)"
                  : selectedPhase.kc_value < 0.8
                  ? "Kebutuhan air minimal"
                  : "Kebutuhan air moderat stabil"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
