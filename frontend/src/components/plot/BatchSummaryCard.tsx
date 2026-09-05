"use client";

import React from "react";
import { FileCheck, X, SlidersHorizontal, Sparkles } from "lucide-react";
import { CropVariety } from "@/types";

export interface BatchSummaryData {
  fileName: string;
  format: string;
  totalPlots: number;
  totalAreaHa: number;
  totalAreaM2: number;
  unifiedBbox: [number, number, number, number];
}

export interface BatchSummaryCardProps {
  summary: BatchSummaryData;
  selectedCount: number;
  onReset: () => void;
  bulkCropType: "padi" | "jagung";
  onBulkCropTypeChange: (type: "padi" | "jagung") => void;
  bulkVarietyId: number | "";
  onBulkVarietyIdChange: (id: number | "") => void;
  bulkPlantingDate: string;
  onBulkPlantingDateChange: (date: string) => void;
  varieties: CropVariety[];
  onApplyBulk: () => void;
  className?: string;
}

export function BatchSummaryCard({
  summary,
  selectedCount,
  onReset,
  bulkCropType,
  onBulkCropTypeChange,
  bulkVarietyId,
  onBulkVarietyIdChange,
  bulkPlantingDate,
  onBulkPlantingDateChange,
  varieties,
  onApplyBulk,
  className = "",
}: BatchSummaryCardProps) {
  const filteredVarieties = varieties.filter((v) => v.crop_type === bulkCropType);

  return (
    <div
      className={`rounded-[21px] bg-white border border-black/[0.06] shadow-sm p-[13px] space-y-[13px] ${className}`}
    >
      {/* Top Task Row: File Metadata & Quick Actions */}
      <div className="flex items-center justify-between gap-[13px]">
        <div className="flex items-center gap-[10px] min-w-0">
          <div className="w-[38px] h-[38px] rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#09090b] truncate" title={summary.fileName}>
              {summary.fileName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#71717a]">
              <span className="inline-flex items-center rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-[8px] py-[1px] text-[10px] font-medium text-[#059669]">
                {summary.format}
              </span>
              <span>•</span>
              <span>{summary.totalPlots} Petak Terdeteksi</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="hover:bg-[#f4f4f5] text-[#71717a] hover:text-rose-600 rounded-full p-1.5 transition-colors flex-shrink-0"
          title="Ganti berkas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Spatial Metrics 3-Column Pill Cards */}
      <div className="grid grid-cols-3 gap-[8px]">
        <div className="bg-[#fcfdfd] border border-black/[0.04] rounded-[13px] p-[10px] text-center">
          <span className="text-[11px] text-[#71717a] block mb-0.5">Total Petak</span>
          <span className="font-mono text-[13px] tabular-nums font-semibold text-[#09090b]">
            {summary.totalPlots}
          </span>
        </div>

        <div className="bg-[#fcfdfd] border border-black/[0.04] rounded-[13px] p-[10px] text-center">
          <span className="text-[11px] text-[#71717a] block mb-0.5">Total Luas</span>
          <span className="font-mono text-[13px] tabular-nums font-semibold text-[#09090b]">
            {summary.totalAreaHa.toFixed(2)} Ha
          </span>
        </div>

        <div className="bg-[#fcfdfd] border border-black/[0.04] rounded-[13px] p-[10px] text-center">
          <span className="text-[11px] text-[#71717a] block mb-0.5">Terpilih</span>
          <span className="font-mono text-[13px] tabular-nums font-semibold text-[#059669]">
            {selectedCount} Petak
          </span>
        </div>
      </div>

      {/* Quick Bulk Controls Card */}
      <div className="bg-[#fcfdfd] border border-black/[0.04] rounded-[13px] p-[13px] space-y-[10px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#059669]" />
            <span>Pengaturan Massal</span>
          </span>
          <button
            type="button"
            onClick={onApplyBulk}
            className="rounded-full px-[13px] py-[5px] bg-[#059669] hover:bg-[#047857] text-white text-[11.5px] font-medium transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Terapkan ke Terpilih</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-[8px]">
          <div>
            <label className="block text-[11px] font-medium text-[#71717a] mb-1">
              Komoditas
            </label>
            <select
              value={bulkCropType}
              onChange={(e) => onBulkCropTypeChange(e.target.value as "padi" | "jagung")}
              className="w-full text-[12px] rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 focus:border-[#059669] focus:ring-1 focus:ring-[#059669] text-[#09090b] outline-none transition-colors"
            >
              <option value="padi">Padi</option>
              <option value="jagung">Jagung</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#71717a] mb-1">
              Varietas
            </label>
            <select
              value={bulkVarietyId}
              onChange={(e) => onBulkVarietyIdChange(Number(e.target.value) || "")}
              className="w-full text-[12px] rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 focus:border-[#059669] focus:ring-1 focus:ring-[#059669] text-[#09090b] outline-none transition-colors"
            >
              <option value="">-- Standar --</option>
              {filteredVarieties.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#71717a] mb-1">
              Tanggal Tanam
            </label>
            <input
              type="date"
              value={bulkPlantingDate}
              onChange={(e) => onBulkPlantingDateChange(e.target.value)}
              className="w-full text-[12px] rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 focus:border-[#059669] focus:ring-1 focus:ring-[#059669] text-[#09090b] outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default BatchSummaryCard;
