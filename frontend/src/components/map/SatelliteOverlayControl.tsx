"use client";

import React, { useState } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Sliders,
  Sparkles,
  Info,
  ChevronDown,
  Loader2,
} from "lucide-react";

interface SatelliteOverlayControlProps {
  isEnabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  visType: "true_color" | "false_color";
  onVisTypeChange: (type: "true_color" | "false_color") => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  isLoading?: boolean;
  attribution?: string | null;
}

export default function SatelliteOverlayControl({
  isEnabled,
  onToggleEnabled,
  visType,
  onVisTypeChange,
  opacity,
  onOpacityChange,
  isLoading = false,
  attribution,
}: SatelliteOverlayControlProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white/85 backdrop-blur-[14px] rounded-[3px] shadow-[0_2px_16px_rgba(0,0,0,0.10)] border border-black/[0.08] text-xs text-[var(--ink)] transition-all select-none">
      {/* Header Bar */}
      <div className="p-2.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isEnabled
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Layers className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="font-bold text-slate-900 leading-tight">Citra Satelit</div>
            <div className="text-[10px] text-slate-500">
              {isEnabled
                ? visType === "true_color"
                  ? "Warna Asli (RGB)"
                  : "Inframerah (NIR)"
                : "Tidak Aktif"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Switch Toggle */}
          <button
            type="button"
            onClick={() => onToggleEnabled(!isEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isEnabled ? "bg-emerald-600" : "bg-slate-300"
            }`}
            title={isEnabled ? "Matikan overlay citra satelit" : "Aktifkan overlay citra satelit"}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>

          {/* Expand Settings Button */}
          {isEnabled && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Pengaturan tipe citra & transparansi"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Settings Dropdown */}
      {isEnabled && isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2.5">
          {/* Pilihan Mode Spektral Citra */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Mode Spektroskopi
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onVisTypeChange("true_color")}
                className={`px-2 py-1.5 rounded-lg text-left transition-all border ${
                  visType === "true_color"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-900 font-bold shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="text-[11px] font-semibold">Warna Asli</div>
                <div className="text-[9px] text-slate-400">RGB (B4, B3, B2)</div>
              </button>

              <button
                type="button"
                onClick={() => onVisTypeChange("false_color")}
                className={`px-2 py-1.5 rounded-lg text-left transition-all border ${
                  visType === "false_color"
                    ? "bg-purple-50 border-purple-500 text-purple-900 font-bold shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="text-[11px] font-semibold">Inframerah Dekat</div>
                <div className="text-[9px] text-slate-400">CIR (B8, B4, B3)</div>
              </button>
            </div>
          </div>

          {/* Opacity Slider */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span className="font-bold uppercase tracking-wider text-slate-400">
                Transparansi Layer
              </span>
              <span className="font-semibold text-slate-700">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 focus:outline-none"
            />
          </div>

          {/* Attribution footer */}
          {attribution && (
            <div className="text-[9px] text-slate-400 truncate pt-0.5 flex items-center gap-1">
              <Info className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{attribution}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
