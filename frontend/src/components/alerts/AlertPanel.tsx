"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  Bell,
  Filter,
  RefreshCw,
  CheckCheck,
  Building2,
  AlertOctagon,
  Droplets,
  AlertTriangle,
  Sparkles,
  Layers,
  Search,
} from "lucide-react";
import { AlertItem, Estate } from "@/types";
import { api } from "@/lib/api";
import AlertCard from "./AlertCard";
import { getAlertsList } from "./alertUtils";

interface AlertPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertUpdated?: () => void;
}

export default function AlertPanel({
  isOpen,
  onClose,
  onAlertUpdated,
}: AlertPanelProps) {
  // Data states
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Filter states
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all"); // all, unread, unresolved, resolved
  const [selectedEstateId, setSelectedEstateId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch estates once for filter dropdown
  useEffect(() => {
    if (isOpen && estates.length === 0) {
      api
        .get<Estate[]>("/estates")
        .then((res) => setEstates(res.data))
        .catch((err) => console.error("Gagal memuat daftar kebun:", err));
    }
  }, [isOpen, estates.length]);

  // Fetch alerts with current filters
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page: 1,
        page_size: 50,
      };

      if (selectedSeverity !== "all") {
        params.severity = selectedSeverity;
      }

      if (selectedEstateId !== "all") {
        params.estate_id = Number(selectedEstateId);
      }

      if (selectedStatus === "unread") {
        params.is_read = false;
      } else if (selectedStatus === "unresolved") {
        params.is_resolved = false;
      } else if (selectedStatus === "resolved") {
        params.is_resolved = true;
      }

      const res = await getAlertsList(params);
      setAlerts(res.items);
      setTotalCount(res.total);
      setUnreadCount(res.unread_count);
    } catch (err) {
      console.error("Gagal memuat daftar peringatan:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSeverity, selectedStatus, selectedEstateId]);

  useEffect(() => {
    if (isOpen) {
      loadAlerts();
    }
  }, [isOpen, loadAlerts]);

  // Handle single alert updated
  const handleAlertUpdate = (updated: AlertItem) => {
    const prevAlert = alerts.find((a) => a.id === updated.id);
    const wasUnread = prevAlert ? !prevAlert.is_read : true;

    setAlerts((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    // Update unread count
    if (wasUnread && (updated.is_read || updated.is_resolved)) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (onAlertUpdated) {
      onAlertUpdated();
    }
  };

  // Filter client-side search query and severity
  const filteredAlerts = alerts.filter((alert) => {
    // Severity chip filter
    if (selectedSeverity !== "all") {
      const s = (alert.severity || "").toLowerCase();
      if (selectedSeverity === "CRITICAL") {
        if (!["merah", "critical", "kritis", "berat"].includes(s)) return false;
      } else if (selectedSeverity === "WARNING") {
        if (!["oranye", "kuning", "warning", "waspada", "sedang"].includes(s)) return false;
      } else if (selectedSeverity === "INFO") {
        if (!["hijau_tua", "info", "informasi", "biru", "ringan", "panen"].includes(s)) return false;
      } else if (s !== selectedSeverity.toLowerCase()) {
        return false;
      }
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      alert.title.toLowerCase().includes(q) ||
      alert.description.toLowerCase().includes(q) ||
      (alert.plot_name && alert.plot_name.toLowerCase().includes(q)) ||
      (alert.estate_name && alert.estate_name.toLowerCase().includes(q)) ||
      (alert.recommendation && alert.recommendation.toLowerCase().includes(q))
    );
  });

  // Keyboard shortcut: ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-label="Tutup panel alert"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          className="w-screen max-w-md sm:max-w-lg md:max-w-xl bg-[var(--canvas)] border-l border-black/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.14)] flex flex-col transform transition-all duration-300 animate-in slide-in-from-right"
          role="dialog"
          aria-modal="true"
          aria-label="Panel Peringatan Lahan"
        >
          {/* Header Panel */}
          <div className="px-[21px] py-[13px] border-b border-black/[0.08] bg-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-[3px] bg-amber-100 text-amber-800 shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[13.5px] font-semibold text-[var(--ink)] tracking-tight">
                    Peringatan & Anomali Lahan
                  </h2>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-mono tabular-nums font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {unreadCount} baru
                    </span>
                  )}
                </div>
                <p className="label-telemetry mt-0.5">
                  Monitoring risiko agronomi & anomali spektral
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={loadAlerts}
                disabled={loading}
                className="p-1.5 rounded-[3px] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                title="Segarkan data peringatan"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-[3px] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                title="Tutup panel (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="px-[21px] py-[13px] border-b border-black/[0.08] bg-white space-y-2.5 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--ink-3)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari petak, anomali, rekomendasi..."
                className="w-full pl-8 pr-3 h-[34px] rounded-[3px] border border-black/[0.08] bg-[var(--field)] text-[12.5px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Severity Pill Filters */}
            <div>
              <div className="flex items-center gap-1.5 label-telemetry mb-1">
                <Filter className="w-3 h-3" />
                <span>Tingkat Keparahan (Severity):</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedSeverity("all")}
                  className={`px-2.5 py-1 rounded-[3px] text-[11.5px] font-mono transition-colors border ${
                    selectedSeverity === "all"
                      ? "bg-[var(--ink)] text-white border-[var(--ink)] font-semibold"
                      : "bg-white text-[var(--ink-2)] border-black/[0.08] hover:bg-black/[0.03]"
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSelectedSeverity("CRITICAL")}
                  className={`px-2.5 py-1 rounded-[3px] text-[11.5px] font-mono inline-flex items-center gap-1 border transition-colors ${
                    selectedSeverity === "CRITICAL"
                      ? "bg-rose-600 text-white border-rose-600 font-semibold"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  }`}
                  title="Tingkat Kritis (Hama, Sundep, Rebah)"
                >
                  <AlertOctagon className="w-3 h-3" />
                  <span>CRITICAL</span>
                </button>
                <button
                  onClick={() => setSelectedSeverity("WARNING")}
                  className={`px-2.5 py-1 rounded-[3px] text-[11.5px] font-mono inline-flex items-center gap-1 border transition-colors ${
                    selectedSeverity === "WARNING"
                      ? "bg-amber-600 text-white border-amber-600 font-semibold"
                      : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                  }`}
                  title="Tingkat Waspada (Cekaman Air, Defisiensi N)"
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>WARNING</span>
                </button>
                <button
                  onClick={() => setSelectedSeverity("INFO")}
                  className={`px-2.5 py-1 rounded-[3px] text-[11.5px] font-mono inline-flex items-center gap-1 border transition-colors ${
                    selectedSeverity === "INFO"
                      ? "bg-emerald-700 text-white border-emerald-700 font-semibold"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  }`}
                  title="Informasi Agronomi & Kesiapan Panen"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>INFO</span>
                </button>
              </div>
            </div>

            {/* Status & Estate Dropdowns */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div>
                <label className="block label-telemetry mb-1">
                  Status Penanganan:
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full h-[34px] px-2 rounded-[3px] border border-black/[0.08] text-[12px] text-[var(--ink)] bg-white focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="all">Semua Status</option>
                  <option value="unread">Belum Dibaca</option>
                  <option value="unresolved">Belum Ditangani</option>
                  <option value="resolved">Sudah Selesai</option>
                </select>
              </div>

              <div>
                <label className="block label-telemetry mb-1">
                  Lokasi Kebun (Estate):
                </label>
                <select
                  value={selectedEstateId}
                  onChange={(e) => setSelectedEstateId(e.target.value)}
                  className="w-full h-[34px] px-2 rounded-[3px] border border-black/[0.08] text-[12px] text-[var(--ink)] bg-white focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="all">Semua Kebun</option>
                  {estates.map((estate) => (
                    <option key={estate.id} value={estate.id}>
                      {estate.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Alert Cards List */}
          <div className="flex-1 overflow-y-auto p-[21px] space-y-3 bg-[var(--canvas)]">
            {loading && alerts.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-[var(--ink-3)]">
                <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-[12px]">Memeriksa peringatan aktif...</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-16 text-center px-4 bg-white rounded-[3px] border border-black/[0.08]">
                <div className="w-10 h-10 rounded-[3px] bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <h3 className="text-[13.5px] font-semibold text-[var(--ink)] mb-1">
                  Tidak Ada Peringatan Aktif
                </h3>
                <p className="text-[12px] text-[var(--ink-3)] max-w-xs mx-auto leading-relaxed">
                  Semua petak lahan dalam kondisi aman sesuai filter yang dipilih. Tidak ada anomali kritis yang membutuhkan tindakan segera.
                </p>
                {(selectedSeverity !== "all" ||
                  selectedStatus !== "all" ||
                  selectedEstateId !== "all" ||
                  searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedSeverity("all");
                      setSelectedStatus("all");
                      setSelectedEstateId("all");
                      setSearchQuery("");
                    }}
                    className="mt-3.5 px-3 py-1.5 rounded-[3px] text-[12px] font-medium text-[var(--accent)] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >
                    Reset Semua Filter
                  </button>
                )}
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onUpdate={handleAlertUpdate}
                />
              ))
            )}
          </div>

          {/* Footer Info */}
          <div className="px-[21px] py-[13px] border-t border-black/[0.08] bg-white flex items-center justify-between text-[11.5px] text-[var(--ink-3)] shrink-0">
            <span className="font-mono tabular-nums">
              Menampilkan <span className="font-semibold text-[var(--ink)]">{filteredAlerts.length}</span> dari {totalCount} peringatan
            </span>
            <span className="text-[11px] text-[var(--ink-3)]">
              Evaluasi harian 06:30 WIB
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
