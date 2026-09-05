"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Map, Sparkles, RotateCcw, X } from "lucide-react";
import { PlotBatchCreateResponse } from "@/types";

export interface BatchCompletionModalProps {
  result: PlotBatchCreateResponse | null;
  onClose: () => void;
  onReset: () => void;
}

export function BatchCompletionModal({
  result,
  onClose,
  onReset,
}: BatchCompletionModalProps) {
  if (!result) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="rounded-[24px] bg-white border border-black/[0.06] shadow-2xl p-[24px] max-w-md w-full relative space-y-[21px]">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-[#71717a] hover:text-[#09090b] hover:bg-black/[0.04] transition-colors"
          aria-label="Tutup modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Header */}
        <div className="text-center pt-2">
          <div className="w-[48px] h-[48px] rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-[20px] font-medium text-[#09090b] text-center tracking-tight">
            Pendaftaran Massal Berhasil
          </h2>
          <p className="text-[13px] text-[#71717a] text-center mt-1">
            {result.created_count} petak lahan berhasil didaftarkan ke sistem dan siap dipantau.
          </p>
        </div>

        {/* Metrics Card */}
        <div className="bg-[#fcfdfd] border border-black/[0.04] rounded-[16px] p-[16px] grid grid-cols-2 gap-[13px]">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#71717a] block mb-1">
              Total Petak & Luas
            </span>
            <p className="font-mono tabular-nums text-[14px] font-semibold text-[#09090b]">
              {result.created_count} Petak ({result.total_area_hectares.toFixed(2)} Ha)
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#71717a] block mb-1">
              Telemetri Satelit
            </span>
            <p className="font-mono tabular-nums text-[14px] font-semibold text-[#059669]">
              30 Hari Backfill Aktif
            </p>
          </div>

          {result.failed_count > 0 && (
            <div className="col-span-2 text-[11.5px] text-amber-700 bg-amber-50/80 rounded-lg p-2 border border-amber-200/60">
              {result.failed_count} petak dilewati atau gagal diproses.
            </div>
          )}

          <div className="col-span-2 text-[11.5px] text-[#71717a] flex items-center gap-1.5 pt-2 border-t border-black/[0.04]">
            <Sparkles className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span>Telemetri Sentinel-2 (NDVI, NDRE, MSAVI) otomatis disinkronkan.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 pt-1">
          <Link
            href="/peta"
            className="rounded-full h-[40px] px-[21px] bg-[#059669] hover:bg-[#047857] text-white font-medium text-[13px] flex items-center justify-center gap-2 flex-1 shadow-xs transition-all"
          >
            <Map className="w-4 h-4" />
            <span>Lihat di Peta</span>
          </Link>

          <button
            type="button"
            onClick={onReset}
            className="rounded-full h-[40px] px-[21px] bg-[#f4f4f5] hover:bg-[#e4e4e7] text-[#09090b] font-medium text-[13px] flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#71717a]" />
            <span>Impor Berkas Lain</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default BatchCompletionModal;
