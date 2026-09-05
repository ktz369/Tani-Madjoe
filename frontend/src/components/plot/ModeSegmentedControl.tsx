"use client";

import React from "react";
import { Layers, UploadCloud } from "lucide-react";

export interface ModeSegmentedControlProps {
  activeTab: "single" | "batch";
  onChange: (tab: "single" | "batch") => void;
  className?: string;
}

export function ModeSegmentedControl({
  activeTab,
  onChange,
  className = "",
}: ModeSegmentedControlProps) {
  const items = [
    {
      id: "single" as const,
      label: "Petak Tunggal",
      icon: Layers,
    },
    {
      id: "batch" as const,
      label: "Impor Massal (Batch KML)",
      icon: UploadCloud,
    },
  ];

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentId: "single" | "batch"
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const nextTab = currentId === "single" ? "batch" : "single";
      onChange(nextTab);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Mode Pendaftaran Petak"
      className={`relative inline-grid grid-cols-2 p-[3px] bg-[#f4f4f5] rounded-full border border-black/[0.04] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] select-none ${className}`.trim()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, item.id)}
            className={`relative z-10 flex items-center justify-center gap-2 py-1.5 px-3.5 rounded-full text-[13px] font-medium tracking-tight transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#059669]/30 ${
              isActive
                ? "bg-white text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-[#71717a] hover:text-[#09090b]"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0 transition-colors" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ModeSegmentedControl;
