"use client";

import React, { useState, useMemo } from "react";
import { X, Scale, Calculator, CheckCircle2, TrendingUp, AlertTriangle, Building2 } from "lucide-react";
import { HarvestClosingPayload, PostHarvestLog } from "@/types/operations";
import { operationsApi } from "@/lib/operationsApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  plotId: number;
  plotName: string;
  runningCost?: number;
  projectedYieldKg?: number;
  onSuccess?: (log: PostHarvestLog) => void;
}

export default function PostHarvestModal({
  isOpen,
  onClose,
  plotId,
  plotName,
  runningCost = 2407500,
  projectedYieldKg = 2405,
  onSuccess,
}: Props) {
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [grossYield, setGrossYield] = useState<string>("2550.0");
  const [moistureContent, setMoistureContent] = useState<string>("21.5");
  const [dockage, setDockage] = useState<string>("3.0");
  const [sellingPrice, setSellingPrice] = useState<string>("6800");
  const [storageLocation, setStorageLocation] = useState("Gudang Pacitan Barat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Standard 14% Moisture Formula:
  // Net = Gross * (1 - Dockage/100) * ((100 - Moisture) / (100 - 14))
  const calculation = useMemo(() => {
    const gross = parseFloat(grossYield) || 0;
    const moisture = parseFloat(moistureContent) || 14;
    const dock = parseFloat(dockage) || 0;
    const price = parseFloat(sellingPrice) || 0;

    const dockageFactor = Math.max(0, 1 - dock / 100);
    const moistureFactor = Math.max(0, (100 - moisture) / (100 - 14));
    const net = gross * dockageFactor * moistureFactor;
    const netKg = Number(net.toFixed(2));
    const reductionKg = Number((gross - netKg).toFixed(2));
    const reductionPct = gross > 0 ? Number(((reductionKg / gross) * 100).toFixed(2)) : 0;

    // Use rounded netKg for exact parity with backend revenue & profit calculations
    const totalRevenue = Math.round(netKg * price);
    const netProfit = totalRevenue - runningCost;
    const roiPct = runningCost > 0 ? (netProfit / runningCost) * 100 : 0;
    const actualHppPerKg = netKg > 0 ? runningCost / netKg : 0;
    const yieldVariancePct =
      projectedYieldKg > 0 ? ((netKg - projectedYieldKg) / projectedYieldKg) * 100 : 0;

    return {
      netKg,
      reductionKg,
      reductionPct,
      totalRevenue,
      netProfit,
      roiPct: Number(roiPct.toFixed(2)),
      actualHppPerKg: Math.round(actualHppPerKg),
      yieldVariancePct: Number(yieldVariancePct.toFixed(1)),
    };
  }, [grossYield, moistureContent, dockage, sellingPrice, runningCost, projectedYieldKg]);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const gross = parseFloat(grossYield);
    const moisture = parseFloat(moistureContent);
    const dock = parseFloat(dockage);
    const price = parseFloat(sellingPrice);

    if (isNaN(gross) || gross <= 0) {
      setError("Bobot kotor panen harus lebih besar dari 0");
      setLoading(false);
      return;
    }

    if (isNaN(moisture) || moisture < 10 || moisture > 40) {
      setError("Kadar air aktual harus berada dalam rentang SNI (10.0% s.d. 40.0%)");
      setLoading(false);
      return;
    }

    if (isNaN(dock) || dock < 0 || dock > 20) {
      setError("Potongan hampa / kotoran (dockage) harus berada dalam rentang 0.0% s.d. 20.0%");
      setLoading(false);
      return;
    }

    if (isNaN(price) || price <= 0) {
      setError("Harga jual per kg harus lebih besar dari 0");
      setLoading(false);
      return;
    }

    try {
      const payload: HarvestClosingPayload = {
        harvest_date: harvestDate,
        gross_yield_kg: gross,
        moisture_content_pct: moisture,
        dockage_pct: dock,
        selling_price_per_kg: price,
        storage_location: storageLocation.trim() || undefined,
      };

      const result = await operationsApi.closeHarvest(plotId, payload);
      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Gagal menutup musim panen.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[620px] overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#1b4332]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Tutup Musim Tanam & Rekonsiliasi Hasil Panen
              </h3>
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Standardisasi Bobot Bersih Kadar Air 14% (SNI Gabah Kering Giling) | Petak:{" "}
              <span className="font-medium text-[var(--ink)]">{plotName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-[3px] text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Form Inputs Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Tanggal Panen
              </label>
              <input
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Gudang / Titik Simpan
              </label>
              <input
                type="text"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Bobot Kotor (Gross kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={grossYield}
                onChange={(e) => setGrossYield(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Kadar Air Aktual (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="10"
                max="40"
                value={moistureContent}
                onChange={(e) => setMoistureContent(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Potongan Hampa (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="20"
                value={dockage}
                onChange={(e) => setDockage(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
              Harga Realisasi / Penjualan per Kg (IDR)
            </label>
            <input
              type="number"
              step="50"
              min="1000"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
              required
            />
          </div>

          {/* LIVE 14% MOISTURE RAFAKSI CALCULATOR CARD */}
          <div className="p-4 bg-[var(--surface)] border border-black/[0.08] rounded-[4px] space-y-3">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-2">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-[#1b4332]" />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Kalkulator Rafaksi Air & Bobot Standar 14%
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                KA Standar = 14.0%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-[var(--ink-muted)] block">Bobot Kotor</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {parseFloat(grossYield) || 0} kg
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--ink-muted)] block">Potongan Rafaksi</span>
                <span className="font-mono tabular-nums font-semibold text-red-600">
                  - {calculation.reductionKg} kg ({calculation.reductionPct}%)
                </span>
              </div>

              <div className="col-span-2">
                <span className="text-[11px] text-[var(--ink-muted)] block">
                  Bobot Bersih Standar 14%
                </span>
                <span className="text-base font-mono tabular-nums font-bold text-[#1b4332]">
                  {calculation.netKg.toLocaleString("id-ID")} kg
                </span>
                <span className="text-[10px] text-[var(--ink-muted)] ml-1 font-sans">
                  ({(calculation.netKg / 1000).toFixed(2)} Ton)
                </span>
              </div>
            </div>

            {/* Financial Reconciliation Summary */}
            <div className="pt-2 border-t border-black/[0.06] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-[var(--ink-muted)] block">Total Pendapatan</span>
                <span className="font-mono tabular-nums font-bold text-emerald-800">
                  Rp {calculation.totalRevenue.toLocaleString("id-ID")}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--ink-muted)] block">Total Biaya Berjalan</span>
                <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
                  Rp {runningCost.toLocaleString("id-ID")}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--ink-muted)] block">Laba Bersih & ROI</span>
                <span className="font-mono tabular-nums font-bold text-[#1b4332]">
                  Rp {calculation.netProfit.toLocaleString("id-ID")}
                </span>
                <span className="text-[10px] text-emerald-700 ml-1 font-mono font-bold">
                  ({calculation.roiPct > 0 ? `+${calculation.roiPct}%` : `${calculation.roiPct}%`})
                </span>
              </div>
            </div>

            {/* Target vs Actual Comparison */}
            <div className="text-[11px] text-[var(--ink-muted)] bg-white/70 p-2 rounded-[2px] border border-black/[0.04]">
              Estimasi GDD Awal:{" "}
              <span className="font-mono font-medium text-[var(--ink)]">{projectedYieldKg} kg</span> | Variansi
              Realisasi:{" "}
              <span
                className={`font-mono font-semibold ${
                  calculation.yieldVariancePct >= 0 ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {calculation.yieldVariancePct >= 0
                  ? `+${calculation.yieldVariancePct}%`
                  : `${calculation.yieldVariancePct}%`}
              </span>{" "}
              | HPP Riil:{" "}
              <span className="font-mono font-medium text-[var(--ink)]">
                Rp {calculation.actualHppPerKg.toLocaleString("id-ID")} / kg
              </span>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] px-4 rounded-[3px] border border-black/[0.08] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-[34px] px-5 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium hover:bg-[#143225] disabled:opacity-40"
            >
              {loading ? "Menyimpan & Menutup Musim..." : "Tutup Musim Tanam"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
