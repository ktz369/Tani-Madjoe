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
      className={`rounded-xl border transition-all duration-200 bg-white ${
        !alert.is_read
          ? "border-amber-300 shadow-sm ring-1 ring-amber-400/20"
          : "border-slate-200 hover:border-slate-300 shadow-sm"
      } ${severityCfg.accentBorder} border-l-4 overflow-hidden`}
    >
      <div className="p-4 space-y-3">
        {/* Header: Severity Badge, Status, & Time */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${severityCfg.badgeBg} ${severityCfg.badgeText} ${severityCfg.badgeBorder}`}
            >
              {renderSeverityIcon()}
              <span>{severityCfg.label}</span>
            </span>

            {!alert.is_read && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                Baru
              </span>
            )}

            {alert.is_resolved && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Selesai
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span title={new Date(alert.created_at).toLocaleString("id-ID")}>
              {formatRelativeTime(alert.created_at)}
            </span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
          {alert.title}
        </h4>

        {/* Location & Crop Info */}
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <Link
            href={`/petak/${alert.plot_id}`}
            className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
          >
            Petak {alert.plot_name || `#${alert.plot_id}`}
          </Link>
          {alert.crop_type && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize text-[11px]">
              {alert.crop_type}
            </span>
          )}
          {alert.estate_name && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Kebun {alert.estate_name}</span>
            </>
          )}
        </div>

        {/* Anomaly Description */}
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          {alert.description}
        </p>

        {/* Agronomic Recommendation Box */}
        {alert.recommendation && (
          <div
            className={`p-3 rounded-lg border text-xs sm:text-sm ${severityCfg.recomBg} ${severityCfg.recomBorder} text-slate-800 flex items-start gap-2.5`}
          >
            <Lightbulb className={`w-4 h-4 ${severityCfg.iconColor} flex-shrink-0 mt-0.5`} />
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-900 block text-xs uppercase tracking-wider">
                Rekomendasi Agronomi:
              </span>
              <p className="text-slate-700 text-xs leading-relaxed">
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
              className="text-[11px] text-slate-500 hover:text-slate-700 font-medium inline-flex items-center gap-1 transition-colors"
            >
              <span>Parameter Indikator Pemicu</span>
              {showTriggers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showTriggers && (
              <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                {Object.entries(alert.trigger_values || {}).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between text-slate-600">
                    <span className="font-medium capitalize text-slate-500">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {typeof val === "number" ? val.toFixed(3) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <Link
            href={`/petak/${alert.plot_id}`}
            className="text-xs text-slate-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Lihat Detail Petak</span>
          </Link>

          <div className="flex items-center gap-2">
            {!alert.is_read && (
              <button
                onClick={handleMarkAsRead}
                disabled={loadingAction === "read"}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                title="Tandai notifikasi ini telah dibaca"
              >
                <Check className="w-3 h-3 text-slate-500" />
                <span>{loadingAction === "read" ? "Menyimpan..." : "Tandai Dibaca"}</span>
              </button>
            )}

            {!alert.is_resolved ? (
              <button
                onClick={handleResolve}
                disabled={loadingAction === "resolve"}
                className="text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-1"
                title="Tandai anomali ini telah ditindaklanjuti/diselesaikan"
              >
                <CheckCircle2 className="w-3 h-3 text-white" />
                <span>{loadingAction === "resolve" ? "Menyimpan..." : "Sudah Ditangani"}</span>
              </button>
            ) : (
              <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Diselesaikan
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
