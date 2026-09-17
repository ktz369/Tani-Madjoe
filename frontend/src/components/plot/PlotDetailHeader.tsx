"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Bug,
  Package,
  Building2,
} from "lucide-react";
import { PlotTerraceMiniMap } from "@/components/plot";
import { PlantingSeason, Plot, PlotDetail } from "@/types";

export interface PlotDetailHeaderProps {
  plot: Plot;
  plotDetail: PlotDetail | null;
  activeSeason?: PlantingSeason;
  onOpenScouting: () => void;
  onOpenSaprotan: () => void;
  onOpenCreateSeason: () => void;
}

export default function PlotDetailHeader({
  plot,
  plotDetail,
  activeSeason,
  onOpenScouting,
  onOpenSaprotan,
  onOpenCreateSeason,
}: PlotDetailHeaderProps) {
  const currentHst = plotDetail?.current_hst ?? plot.current_hst ?? 0;

  return (
    <div className="space-y-3">
      {/* Navigation Breadcrumb Bar */}
      <div className="border-b border-black/[0.08] py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
          <Link
            href="/peta"
            className="hover:text-[var(--ink)] flex items-center gap-1 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Peta Monitoring
          </Link>
          <ChevronRight className="w-3 h-3 text-[var(--ink-3)]" />
          <span className="text-[var(--ink)] font-semibold truncate">
            Petak {plot.name}
          </span>
        </div>
      </div>

      {/* Persistent Anchor Header Container */}
      <section className="bg-white border border-black/[0.08] rounded-[3px] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-black/[0.08]">
          {/* Identity & Location */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="label-telemetry">DETAIL UNIT PETAK LAHAN</span>
              <span className="h-[18px] px-1.5 rounded-[2px] text-[9px] font-mono font-bold uppercase tracking-wider bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.08]">
                {plot.crop_type}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              {plot.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-3)] font-mono mt-1">
              {plot.company_name && (
                <span className="flex items-center gap-1 text-[var(--ink-2)]">
                  <Building2 className="w-3.5 h-3.5" />
                  {plot.company_name}
                </span>
              )}
              {plot.estate_name && (
                <>
                  <span>/</span>
                  <span>Kebun {plot.estate_name}</span>
                </>
              )}
              {plot.division_name && (
                <>
                  <span>/</span>
                  <span>Divisi {plot.division_name}</span>
                </>
              )}
            </div>
          </div>

          {/* Quick Action Buttons (NAV-07: Text on desktop, Icon-only on mobile) */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={onOpenScouting}
              className="h-[34px] px-3 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
              title="Lapor pengamatan hama & OPT lapang"
              aria-label="Catat OPT"
            >
              <Bug className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden sm:inline">Catat OPT</span>
            </button>

            <button
              onClick={onOpenSaprotan}
              className="h-[34px] px-3 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
              title="Aplikasi pupuk / pestisida dengan proteksi PHI"
              aria-label="Aplikasi Saprotan"
            >
              <Package className="w-3.5 h-3.5 text-[#1b4332]" />
              <span className="hidden sm:inline">Aplikasi Saprotan</span>
            </button>

            <button
              onClick={onOpenCreateSeason}
              className="h-[34px] px-3 sm:px-[16px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
              title="Mulai musim tanam baru"
              aria-label="Mulai Musim Baru"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mulai Musim</span>
            </button>
          </div>
        </div>

        {/* Compact Mini-Map & KPI Strip Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-4 items-center">
          {/* Compact Mini-Map (120-160px height) */}
          <div className="lg:col-span-4">
            <PlotTerraceMiniMap
              plotId={plot.id}
              plotName={plot.name}
              areaHectares={plot.area_hectares}
              polygonCoordinates={plot.polygon?.coordinates?.[0] as [number, number][]}
              compact={true}
            />
          </div>

          {/* Telemetry KPI Strip */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
              <span className="label-telemetry block text-[10px]">LUAS LAHAN</span>
              <div className="value-telemetry-sm text-[16px] tabular-nums mt-0.5">
                {plot.area_hectares ? plot.area_hectares.toFixed(2) : "0.00"}{" "}
                <span className="text-[11px] font-normal text-[var(--ink-3)]">ha</span>
              </div>
            </div>

            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
              <span className="label-telemetry block text-[10px]">VARIETAS</span>
              <div
                className="value-telemetry-sm text-[14px] truncate mt-0.5"
                title={plotDetail?.variety_name || plot.variety_name || "-"}
              >
                {plotDetail?.variety_name || plot.variety_name || "-"}
              </div>
            </div>

            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
              <span className="label-telemetry block text-[10px]">UMUR TANAMAN</span>
              <div className="value-telemetry-sm text-[15px] tabular-nums text-emerald-700 mt-0.5">
                {currentHst > 0 ? `${currentHst} HST` : "0 HST (Bera)"}
              </div>
            </div>

            <div className="border border-black/[0.08] bg-[var(--field)] p-2.5 rounded-[3px]">
              <span className="label-telemetry block text-[10px]">STATUS MUSIM</span>
              <div className="mt-1">
                {activeSeason ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                    Aktif
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--ink-3)] uppercase">
                    Bera
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
