"use client";

import React from "react";
import { Coins, TrendingUp, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { PlotUnitEconomicsCard } from "@/components/plot";
import { Plot, PlotDetail } from "@/types";

export interface TabKeuanganProps {
  plot: Plot;
  plotDetail: PlotDetail | null;
  refreshTrigger: number;
  onOpenSaprotanModal: () => void;
  onOpenPostHarvestModal: () => void;
  hasHarvestedSeason?: boolean;
}

export default function TabKeuangan({
  plot,
  plotDetail,
  refreshTrigger,
  onOpenSaprotanModal,
  onOpenPostHarvestModal,
  hasHarvestedSeason = false,
}: TabKeuanganProps) {
  const currentHst = plotDetail?.current_hst ?? plot.current_hst ?? 0;
  const isFallow = !plot.planting_date || currentHst === 0;

  return (
    <div className="space-y-[21px] py-2">
      {/* Phase-Adaptive Header Card */}
      {isFallow ? (
        <div className="border border-amber-200 bg-amber-50/40 rounded-[3px] p-[17px] flex items-start gap-3">
          <Coins className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300">
                Fase Bera (0 HST) — Modal Kerja Pra-Tanam
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-[var(--ink)]">
              Rencana Anggaran Modal Kerja Pra-Tanam
            </h3>
            <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
              Petak dalam status bera. Fokus alokasi anggaran adalah biaya persiapan olah tanah (tillage),
              pengadaan varietas benih tersertifikasi, dan pupuk organik dasar.
            </p>
          </div>
        </div>
      ) : hasHarvestedSeason ? (
        <div className="border border-blue-200 bg-blue-50/40 rounded-[3px] p-[17px] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase bg-blue-100 text-blue-900 border border-blue-300">
                  Fase Paska Panen — Laporan Laba Rugi
                </span>
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                Laporan Hasil Panen & Standar SNI 14% KA
              </h3>
              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                Kalkulasi margin kotor aktual per kilogram gabah/jagung kering panen (GKP/GKG)
                berdasarkan realisasi biaya saprotan dan upah HOK.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPostHarvestModal}
            className="h-[32px] px-3 rounded-[3px] bg-blue-700 hover:bg-blue-800 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Form Paska Panen</span>
          </button>
        </div>
      ) : (
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-[3px] p-[17px] flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                Fase Aktif ({currentHst} HST) — Real-Time HPP
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-[var(--ink)]">
              Monitoring Running HPP (Harga Pokok Produksi)
            </h3>
            <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
              Akumulasi biaya tenaga kerja HOK dan aplikasi saprotan per hari ini dibandingkan
              dengan proyeksi hasil panen (Break-Even Point).
            </p>
          </div>
        </div>
      )}

      {/* Unit Economics & Running HPP Card */}
      <PlotUnitEconomicsCard
        plotId={plot.id}
        plotName={plot.name}
        onOpenSaprotanModal={onOpenSaprotanModal}
        onOpenPostHarvestModal={onOpenPostHarvestModal}
        refreshTrigger={refreshTrigger}
        isFallow={isFallow}
        currentHst={currentHst}
      />
    </div>
  );
}
