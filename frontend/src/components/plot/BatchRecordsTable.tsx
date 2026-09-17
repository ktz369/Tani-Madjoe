"use client";

import React from "react";
import {
  CheckSquare,
  Square,
  MapPin,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { CropVariety } from "@/types";

export interface BatchPlotRow {
  id: string;
  selected: boolean;
  name: string;
  crop_type: "padi" | "jagung";
  variety_id: number | "";
  planting_date: string;
  geometry: any;
  area_hectares: number;
  area_m2: number;
  vertex_count: number;
  bounding_box: [number, number, number, number];
  centroid: [number, number];
  warnings: string[];
}

export interface BatchRecordsTableProps {
  rows: BatchPlotRow[];
  varieties: CropVariety[];
  onToggleSelectAll: (select: boolean) => void;
  onToggleRowSelect: (index: number) => void;
  onUpdateField: (index: number, field: keyof BatchPlotRow, val: any) => void;
  onFocusPlot: (row: BatchPlotRow) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
  className?: string;
}

export const BatchRecordsTable: React.FC<BatchRecordsTableProps> = ({
  rows,
  varieties,
  onToggleSelectAll,
  onToggleRowSelect,
  onUpdateField,
  onFocusPlot,
  onSubmit,
  loading,
  disabled = false,
  className = "",
}) => {
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <div
      className={`rounded-[3px] bg-white border border-black/[0.08] overflow-hidden flex flex-col ${className}`}
    >
      {/* Table header bar */}
      <div className="px-[16px] py-[12px] bg-white border-b border-black/[0.08] flex items-center justify-between">
        <button
          type="button"
          onClick={() => onToggleSelectAll(!allSelected)}
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#09090b] hover:text-[#059669] cursor-pointer transition-colors"
        >
          {allSelected ? (
            <CheckSquare className="size-4 text-[#059669]" />
          ) : (
            <Square className="size-4 text-[#71717a]" />
          )}
          <span>Pilih Semua ({rows.length})</span>
        </button>
        <span className="font-mono tabular-nums text-[12px] text-[#71717a]">
          {selectedCount} dari {rows.length} aktif
        </span>
      </div>

      {/* Scrollable records body */}
      <div className="max-h-[320px] overflow-y-auto divide-y divide-black/[0.08]">
        {rows.length === 0 ? (
          <div className="p-[21px] text-center text-[12px] text-[#71717a]">
            Tidak ada data petak untuk ditampilkan.
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.id || idx}
              className={`p-[13px] flex items-center gap-[10px] transition-colors hover:bg-[var(--hover)] ${
                row.selected ? "bg-white" : "bg-black/[0.01] opacity-60"
              }`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={row.selected}
                onChange={() => onToggleRowSelect(idx)}
                className="rounded-[3px] border-black/[0.15] text-[#059669] focus:ring-[#059669] size-4 cursor-pointer shrink-0"
              />

              {/* Row Details */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => onUpdateField(idx, "name", e.target.value)}
                    placeholder="Nama Petak"
                    className="text-[12px] font-semibold text-[#09090b] border border-black/[0.08] focus:border-[var(--accent)] focus:bg-white bg-white rounded-[3px] py-1 px-2 flex-1 min-w-0 transition-colors outline-none h-[28px]"
                  />
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-[8px] py-[2px] rounded-[3px] whitespace-nowrap">
                    {row.area_hectares.toFixed(2)} Ha
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={row.crop_type}
                    onChange={(e) =>
                      onUpdateField(
                        idx,
                        "crop_type",
                        e.target.value as "padi" | "jagung"
                      )
                    }
                    className="rounded-[3px] bg-white border border-black/[0.08] text-[11px] py-1 px-2 text-[#09090b] cursor-pointer outline-none focus:border-[var(--accent)] h-[28px]"
                  >
                    <option value="padi">Padi</option>
                    <option value="jagung">Jagung</option>
                  </select>

                  <select
                    value={row.variety_id ?? ""}
                    onChange={(e) =>
                      onUpdateField(
                        idx,
                        "variety_id",
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="rounded-[3px] bg-white border border-black/[0.08] text-[11px] py-1 px-2 text-[#09090b] max-w-[130px] truncate cursor-pointer outline-none focus:border-[var(--accent)] h-[28px]"
                  >
                    <option value="">Varietas Bawaan</option>
                    {varieties
                      .filter((v) => v.crop_type === row.crop_type)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>

                  {row.warnings && row.warnings.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-[3px] border border-amber-200 whitespace-nowrap"
                      title={row.warnings.join(", ")}
                    >
                      <AlertCircle className="size-3 text-amber-600 shrink-0" />
                      <span>Peringatan</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Focus Map Button */}
              <button
                type="button"
                onClick={() => onFocusPlot(row)}
                className="p-1.5 hover:bg-[var(--hover)] text-[#71717a] hover:text-[#059669] rounded-[3px] transition-colors cursor-pointer shrink-0"
                title="Fokuskan peta ke petak ini"
              >
                <MapPin className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Primary Action Button */}
      <div className="p-[13px] border-t border-black/[0.08] bg-white">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || loading || selectedCount === 0}
          className="rounded-[3px] h-[34px] px-[21px] bg-[var(--accent)] hover:bg-[#047857] text-white font-medium text-[13px] flex items-center justify-center gap-2 w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>Mendaftarkan & Mengaktifkan Telemetri...</span>
            </>
          ) : (
            <>
              <Save className="size-4" />
              <span>
                Daftarkan {selectedCount} Petak & Aktifkan Telemetri
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default BatchRecordsTable;
