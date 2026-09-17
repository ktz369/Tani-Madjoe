"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AlertOctagon,
  Droplets,
  Sparkles,
  CheckCircle2,
  MapPin,
  Clock,
  Lightbulb,
  Check,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AlertItem } from "@/types";
import {
  formatRelativeTime,
  getSeverityConfig,
  getAlertTypeLabel,
  markAlertAsRead,
  resolveAlert,
} from "./alertUtils";

interface AlertCardProps {
  alert: AlertItem;
  onUpdate?: (updated: AlertItem) => void;
  compact?: boolean;
}

export default function AlertCard({ alert, onUpdate, compact = false }: AlertCardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showTriggers, setShowTriggers] = useState(false);

  const severityCfg = getSeverityConfig(alert.severity);

  // Icon selector per severity/type
  const renderSeverityIcon = () => {
    switch (alert.severity?.toLowerCase()) {
      case "merah":
        return <AlertOctagon className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0`} />;
      case "oranye":
        return <Droplets className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0`} />;
      case "kuning":
        return <AlertTriangle className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0`} />;
      case "hijau_tua":
        return <Sparkles className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0`} />;
      default:
        return <AlertTriangle className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0`} />;
    }
  };

  const handleMarkAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoadingAction("read");
      const updated = await markAlertAsRead(alert.id);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      console.error("Gagal menandai alert telah dibaca:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResolve = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLoadingAction("resolve");
      const updated = await resolveAlert(alert.id);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      console.error("Gagal menyelesaikan alert:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const hasTriggers =
    alert.trigger_values &&
    typeof alert.trigger_values === "object" &&
    Object.keys(alert.trigger_values).length > 0;

  return (
    <div
      className={`rounded-[3px] border transition-colors bg-white ${
        !alert.is_read
          ? "border-amber-300"
          : "border-black/[0.08] hover:border-black/[0.16]"
      } ${severityCfg.accentBorder} border-l-4 overflow-hidden`}
    >
      <div className="p-3.5 space-y-2.5">
        {/* Header: Severity Badge, Status, & Time */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-medium border ${severityCfg.badgeBg} ${severityCfg.badgeText} ${severityCfg.badgeBorder}`}
            >
              {renderSeverityIcon()}
              <span>{severityCfg.label}</span>
            </span>

            {!alert.is_read && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="size-1.5 rounded-full bg-rose-600 animate-ping" />
                Baru
              </span>
            )}

            {alert.is_resolved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Selesai
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-[var(--ink-3)]">
            <Clock className="w-3 h-3" />
            <span title={new Date(alert.created_at).toLocaleString("id-ID")}>
              {formatRelativeTime(alert.created_at)}
            </span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-[13px] font-semibold text-[var(--ink)] leading-snug">
          {alert.title}
        </h4>

        {/* Location & Crop Info */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)] flex-wrap">
          <MapPin className="w-3 h-3 text-[var(--ink-3)] flex-shrink-0" />
          <Link
            href={`/petak/${alert.plot_id}`}
            className="font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Petak {alert.plot_name || `#${alert.plot_id}`}
          </Link>
          {alert.crop_type && (
            <span className="px-1.5 py-0.2 rounded-[2px] bg-[var(--field)] text-[var(--ink-2)] capitalize text-[10.5px]">
              {alert.crop_type}
            </span>
          )}
          {alert.estate_name && (
            <>
              <span className="text-black/20">•</span>
              <span className="text-[var(--ink-3)]">Kebun {alert.estate_name}</span>
            </>
          )}
        </div>

        {/* Anomaly Description */}
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
          {alert.description}
        </p>

        {/* Agronomic Recommendation Box */}
        {alert.recommendation && (
          <div
            className={`p-2.5 rounded-[3px] border text-[12px] ${severityCfg.recomBg} ${severityCfg.recomBorder} text-[var(--ink)] flex items-start gap-2`}
          >
            <Lightbulb className={`w-3.5 h-3.5 ${severityCfg.iconColor} flex-shrink-0 mt-0.5`} />
            <div className="space-y-0.5">
              <span className="font-semibold block text-[11px] uppercase tracking-wider text-[var(--ink)]">
                Rekomendasi Agronomi:
              </span>
              <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed">
                {alert.recommendation}
              </p>
            </div>
          </div>
        )}

        {/* Trigger Values Collapsible (if any) */}
        {hasTriggers && (
          <div>
            <button
              onClick={() => setShowTriggers(!showTriggers)}
              className="text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] font-medium inline-flex items-center gap-1 transition-colors"
            >
              <span>Parameter Indikator Pemicu</span>
              {showTriggers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showTriggers && (
              <div className="mt-1.5 p-2 bg-[var(--field)] border border-black/[0.08] rounded-[3px] text-[11.5px] space-y-1">
                {Object.entries(alert.trigger_values || {}).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between text-[var(--ink-2)]">
                    <span className="font-medium capitalize text-[var(--ink-3)]">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                      {typeof val === "number" ? val.toFixed(3) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-black/[0.08] flex items-center justify-between gap-2 flex-wrap">
          <Link
            href={`/petak/${alert.plot_id}`}
            className="text-[11.5px] text-[var(--ink-2)] hover:text-[var(--accent)] font-medium inline-flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Lihat Detail Petak</span>
          </Link>

          <div className="flex items-center gap-1.5">
            {!alert.is_read && (
              <button
                onClick={handleMarkAsRead}
                disabled={loadingAction === "read"}
                className="h-[28px] px-2.5 rounded-[3px] border border-black/[0.08] hover:bg-black/[0.03] text-[var(--ink-2)] font-medium text-[11.5px] transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                title="Tandai notifikasi ini telah dibaca"
              >
                <Check className="w-3 h-3 text-[var(--ink-3)]" />
                <span>{loadingAction === "read" ? "Menyimpan..." : "Tandai Dibaca"}</span>
              </button>
            )}

            {!alert.is_resolved ? (
              <button
                onClick={handleResolve}
                disabled={loadingAction === "resolve"}
                className="h-[28px] px-3 rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white font-medium text-[11.5px] transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                title="Tandai anomali ini telah ditindaklanjuti/diselesaikan"
              >
                <CheckCircle2 className="w-3 h-3 text-white" />
                <span>{loadingAction === "resolve" ? "Menyimpan..." : "Sudah Ditangani"}</span>
              </button>
            ) : (
              <span className="text-[11px] text-[var(--accent)] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
                Diselesaikan
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
