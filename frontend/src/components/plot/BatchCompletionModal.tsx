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
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!result) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="rounded-[3px] bg-white border border-black/[0.08] p-[24px] max-w-md w-full relative space-y-[21px]">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[3px] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
          aria-label="Tutup modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Header */}
        <div className="text-center pt-2">
          <div className="w-[44px] h-[44px] rounded-[3px] bg-[#ecfdf5] text-[#059669] flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-[20px] font-medium text-[var(--ink)] text-center tracking-tight">
            Pendaftaran Massal Berhasil
          </h2>
          <p className="text-[13px] text-[var(--ink-2)] text-center mt-1">
            {result.created_count} petak lahan berhasil didaftarkan ke sistem dan siap dipantau.
          </p>
        </div>

        {/* Metrics Card */}
        <div className="bg-[var(--field)] border border-black/[0.08] rounded-[3px] p-[16px] grid grid-cols-2 gap-[13px]">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)] block mb-1">
              Total Petak & Luas
            </span>
            <p className="font-mono tabular-nums text-[14px] font-semibold text-[var(--ink)]">
              {result.created_count} Petak ({result.total_area_hectares.toFixed(2)} Ha)
            </p>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)] block mb-1">
              Telemetri Satelit
            </span>
            <p className="font-mono tabular-nums text-[14px] font-semibold text-[var(--accent)]">
              30 Hari Backfill Aktif
            </p>
          </div>

          {result.failed_count > 0 && (
            <div className="col-span-2 text-[11.5px] text-amber-700 bg-amber-50 rounded-[3px] p-2 border border-amber-200">
              {result.failed_count} petak dilewati atau gagal diproses.
            </div>
          )}

          <div className="col-span-2 text-[11.5px] text-[var(--ink-2)] flex items-center gap-1.5 pt-2 border-t border-black/[0.08]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Telemetri Sentinel-2 (NDVI, NDRE, MSAVI) otomatis disinkronkan.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 pt-1">
          <Link
            href="/peta"
            className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] text-white text-[13px] font-medium flex items-center justify-center gap-2 flex-1 transition-colors hover:bg-[#047857]"
          >
            <Map className="w-4 h-4" />
            <span>Lihat di Peta</span>
          </Link>

          <button
            type="button"
            onClick={onReset}
            className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--ink-2)]" />
            <span>Impor Berkas Lain</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default BatchCompletionModal;
