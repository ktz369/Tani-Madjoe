"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";
import { CropVariety, PlantingSeason } from "@/types";

export interface SeasonActionModalsProps {
  plotId: number;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  showHarvestModal: boolean;
  onCloseHarvestModal: () => void;
  showFailModal: boolean;
  onCloseFailModal: () => void;
  activeSeason?: PlantingSeason;
  selectedSeason: PlantingSeason | null;
  varieties: CropVariety[];
  onSuccess: () => void;
  showToast: (type: "success" | "error", message: string) => void;
}

export default function SeasonActionModals({
  plotId,
  showCreateModal,
  onCloseCreateModal,
  showHarvestModal,
  onCloseHarvestModal,
  showFailModal,
  onCloseFailModal,
  activeSeason,
  selectedSeason,
  varieties,
  onSuccess,
  showToast,
}: SeasonActionModalsProps) {
  const [submitting, setSubmitting] = useState(false);

  // Form states - Create Season
  const [newVarietyId, setNewVarietyId] = useState<number | "">("");
  const [newPlantingDate, setNewPlantingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newYieldEstimate, setNewYieldEstimate] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");

  // Form states - Harvest Season
  const [harvestDate, setHarvestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [harvestYield, setHarvestYield] = useState<string>("");
  const [harvestNotes, setHarvestNotes] = useState<string>("");

  // Form states - Fail Season
  const [failedHarvestDate, setFailedHarvestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [failedNotes, setFailedNotes] = useState<string>("");

  // Reset harvest modal state when selectedSeason changes
  useEffect(() => {
    if (selectedSeason) {
      setHarvestDate(new Date().toISOString().split("T")[0]);
      setHarvestYield(
        selectedSeason.yield_estimate_ton_per_ha !== null &&
          selectedSeason.yield_estimate_ton_per_ha !== undefined
          ? selectedSeason.yield_estimate_ton_per_ha.toString()
          : ""
      );
      setHarvestNotes(selectedSeason.notes || "");
      setFailedHarvestDate(new Date().toISOString().split("T")[0]);
      setFailedNotes("");
    }
  }, [selectedSeason]);

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarietyId || !newPlantingDate) {
      showToast("error", "Silakan lengkapi data varietas dan tanggal tanam.");
      return;
    }
    try {
      setSubmitting(true);
      await api.post(`/plots/${plotId}/seasons`, {
        variety_id: Number(newVarietyId),
        planting_date: newPlantingDate,
        yield_estimate_ton_per_ha: newYieldEstimate ? parseFloat(newYieldEstimate) : null,
        notes: newNotes || null,
      });
      showToast("success", "Musim tanam baru berhasil dimulai!");
      onCloseCreateModal();
      setNewNotes("");
      setNewYieldEstimate("");
      onSuccess();
    } catch (err: any) {
      showToast("error", err.response?.data?.detail || "Gagal mencatat musim tanam baru.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleHarvestSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeason) return;
    try {
      setSubmitting(true);
      await api.put(`/seasons/${selectedSeason.id}`, {
        status: "harvested",
        harvest_date: harvestDate,
        yield_estimate_ton_per_ha: harvestYield ? parseFloat(harvestYield) : null,
        notes: harvestNotes || selectedSeason.notes,
      });
      showToast("success", "Musim tanam berhasil diselesaikan dan dicatat sebagai panen!");
      onCloseHarvestModal();
      onSuccess();
    } catch (err: any) {
      showToast("error", err.response?.data?.detail || "Gagal memperbarui status panen.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFailSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeason) return;
    try {
      setSubmitting(true);
      await api.put(`/seasons/${selectedSeason.id}`, {
        status: "failed",
        harvest_date: failedHarvestDate || null,
        notes: failedNotes
          ? `${selectedSeason.notes ? selectedSeason.notes + " | " : ""}[Gagal]: ${failedNotes}`
          : selectedSeason.notes,
      });
      showToast("success", "Musim tanam ditandai sebagai gagal.");
      onCloseFailModal();
      onSuccess();
    } catch (err: any) {
      showToast("error", err.response?.data?.detail || "Gagal memperbarui musim tanam.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* MODAL: Mulai Musim Tanam Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3px] border border-black/[0.12] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-[21px] py-[17px] border-b border-black/[0.08] flex items-center justify-between">
              <div>
                <span className="label-telemetry block">INPUT SIKLUS BARU</span>
                <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                  Mulai Musim Tanam Petak
                </h3>
              </div>
              <button
                onClick={onCloseCreateModal}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] p-1 rounded-[2px] hover:bg-black/[0.04] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSeason} className="p-[21px] space-y-4">
              {activeSeason && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-[2px] flex items-start gap-2.5 text-xs text-amber-900 font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Peringatan: Ada Siklus Aktif!</span>
                    Petak ini telah memiliki musim tanam aktif ({activeSeason.planting_date}). Selesaikan siklus sebelumnya terlebih dahulu.
                  </div>
                </div>
              )}

              <div>
                <label className="label-telemetry block mb-1">
                  VARIETAS BENIH <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newVarietyId}
                  onChange={(e) => setNewVarietyId(e.target.value ? Number(e.target.value) : "")}
                  required
                  disabled={!!activeSeason}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-slate-100"
                >
                  <option value="">-- Pilih Varietas Benih --</option>
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.crop_type.toUpperCase()}] {v.name} ({v.cycle_days} hari)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  TANGGAL TANAM <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={newPlantingDate}
                  onChange={(e) => setNewPlantingDate(e.target.value)}
                  required
                  disabled={!!activeSeason}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  ESTIMASI HASIL PANEN (TON/HA)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Contoh: 6.5"
                  value={newYieldEstimate}
                  onChange={(e) => setNewYieldEstimate(e.target.value)}
                  disabled={!!activeSeason}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  CATATAN TAMBAHAN
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Pemupukan dasar urea & SP-36 telah diaplikasikan."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  disabled={!!activeSeason}
                  className="w-full p-2.5 rounded-[3px] border border-black/[0.12] bg-white text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={onCloseCreateModal}
                  className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-transparent text-[var(--ink-2)] hover:bg-black/[0.04] text-[13px] font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!activeSeason}
                  className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
                >
                  {submitting ? "Menyimpan..." : "Simpan Musim Tanam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Selesaikan / Panen */}
      {showHarvestModal && selectedSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3px] border border-black/[0.12] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-[21px] py-[17px] border-b border-black/[0.08] flex items-center justify-between">
              <div>
                <span className="label-telemetry block">REALISASI PANEN</span>
                <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                  Selesaikan Siklus & Catat Panen
                </h3>
              </div>
              <button
                onClick={onCloseHarvestModal}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] p-1 rounded-[2px] hover:bg-black/[0.04] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleHarvestSeason} className="p-[21px] space-y-4">
              <div>
                <label className="label-telemetry block mb-1">
                  TANGGAL PANEN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={harvestDate}
                  onChange={(e) => setHarvestDate(e.target.value)}
                  required
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  REALISASI HASIL PANEN (TON/HA)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Contoh: 6.8"
                  value={harvestYield}
                  onChange={(e) => setHarvestYield(e.target.value)}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                />
                <span className="text-[10px] font-mono text-[var(--ink-3)] mt-1 block">
                  Estimasi awal: {selectedSeason.yield_estimate_ton_per_ha ?? "-"} ton/ha
                </span>
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  CATATAN PANEN
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Kualitas gabah bersih, kadar air 14%."
                  value={harvestNotes}
                  onChange={(e) => setHarvestNotes(e.target.value)}
                  className="w-full p-2.5 rounded-[3px] border border-black/[0.12] bg-white text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={onCloseHarvestModal}
                  className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-transparent text-[var(--ink-2)] hover:bg-black/[0.04] text-[13px] font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
                >
                  {submitting ? "Menyimpan..." : "Konfirmasi Panen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tandai Gagal */}
      {showFailModal && selectedSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3px] border border-black/[0.12] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-[21px] py-[17px] border-b border-black/[0.08] flex items-center justify-between">
              <div>
                <span className="label-telemetry text-rose-700 block">TERMINASI SIKLUS</span>
                <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                  Tandai Musim Tanam Gagal
                </h3>
              </div>
              <button
                onClick={onCloseFailModal}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] p-1 rounded-[2px] hover:bg-black/[0.04] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFailSeason} className="p-[21px] space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-[2px] text-xs text-rose-800 font-mono">
                Tindakan ini akan menghentikan musim tanam aktif dan mencatat kegagalan panen pada petak ini.
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  TANGGAL BERAKHIR
                </label>
                <input
                  type="date"
                  value={failedHarvestDate}
                  onChange={(e) => setFailedHarvestDate(e.target.value)}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.12] bg-white text-[13px] font-mono text-[var(--ink)] focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="label-telemetry block mb-1">
                  ALASAN KEGAGALAN <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Jelaskan penyebab (misal: serangan hama wereng coklat masif atau genangan banjir ekstrem)."
                  value={failedNotes}
                  onChange={(e) => setFailedNotes(e.target.value)}
                  className="w-full p-2.5 rounded-[3px] border border-black/[0.12] bg-white text-[13px] text-[var(--ink)] focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={onCloseFailModal}
                  className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-transparent text-[var(--ink-2)] hover:bg-black/[0.04] text-[13px] font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-[34px] px-[21px] rounded-[3px] bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-1.5"
                >
                  {submitting ? "Memproses..." : "Tandai Gagal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
