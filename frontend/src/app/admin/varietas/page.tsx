"use client";

import React, { useEffect, useState } from "react";
import AuthGuard from "@/components/layout/AuthGuard";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import {
  CropVariety,
  CropVarietyCreateRequest,
  CropVarietyUpdateRequest,
  PhenologyPhase,
  PhenologyPhaseCreateRequest,
} from "@/types";
import {
  Sprout,
  Plus,
  Search,
  Filter,
  Layers,
  Calendar,
  Thermometer,
  Droplets,
  TrendingUp,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export default function VarietasPage() {
  const [varieties, setVarieties] = useState<CropVariety[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [cropTypeFilter, setCropTypeFilter] = useState<string>("semua");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected variety for phase inspector
  const [selectedVariety, setSelectedVariety] = useState<CropVariety | null>(null);

  // Modals
  const [showAddVarietyModal, setShowAddVarietyModal] = useState<boolean>(false);
  const [showEditVarietyModal, setShowEditVarietyModal] = useState<boolean>(false);
  const [showAddPhaseModal, setShowAddPhaseModal] = useState<boolean>(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [varietyToDelete, setVarietyToDelete] = useState<CropVariety | null>(null);

  // Form states
  const [varietyForm, setVarietyForm] = useState<CropVarietyCreateRequest>({
    crop_type: "padi",
    name: "",
    cycle_days: 120,
    t_base: 10.0,
  });

  const [phaseForm, setPhaseForm] = useState<PhenologyPhaseCreateRequest>({
    phase_code: "",
    phase_name: "",
    hst_start: 0,
    hst_end: 10,
    ndvi_expected_min: 0.1,
    ndvi_expected_max: 0.3,
    ndre_threshold: 0.15,
    kc_value: 1.05,
    gdd_target: 150,
  });

  const [submitting, setSubmitting] = useState<boolean>(false);

  // Load varieties
  const fetchVarieties = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<CropVariety[]>("/varieties");
      setVarieties(res.data);
      if (selectedVariety) {
        const updated = res.data.find((v) => v.id === selectedVariety.id);
        if (updated) setSelectedVariety(updated);
      } else if (res.data.length > 0) {
        setSelectedVariety(res.data[0]);
      }
    } catch (err: any) {
      console.error("Gagal memuat varietas:", err);
      setError(err.response?.data?.detail || "Gagal memuat data varietas tanaman.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVarieties();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Filtered varieties
  const filteredVarieties = varieties.filter((v) => {
    const matchesType =
      cropTypeFilter === "semua" ? true : v.crop_type.toLowerCase() === cropTypeFilter.toLowerCase();
    const matchesSearch =
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.crop_type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Total statistics
  const totalPadi = varieties.filter((v) => v.crop_type === "padi").length;
  const totalJagung = varieties.filter((v) => v.crop_type === "jagung").length;
  const totalPhases = varieties.reduce((acc, v) => acc + (v.phases?.length || 0), 0);

  // Handlers for Variety CRUD
  const handleCreateVariety = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      const res = await api.post<CropVariety>("/varieties", varietyForm);
      showNotification(`Varietas "${res.data.name}" berhasil ditambahkan.`);
      setShowAddVarietyModal(false);
      setVarietyForm({ crop_type: "padi", name: "", cycle_days: 120, t_base: 10.0 });
      await fetchVarieties();
      setSelectedVariety(res.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Gagal menambahkan varietas baru.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateVariety = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariety) return;
    try {
      setSubmitting(true);
      setError(null);
      const payload: CropVarietyUpdateRequest = {
        name: varietyForm.name,
        crop_type: varietyForm.crop_type,
        cycle_days: Number(varietyForm.cycle_days),
        t_base: Number(varietyForm.t_base),
      };
      const res = await api.put<CropVariety>(`/varieties/${selectedVariety.id}`, payload);
      showNotification(`Varietas "${res.data.name}" berhasil diperbarui.`);
      setShowEditVarietyModal(false);
      await fetchVarieties();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Gagal memperbarui varietas.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVariety = async () => {
    if (!varietyToDelete) return;
    try {
      setSubmitting(true);
      setError(null);
      await api.delete(`/varieties/${varietyToDelete.id}`);
      showNotification(`Varietas "${varietyToDelete.name}" berhasil dihapus.`);
      setShowDeleteConfirmModal(false);
      setVarietyToDelete(null);
      if (selectedVariety?.id === varietyToDelete.id) {
        setSelectedVariety(null);
      }
      await fetchVarieties();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Gagal menghapus varietas.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handlers for Phase Creation
  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariety) return;
    try {
      setSubmitting(true);
      setError(null);
      await api.post(`/varieties/${selectedVariety.id}/phases`, phaseForm);
      showNotification(`Fase "${phaseForm.phase_code}" berhasil ditambahkan.`);
      setShowAddPhaseModal(false);
      setPhaseForm({
        phase_code: "",
        phase_name: "",
        hst_start: 0,
        hst_end: 10,
        ndvi_expected_min: 0.1,
        ndvi_expected_max: 0.3,
        ndre_threshold: 0.15,
        kc_value: 1.05,
        gdd_target: 150,
      });
      await fetchVarieties();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Gagal menambahkan fase fenologi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Database Varietas & Fase Fenologi
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Kelola parameter agronomi terstandarisasi skala BBCH/IRRI (Padi) dan Skala V-R (Jagung)
              </p>
            </div>
            <button
              onClick={() => {
                setVarietyForm({ crop_type: "padi", name: "", cycle_days: 120, t_base: 10.0 });
                setShowAddVarietyModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm hover:shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Varietas</span>
            </button>
          </div>

          {/* Notifications */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Sprout className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Varietas</p>
                <p className="text-2xl font-bold text-slate-900">{varieties.length}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                🌾
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Varietas Padi</p>
                <p className="text-2xl font-bold text-slate-900">{totalPadi}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                🌽
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Varietas Jagung</p>
                <p className="text-2xl font-bold text-slate-900">{totalJagung}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Fase Fenologi Terdaftar</p>
                <p className="text-2xl font-bold text-slate-900">{totalPhases}</p>
              </div>
            </div>
          </div>

          {/* Main Content Layout: Left list of varieties, Right detail & phases */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Varieties List (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Filter & Search Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari varietas..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {["semua", "padi", "jagung"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setCropTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                        cropTypeFilter === t
                          ? "bg-white text-emerald-800 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {t === "semua" ? "Semua" : t === "padi" ? "🌾 Padi" : "🌽 Jagung"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Varieties Cards */}
              <div className="flex flex-col gap-3">
                {loading ? (
                  <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mx-auto mb-2"></div>
                    <p className="text-sm">Memuat daftar varietas...</p>
                  </div>
                ) : filteredVarieties.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    <p className="text-sm font-medium">Tidak ada varietas ditemukan.</p>
                  </div>
                ) : (
                  filteredVarieties.map((v) => {
                    const isSelected = selectedVariety?.id === v.id;
                    const isPadi = v.crop_type === "padi";
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVariety(v)}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer text-left relative ${
                          isSelected
                            ? "bg-emerald-50/50 border-emerald-500 shadow-md ring-1 ring-emerald-500"
                            : "bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{isPadi ? "🌾" : "🌽"}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-900 text-base">{v.name}</h3>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                    isPadi
                                      ? "bg-teal-100 text-teal-800 border border-teal-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                  }`}
                                >
                                  {v.crop_type}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                                <span>⏱️ Umur: {v.cycle_days} HST</span>
                                <span>🌡️ T-base: {v.t_base}°C</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                              {v.phases?.length || 0} Fase
                            </span>
                            <ChevronRight
                              className={`w-5 h-5 ml-1 transition-transform ${
                                isSelected ? "text-emerald-600 translate-x-0.5" : "text-slate-300"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Selected Variety Detail & Phenology Phases (7 Cols) */}
            <div className="lg:col-span-7">
              {selectedVariety ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Top Bar of Selected Variety */}
                  <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-900">{selectedVariety.name}</h2>
                        <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {selectedVariety.crop_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Siklus fisiologis {selectedVariety.cycle_days} Hari Setelah Tanam (HST) | Suhu dasar pertumbuhan: {selectedVariety.t_base}°C
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setVarietyForm({
                            name: selectedVariety.name,
                            crop_type: selectedVariety.crop_type,
                            cycle_days: selectedVariety.cycle_days,
                            t_base: selectedVariety.t_base,
                          });
                          setShowEditVarietyModal(true);
                        }}
                        className="p-2 text-slate-600 hover:text-emerald-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                        title="Edit Varietas"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setVarietyToDelete(selectedVariety);
                          setShowDeleteConfirmModal(true);
                        }}
                        className="p-2 text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
                        title="Hapus Varietas"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowAddPhaseModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Fase</span>
                      </button>
                    </div>
                  </div>

                  {/* Phenology Phases Table */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                          <Layers className="w-4 h-4 text-emerald-600" />
                          <span>Tahapan Skala Fenologi</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Parameter ambang batas remote sensing dan agrometeorologi per fase
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                        Total {selectedVariety.phases?.length || 0} Fase
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                            <th className="py-3 px-3">Kode</th>
                            <th className="py-3 px-3">Nama Fase</th>
                            <th className="py-3 px-2">HST</th>
                            <th className="py-3 px-2">NDVI Ekspektasi</th>
                            <th className="py-3 px-2">NDRE Min</th>
                            <th className="py-3 px-2">Kc</th>
                            <th className="py-3 px-2">GDD Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {selectedVariety.phases && selectedVariety.phases.length > 0 ? (
                            selectedVariety.phases.map((phase) => (
                              <tr key={phase.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-3 font-bold text-slate-900">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-emerald-800 font-mono">
                                    {phase.phase_code}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="font-semibold text-slate-900 block">{phase.phase_name}</span>
                                </td>
                                <td className="py-3 px-2 whitespace-nowrap">
                                  <span className="text-slate-600">
                                    {phase.hst_start === phase.hst_end
                                      ? `${phase.hst_start}`
                                      : `${phase.hst_start} - ${phase.hst_end}`}
                                  </span>
                                </td>
                                <td className="py-3 px-2 whitespace-nowrap">
                                  <span className="text-emerald-700 font-mono">
                                    {phase.ndvi_expected_min.toFixed(2)} - {phase.ndvi_expected_max.toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-3 px-2 whitespace-nowrap font-mono text-blue-700">
                                  ≥ {phase.ndre_threshold.toFixed(2)}
                                </td>
                                <td className="py-3 px-2 font-mono font-bold text-slate-800">
                                  {phase.kc_value.toFixed(2)}
                                </td>
                                <td className="py-3 px-2 font-mono font-bold text-amber-700 whitespace-nowrap">
                                  {phase.gdd_target} °C·h
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-500">
                                Belum ada fase fenologi yang terdaftar untuk varietas ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Explanatory Guide Box */}
                    <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Keterangan Parameter Fenologi:</span>
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        <li><span className="font-medium text-slate-700">Kc (Koefisien Tanaman):</span> Faktor pengali untuk menghitung kebutuhan evapotranspirasi air riil tanaman (ETc = ET₀ × Kc).</li>
                        <li><span className="font-medium text-slate-700">NDRE Threshold:</span> Ambang batas klorofil daun untuk deteksi dini defisiensi pupuk Nitrogen (Urea).</li>
                        <li><span className="font-medium text-slate-700">GDD Target:</span> Akumulasi suhu panas (Growing Degree Days) untuk menentukan tanggal transisi fase secara otomatis.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 text-center">
                  <Sprout className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700 text-sm">Pilih salah satu varietas tanaman</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Pilih varietas dari daftar di sebelah kiri untuk melihat rincian parameter agronomi dan fase pertumbuhannya.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Modal: Tambah Varietas Baru */}
        {showAddVarietyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Tambah Varietas Baru</h3>
                <button onClick={() => setShowAddVarietyModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateVariety} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Tanaman</label>
                  <select
                    value={varietyForm.crop_type}
                    onChange={(e) => setVarietyForm({ ...varietyForm, crop_type: e.target.value as "padi" | "jagung" })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="padi">🌾 Padi (Oryza sativa)</option>
                    <option value="jagung">🌽 Jagung (Zea mays)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Varietas</label>
                  <input
                    type="text"
                    required
                    value={varietyForm.name}
                    onChange={(e) => setVarietyForm({ ...varietyForm, name: e.target.value })}
                    placeholder="cth: Inpari 32, Ciherang, BISI 18"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Umur Siklus (HST)</label>
                    <input
                      type="number"
                      required
                      min={30}
                      max={300}
                      value={varietyForm.cycle_days}
                      onChange={(e) => setVarietyForm({ ...varietyForm, cycle_days: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Suhu Dasar T-base (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={varietyForm.t_base}
                      onChange={(e) => setVarietyForm({ ...varietyForm, t_base: parseFloat(e.target.value) || 10.0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddVarietyModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Menyimpan..." : "Simpan Varietas"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Varietas */}
        {showEditVarietyModal && selectedVariety && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Edit Varietas</h3>
                <button onClick={() => setShowEditVarietyModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateVariety} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Tanaman</label>
                  <select
                    value={varietyForm.crop_type}
                    onChange={(e) => setVarietyForm({ ...varietyForm, crop_type: e.target.value as "padi" | "jagung" })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="padi">🌾 Padi (Oryza sativa)</option>
                    <option value="jagung">🌽 Jagung (Zea mays)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Varietas</label>
                  <input
                    type="text"
                    required
                    value={varietyForm.name}
                    onChange={(e) => setVarietyForm({ ...varietyForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Umur Siklus (HST)</label>
                    <input
                      type="number"
                      required
                      min={30}
                      max={300}
                      value={varietyForm.cycle_days}
                      onChange={(e) => setVarietyForm({ ...varietyForm, cycle_days: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Suhu Dasar T-base (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      value={varietyForm.t_base}
                      onChange={(e) => setVarietyForm({ ...varietyForm, t_base: parseFloat(e.target.value) || 10.0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditVarietyModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Menyimpan..." : "Perbarui Varietas"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Tambah Fase Fenologi Baru */}
        {showAddPhaseModal && selectedVariety && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Tambah Fase Fenologi</h3>
                  <p className="text-xs text-slate-500">Varietas: {selectedVariety.name}</p>
                </div>
                <button onClick={() => setShowAddPhaseModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePhase} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Fase</label>
                    <input
                      type="text"
                      required
                      placeholder="cth: V1, V6-V8, R1"
                      value={phaseForm.phase_code}
                      onChange={(e) => setPhaseForm({ ...phaseForm, phase_code: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target GDD (°C·hari)</label>
                    <input
                      type="number"
                      required
                      step="1"
                      value={phaseForm.gdd_target}
                      onChange={(e) => setPhaseForm({ ...phaseForm, gdd_target: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Deskriptif Fase</label>
                  <input
                    type="text"
                    required
                    placeholder="cth: Pertunasan / Anakan Aktif (Tillering)"
                    value={phaseForm.phase_name}
                    onChange={(e) => setPhaseForm({ ...phaseForm, phase_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mulai (HST)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={phaseForm.hst_start}
                      onChange={(e) => setPhaseForm({ ...phaseForm, hst_start: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Selesai (HST)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={phaseForm.hst_end}
                      onChange={(e) => setPhaseForm({ ...phaseForm, hst_end: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">NDVI Min</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={phaseForm.ndvi_expected_min}
                      onChange={(e) => setPhaseForm({ ...phaseForm, ndvi_expected_min: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">NDVI Max</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={phaseForm.ndvi_expected_max}
                      onChange={(e) => setPhaseForm({ ...phaseForm, ndvi_expected_max: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">NDRE Ambang</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={phaseForm.ndre_threshold}
                      onChange={(e) => setPhaseForm({ ...phaseForm, ndre_threshold: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Koefisien Kc Tanaman</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    required
                    value={phaseForm.kc_value}
                    onChange={(e) => setPhaseForm({ ...phaseForm, kc_value: parseFloat(e.target.value) || 1.0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPhaseModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Menyimpan..." : "Simpan Fase"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Konfirmasi Hapus Varietas */}
        {showDeleteConfirmModal && varietyToDelete && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 text-center">Hapus Varietas?</h3>
              <p className="text-xs text-slate-600 text-center mt-2">
                Apakah Anda yakin ingin menghapus varietas <strong className="text-slate-800">{varietyToDelete.name}</strong>? Seluruh data fase fenologi yang terikat juga akan terhapus.
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmModal(false)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVariety}
                  disabled={submitting}
                  className="w-full px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Menghapus..." : "Ya, Hapus"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
