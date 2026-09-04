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
    setAlerts((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    // Update counts
    if (updated.is_read) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (onAlertUpdated) {
      onAlertUpdated();
    }
  };

  // Filter client-side search query
  const filteredAlerts = alerts.filter((alert) => {
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
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-label="Tutup panel alert"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          className="w-screen max-w-md sm:max-w-lg md:max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-all duration-300 animate-in slide-in-from-right"
          role="dialog"
          aria-modal="true"
          aria-label="Panel Peringatan Lahan"
        >
          {/* Header Panel */}
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Peringatan & Anomali Lahan
                  </h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white shadow-xs">
                      {unreadCount} baru
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Monitoring risiko agronomi dan anomali spektral lahan
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={loadAlerts}
                disabled={loading}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors disabled:opacity-50"
                title="Segarkan data peringatan"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                title="Tutup panel (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="px-6 py-3 border-b border-slate-200 bg-white space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama petak, anomali, rekomendasi..."
                className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* Severity Pill Filters */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5 font-medium">
                <Filter className="w-3.5 h-3.5" />
                <span>Tingkat Keparahan (Severity):</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedSeverity("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    selectedSeverity === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSelectedSeverity("merah")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
                    selectedSeverity === "merah"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                  }`}
                >
                  <AlertOctagon className="w-3 h-3" />
                  <span>🔴 Kritis/Hama</span>
                </button>
                <button
                  onClick={() => setSelectedSeverity("oranye")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
                    selectedSeverity === "oranye"
                      ? "bg-orange-600 text-white shadow-xs"
                      : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
                  }`}
                >
                  <Droplets className="w-3 h-3" />
                  <span>🟠 Cekaman Air</span>
                </button>
                <button
                  onClick={() => setSelectedSeverity("kuning")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
                    selectedSeverity === "kuning"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>🟡 Defisiensi N</span>
                </button>
                <button
                  onClick={() => setSelectedSeverity("hijau_tua")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
                    selectedSeverity === "hijau_tua"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>🟢 Siap Panen</span>
                </button>
              </div>
            </div>

            {/* Status & Estate Dropdowns */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Status Filter */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Status Penanganan:
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="unread">Belum Dibaca</option>
                  <option value="unresolved">Belum Ditangani</option>
                  <option value="resolved">Sudah Selesai</option>
                </select>
              </div>

              {/* Estate Filter */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Lokasi Kebun (Estate):
                </label>
                <select
                  value={selectedEstateId}
                  onChange={(e) => setSelectedEstateId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-slate-50">
            {loading && alerts.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs font-medium text-slate-500">Memeriksa peringatan aktif...</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-16 text-center px-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Tidak Ada Peringatan Aktif
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Semua petak lahan dalam kondisi aman sesuai filter yang dipilih. Tidak ada anomali
                  kritis yang membutuhkan tindakan segera.
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
                    className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
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
          <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
            <span>
              Menampilkan <span className="font-semibold text-slate-700">{filteredAlerts.length}</span>{" "}
              dari {totalCount} peringatan
            </span>
            <span className="text-[11px] text-slate-400">
              Evaluasi otomatis setiap hari pk 06:30 WIB
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
