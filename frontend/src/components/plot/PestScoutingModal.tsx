"use client";

import React, { useState } from "react";
import { X, Bug, MapPin, AlertOctagon, Camera } from "lucide-react";
import { PestSeverity, CreatePestScoutingPayload } from "@/types/operations";
import { operationsApi } from "@/lib/operationsApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  plotId: number;
  plotName: string;
  defaultLat?: number;
  defaultLng?: number;
  onSuccess?: () => void;
}

export default function PestScoutingModal({
  isOpen,
  onClose,
  plotId,
  plotName,
  defaultLat = -8.0843,
  defaultLng = 111.0636,
  onSuccess,
}: Props) {
  const [observationDate, setObservationDate] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [pestType, setPestType] = useState("wereng_coklat");
  const [severity, setSeverity] = useState<PestSeverity>("ringan");
  const [latitude, setLatitude] = useState<string>(defaultLat.toFixed(6));
  const [longitude, setLongitude] = useState<string>(defaultLng.toFixed(6));
  const [actionTaken, setActionTaken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (defaultLat !== undefined) setLatitude(defaultLat.toFixed(6));
      if (defaultLng !== undefined) setLongitude(defaultLng.toFixed(6));
      setError(null);
    }
  }, [isOpen, defaultLat, defaultLng]);

  if (!isOpen) return null;

  const handleGetCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6));
          setLongitude(pos.coords.longitude.toFixed(6));
        },
        (err) => {
          console.warn("Geolocation denied or unavailable:", err);
          setError("Tidak dapat mendeteksi lokasi GPS otomatis. Menggunakan titik koordinat petak.");
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      setError("Koordinat GPS tidak valid.");
      setLoading(false);
      return;
    }

    try {
      const payload: CreatePestScoutingPayload = {
        observation_date: new Date(observationDate).toISOString(),
        pest_type: pestType,
        severity,
        latitude: lat,
        longitude: lng,
        photo_url: null,
        action_taken: actionTaken.trim() || undefined,
      };

      await operationsApi.createPestScoutingReport(plotId, payload);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Gagal mencatat pengamatan hama.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[520px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
          <div>
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-[#ef4444]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">Pengamatan Lapang Hama & OPT</h3>
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Petak: <span className="font-medium text-[var(--ink)]">{plotName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-black/[0.04] transition-colors"
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

          {/* Observation Date */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
              Waktu Pengamatan
            </label>
            <input
              type="datetime-local"
              value={observationDate}
              onChange={(e) => setObservationDate(e.target.value)}
              className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
              required
            />
          </div>

          {/* Pest Type & Severity Badges */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Jenis OPT / Hama
              </label>
              <select
                value={pestType}
                onChange={(e) => setPestType(e.target.value)}
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
              >
                <option value="wereng_coklat">Wereng Batang Coklat (Nilaparvata lugens)</option>
                <option value="penggerek_batang">Penggerek Batang / Sundep (Scirpophaga)</option>
                <option value="blas">Penyakit Blas / Hawar Daun (Pyricularia oryzae)</option>
                <option value="walang_sangit">Walang Sangit (Leptocorisa acuta)</option>
                <option value="tikus">Tikus Sawah (Rattus argentiventer)</option>
                <option value="ulat_grayak">Ulat Grayak (Spodoptera frugiperda)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                Tingkat Keparahan
              </label>
              <div className="grid grid-cols-3 gap-1 h-[34px]">
                <button
                  type="button"
                  onClick={() => setSeverity("ringan")}
                  className={`px-1.5 text-[11px] font-medium rounded-[3px] border transition-colors flex items-center justify-center gap-1 ${
                    severity === "ringan"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                      : "bg-white border-black/[0.08] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  Ringan
                </button>
                <button
                  type="button"
                  onClick={() => setSeverity("sedang")}
                  className={`px-1.5 text-[11px] font-medium rounded-[3px] border transition-colors flex items-center justify-center gap-1 ${
                    severity === "sedang"
                      ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                      : "bg-white border-black/[0.08] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  Sedang
                </button>
                <button
                  type="button"
                  onClick={() => setSeverity("berat")}
                  className={`px-1.5 text-[11px] font-medium rounded-[3px] border transition-colors flex items-center justify-center gap-1 ${
                    severity === "berat"
                      ? "bg-red-50 border-red-300 text-red-800 font-semibold"
                      : "bg-white border-black/[0.08] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  Berat
                </button>
              </div>
            </div>
          </div>

          {/* Severity Notice */}
          {severity === "berat" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-[3px] flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-800">
                <span className="font-bold">Protokol Karantina Aktif (HIGH/EMERGENCY):</span> Titik dengan keparahan berat akan otomatis membentuk zona penyangga karantina spasial <span className="font-mono font-bold">R=50 meter</span> di peta GIS melalui mesin DuckDB-WASM & Geodesic Fallback.
              </div>
            </div>
          )}

          {/* GPS Coordinates */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[var(--ink-muted)]">
                Titik Koordinat Lapang (Latitude, Longitude)
              </label>
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                className="flex items-center gap-1 text-[11px] text-[#1b4332] hover:underline"
              >
                <MapPin className="w-3 h-3" />
                Gunakan GPS Saya
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Latitude (-8.0843)"
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Longitude (111.0636)"
                className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                required
              />
            </div>
          </div>

          {/* Action Taken */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
              Tindakan Penanganan Lapang (Opsional)
            </label>
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Contoh: Sanitasi pematang sawah, pengeringan air berkala, pemasangan perangkap kuning..."
              rows={3}
              className="w-full p-2.5 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332] resize-none"
            />
          </div>

          {/* Actions */}
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
              disabled={loading}
              className="h-[34px] px-5 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium hover:bg-[#143225] disabled:opacity-40 transition-colors"
            >
              {loading ? "Menyimpan..." : "Kirim Laporan OPT"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
