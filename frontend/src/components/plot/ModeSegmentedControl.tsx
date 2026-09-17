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
      className={`relative inline-grid grid-cols-2 p-[2px] bg-[var(--field)] rounded-[3px] border border-black/[0.08] select-none ${className}`.trim()}
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
            className={`relative z-10 flex items-center justify-center gap-2 py-1 px-3 rounded-[2px] text-[12.5px] font-medium tracking-tight transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
              isActive
                ? "bg-white text-[var(--ink)] border border-black/[0.08]"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)]"
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
