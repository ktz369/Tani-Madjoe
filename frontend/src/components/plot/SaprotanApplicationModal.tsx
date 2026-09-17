"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, ShieldAlert, CheckCircle2, AlertTriangle, PackageCheck } from "lucide-react";
import { SaprotanItem, ApplySaprotanPayload } from "@/types/operations";
import { operationsApi } from "@/lib/operationsApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  plotId: number;
  plotName: string;
  targetHarvestDate?: string;
  onSuccess?: () => void;
}

export default function SaprotanApplicationModal({
  isOpen,
  onClose,
  plotId,
  plotName,
  targetHarvestDate,
  onSuccess,
}: Props) {
  const [catalog, setCatalog] = useState<SaprotanItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [applicationDate, setApplicationDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [quantity, setQuantity] = useState<string>("1.0");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fallback target harvest date: 13 days from today if not provided
  const harvestDateStr = useMemo(() => {
    if (targetHarvestDate) return targetHarvestDate;
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return d.toISOString().split("T")[0];
  }, [targetHarvestDate]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCatalogLoading(true);
    operationsApi
      .getSaprotanCatalog()
      .then((items) => {
        setCatalog(items);
        if (items.length > 0 && selectedItemId === "") {
          setSelectedItemId(items[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load saprotan catalog:", err);
      })
      .finally(() => setCatalogLoading(false));
  }, [isOpen]);

  const selectedItem = useMemo(() => {
    return catalog.find((it) => it.id === Number(selectedItemId)) || null;
  }, [catalog, selectedItemId]);

  // PHI Guardrail Calculations
  const guardrail = useMemo(() => {
    if (!selectedItem) {
      return { diffDays: 0, phi: 0, isViolated: false, message: "" };
    }
    const appDate = new Date(applicationDate);
    const harvDate = new Date(harvestDateStr);
    const diffTime = harvDate.getTime() - appDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const phi = selectedItem.phi_days || 0;
    const isPastHarvest = diffDays < 0;
    const isViolated = isPastHarvest || (phi > 0 && diffDays < phi);

    let message = "";
    if (isPastHarvest) {
      message = `Aplikasi tidak valid: Tanggal aplikasi melewati estimasi tanggal panen (${harvestDateStr}).`;
    } else if (phi > 0 && diffDays < phi) {
      message = `Aplikasi dilarang: Bahan aktif memiliki batas waktu tunggu ${phi} hari sebelum panen. Estimasi panen fisiologis tersisa ${diffDays} hari. Berisiko residu kimia melebihi Batas Maksimum Residu (BMR).`;
    }

    return { diffDays, phi, isViolated, message };
  }, [selectedItem, applicationDate, harvestDateStr]);

  const estimatedCost = useMemo(() => {
    if (!selectedItem) return 0;
    const qty = parseFloat(quantity) || 0;
    return qty * selectedItem.unit_cost;
  }, [selectedItem, quantity]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || guardrail.isViolated) return;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Jumlah aplikasi harus lebih besar dari 0");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: ApplySaprotanPayload = {
        item_id: selectedItem.id,
        application_date: applicationDate,
        target_harvest_date: harvestDateStr,
        quantity_used: qty,
        total_cost: estimatedCost,
      };

      await operationsApi.applySaprotan(plotId, payload);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Gagal mencatat aplikasi saprotan.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[560px] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#1b4332]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">Aplikasi Saprotan & Pupuk</h3>
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Petak: <span className="font-medium text-[var(--ink)]">{plotName}</span> | Target Panen GDD:{" "}
              <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{harvestDateStr}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-black/[0.04] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-[3px] text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Item Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
              Pilih Item Saprotan / Pupuk / Obat
            </label>
            {catalogLoading ? (
              <div className="text-xs text-[var(--ink-muted)] py-2">Memuat katalog saprotan...</div>
            ) : (
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(Number(e.target.value))}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              >
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.category}) — Stok: {item.stock_qty} {item.unit} — PHI: {item.phi_days} hari
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Item Details Info Card */}
          {selectedItem && (
            <div className="p-3.5 bg-neutral-50 rounded-[3px] border border-black/[0.06] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Bahan Aktif:</span>
                <span className="font-medium text-[var(--ink)] text-right">{selectedItem.active_ingredient || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Pre-Harvest Interval (PHI):</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {selectedItem.phi_days > 0 ? `${selectedItem.phi_days} Hari Tunggu` : "0 Hari (Aman / Non-Kimiawi)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Harga Satuan:</span>
                <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
                  Rp {selectedItem.unit_cost.toLocaleString("id-ID")} / {selectedItem.unit}
                </span>
              </div>
            </div>
          )}

          {/* Inputs Row: Application Date & Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Tanggal Aplikasi</label>
              <input
                type="date"
                value={applicationDate}
                onChange={(e) => setApplicationDate(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Jumlah Digunakan ({selectedItem?.unit || "satuan"})
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
          </div>

          {/* Estimated Cost Preview */}
          <div className="flex items-center justify-between p-3 bg-[var(--surface)] border border-black/[0.06] rounded-[3px]">
            <span className="text-xs text-[var(--ink-muted)] font-medium">Estimasi Biaya Saprotan:</span>
            <span className="text-sm font-mono tabular-nums font-bold text-[#1b4332]">
              Rp {estimatedCost.toLocaleString("id-ID")}
            </span>
          </div>

          {/* PHI GUARDRAIL ALERT BANNER */}
          {guardrail.isViolated ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-[3px] flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-800">Pelanggaran Batas Residu Kimiawi (PHI Lock)</h4>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">{guardrail.message}</p>
                <div className="mt-2 text-[11px] font-mono text-red-800 bg-red-100/60 px-2 py-1 rounded-[2px] inline-block">
                  Sisa Hari Menuju Panen: {guardrail.diffDays} hari &lt; Waktu Tunggu PHI: {guardrail.phi} hari
                </div>
              </div>
            </div>
          ) : selectedItem && selectedItem.phi_days > 0 ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[3px] flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800">
                Aman diterapkan. Sisa hari menuju panen ({guardrail.diffDays} hari) melampaui batas aman PHI ({guardrail.phi} hari).
              </p>
            </div>
          ) : null}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] px-4 rounded-[3px] border border-black/[0.08] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-black/[0.03] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || guardrail.isViolated || catalogLoading}
              className="h-[34px] px-5 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium hover:bg-[#143225] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Menyimpan..." : "Catat Pemakaian"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
