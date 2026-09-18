"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, PencilLine, Sprout, MapPin, Info } from "lucide-react";
import { api } from "@/lib/api";
import { CropVariety, Division, Plot } from "@/types";

export interface EditPlotModalProps {
  isOpen: boolean;
  plot: Plot;
  varieties: CropVariety[];
  onClose: () => void;
  onSuccess: (updated: Plot) => void;
}

/** Normalize any API error payload into a plain string (never render an object in React). */
function extractError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first?.msg) return `Data tidak valid: ${first.msg}`;
  }
  if (typeof err?.message === "string" && err.message) return err.message;
  return fallback;
}

export default function EditPlotModal({
  isOpen,
  plot,
  varieties,
  onClose,
  onSuccess,
}: EditPlotModalProps) {
  const currentPlantingDate = plot.planting_date ? plot.planting_date.slice(0, 10) : "";

  const [name, setName] = useState(plot.name);
  const [cropType, setCropType] = useState<"padi" | "jagung">(plot.crop_type);
  const [varietyId, setVarietyId] = useState<number | "">(plot.variety_id ?? "");
  const [plantingDate, setPlantingDate] = useState(currentPlantingDate);
  const [divisionId, setDivisionId] = useState<number | "">(plot.division_id);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the modal is (re)opened for a plot.
  useEffect(() => {
    if (!isOpen) return;
    setName(plot.name);
    setCropType(plot.crop_type);
    setVarietyId(plot.variety_id ?? "");
    setPlantingDate(plot.planting_date ? plot.planting_date.slice(0, 10) : "");
    setDivisionId(plot.division_id);
    setError(null);
    api
      .get<Division[]>("/divisions")
      .then((res) => setDivisions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDivisions([]));
  }, [isOpen, plot]);

  const cropVarieties = useMemo(
    () => varieties.filter((v) => v.crop_type === cropType),
    [varieties, cropType]
  );
  const selectedVariety = cropVarieties.find((v) => v.id === varietyId) || null;

  if (!isOpen) return null;

  const handleCropTypeChange = (next: "padi" | "jagung") => {
    setCropType(next);
    // Keep the selection only if the variety belongs to the newly selected commodity.
    const stillValid = varieties.some((v) => v.id === varietyId && v.crop_type === next);
    if (!stillValid) setVarietyId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Nama petak wajib diisi.");
      return;
    }

    const payload: Record<string, unknown> = {};
    if (trimmedName !== plot.name) payload.name = trimmedName;
    if (cropType !== plot.crop_type) payload.crop_type = cropType;
    if (varietyId !== "" && Number(varietyId) !== plot.variety_id) {
      payload.variety_id = Number(varietyId);
    }
    if (plantingDate && plantingDate !== currentPlantingDate) {
      payload.planting_date = plantingDate;
    }
    if (divisionId !== "" && Number(divisionId) !== plot.division_id) {
      payload.division_id = Number(divisionId);
    }

    if (Object.keys(payload).length === 0) {
      setError("Belum ada perubahan yang perlu disimpan.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.put<Plot>(`/plots/${plot.id}`, payload);
      onSuccess(res.data);
    } catch (err: any) {
      setError(extractError(err, "Gagal menyimpan perubahan petak."));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[560px] overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
          <div>
            <div className="flex items-center gap-2">
              <PencilLine className="w-4 h-4 text-[#1b4332]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">Edit Data Petak</h3>
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Petak: <span className="font-medium text-[var(--ink)]">{plot.name}</span> |{" "}
              <span className="font-mono tabular-nums">{plot.area_hectares?.toFixed(2) ?? "0.00"} ha</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-black/[0.04] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-[3px] text-xs text-red-800">
                {error}
              </div>
            )}

            {/* Nama petak */}
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Nama Petak
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                className={inputClass}
                placeholder="Contoh: Bengkok 1"
              />
            </div>

            {/* Jenis tanaman */}
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Jenis Tanaman
              </label>
              <div className="grid grid-cols-2 gap-1 h-[34px]">
                {(["padi", "jagung"] as const).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => handleCropTypeChange(ct)}
                    className={`px-1.5 text-[11px] font-medium rounded-[3px] border transition-colors flex items-center justify-center gap-1.5 ${
                      cropType === ct
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "bg-white border-black/[0.08] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Sprout className="w-3.5 h-3.5" />
                    {ct === "padi" ? "Padi" : "Jagung"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Varietas */}
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                  Varietas
                </label>
                <select
                  value={varietyId}
                  onChange={(e) => setVarietyId(e.target.value === "" ? "" : Number(e.target.value))}
                  className={inputClass}
                >
                  <option value="">— Belum dipilih —</option>
                  {cropVarieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.cycle_days} HST)
                    </option>
                  ))}
                </select>
                {cropVarieties.length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    Belum ada varietas {cropType} terdaftar — tambahkan di menu Admin → Varietas.
                  </p>
                )}
              </div>

              {/* Tanggal tanam */}
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                  Tanggal Tanam
                </label>
                <input
                  type="date"
                  value={plantingDate}
                  onChange={(e) => setPlantingDate(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-[10px] text-[var(--ink-muted)]">
                  {currentPlantingDate
                    ? "Ubah tanggal → umur (HST) & fase fenologi dihitung ulang."
                    : "Isi tanggal tanam untuk mengaktifkan HST, GDD, dan fase fenologi."}
                </p>
              </div>
            </div>

            {/* Divisi */}
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Divisi / Afdeling
                </span>
              </label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value === "" ? "" : Number(e.target.value))}
                className={inputClass}
              >
                <option value="">— Tidak diubah —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.estate_name ? ` — ${d.estate_name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Info */}
            <div className="p-3 bg-emerald-50/50 border border-emerald-200/70 rounded-[3px] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-[11px] text-emerald-900 leading-relaxed">
                Mengganti <span className="font-semibold">varietas</span> atau{" "}
                <span className="font-semibold">tanggal tanam</span> akan menghitung ulang fase
                fenologi, akumulasi GDD, dan rekomendasi pupuk (VRN). Perubahan geometri poligon
                belum tersedia di form ini.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-black/[0.08] bg-[var(--surface)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-[34px] px-3.5 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[12px] font-medium transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-[34px] px-3.5 rounded-[3px] bg-[#1b4332] hover:bg-[#143225] text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
