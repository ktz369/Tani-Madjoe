"use client";

import React, { useEffect, useState, useMemo } from "react";
import AuthGuard from "@/components/layout/AuthGuard";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { Company, Estate, Division } from "@/types";
import {
  Building2,
  Trees,
  Layers,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  MapPin,
  Compass,
  AlertCircle,
  CheckCircle2,
  X,
  ExternalLink,
  RefreshCw,
  FolderTree,
  SlidersHorizontal,
  Info,
} from "lucide-react";

// Coordinate presets for major Indonesian agricultural zones
const INDONESIA_REGION_PRESETS = [
  { name: "Riau (Pelalawan)", lat: 0.5532, lng: 101.8524, prov: "Riau", kab: "Pelalawan" },
  { name: "Sumut (Labuhanbatu)", lat: 2.1543, lng: 99.8211, prov: "Sumatera Utara", kab: "Labuhanbatu" },
  { name: "Sumsel (Banyuasin)", lat: -2.8833, lng: 104.3833, prov: "Sumatera Selatan", kab: "Banyuasin" },
  { name: "Kalbar (Ketapang)", lat: -1.8472, lng: 109.9714, prov: "Kalimantan Barat", kab: "Ketapang" },
  { name: "Kaltim (Kutai Timur)", lat: 0.5397, lng: 117.5441, prov: "Kalimantan Timur", kab: "Kutai Timur" },
  { name: "Kalteng (Kotawaringin Barat)", lat: -2.6833, lng: 111.6167, prov: "Kalimantan Tengah", kab: "Kotawaringin Barat" },
  { name: "Sulsel (Luwu Utara)", lat: -2.5936, lng: 120.3155, prov: "Sulawesi Selatan", kab: "Luwu Utara" },
  { name: "Lampung (Lampung Tengah)", lat: -4.8611, lng: 105.2144, prov: "Lampung", kab: "Lampung Tengah" },
  { name: "Jatim (Banyuwangi)", lat: -8.2192, lng: 114.3691, prov: "Jawa Timur", kab: "Banyuwangi" },
  { name: "Jabar (Subang)", lat: -6.5686, lng: 107.7584, prov: "Jawa Barat", kab: "Subang" },
];

type EntityType = "company" | "estate" | "division";

interface ToastState {
  type: "success" | "error";
  message: string;
}

export default function OrganisasiAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [toast, setToast] = useState<ToastState | null>(null);

  // Tree expansion state
  const [expandedCompanies, setExpandedCompanies] = useState<Record<number, boolean>>({});
  const [expandedEstates, setExpandedEstates] = useState<Record<number, boolean>>({});

  // Selected item for inspector view
  const [selectedEntity, setSelectedEntity] = useState<{
    type: EntityType;
    id: number;
  } | null>(null);

  // Modal States
  const [companyModal, setCompanyModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    data?: Company;
  }>({ open: false, mode: "create" });

  const [estateModal, setEstateModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    companyId?: number;
    data?: Estate;
  }>({ open: false, mode: "create" });

  const [divisionModal, setDivisionModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    estateId?: number;
    data?: Division;
  }>({ open: false, mode: "create" });

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: EntityType;
    id: number;
    name: string;
  }>({ open: false, type: "company", id: 0, name: "" });

  // Form Field States
  const [companyForm, setCompanyForm] = useState({ name: "", address: "" });
  const [estateForm, setEstateForm] = useState({
    company_id: 0,
    name: "",
    province: "",
    kabupaten: "",
    latitude: "",
    longitude: "",
  });
  const [divisionForm, setDivisionForm] = useState({
    estate_id: 0,
    name: "",
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Fetch all organization data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [compRes, estRes, divRes] = await Promise.all([
        api.get<Company[]>("/companies"),
        api.get<Estate[]>("/estates"),
        api.get<Division[]>("/divisions"),
      ]);

      const compList = Array.isArray(compRes.data) ? compRes.data : [];
      const estList = Array.isArray(estRes.data) ? estRes.data : [];
      const divList = Array.isArray(divRes.data) ? divRes.data : [];

      setCompanies(compList);
      setEstates(estList);
      setDivisions(divList);

      // Auto-expand all companies and estates by default
      const compExp: Record<number, boolean> = {};
      compList.forEach((c) => {
        compExp[c.id] = true;
      });
      setExpandedCompanies(compExp);

      const estExp: Record<number, boolean> = {};
      estList.forEach((e) => {
        estExp[e.id] = true;
      });
      setExpandedEstates(estExp);

      // Default select first company if none selected
      if (!selectedEntity && compList.length > 0) {
        setSelectedEntity({ type: "company", id: compList[0].id });
      }
    } catch (err: any) {
      console.error("Gagal memuat hierarki organisasi:", err);
      showToast(err.response?.data?.detail || "Gagal memuat data hierarki organisasi", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Organize data in tree structure
  const treeData = useMemo(() => {
    const estateMap: Record<number, Estate[]> = {};
    estates.forEach((e) => {
      if (!estateMap[e.company_id]) {
        estateMap[e.company_id] = [];
      }
      estateMap[e.company_id].push(e);
    });

    const divisionMap: Record<number, Division[]> = {};
    divisions.forEach((d) => {
      if (!divisionMap[d.estate_id]) {
        divisionMap[d.estate_id] = [];
      }
      divisionMap[d.estate_id].push(d);
    });

    return { estateMap, divisionMap };
  }, [estates, divisions]);

  // Filtered companies based on search
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase().trim();

    return companies.filter((c) => {
      const matchCompany = c.name.toLowerCase().includes(q) || (c.address && c.address.toLowerCase().includes(q));
      const companyEstates = treeData.estateMap[c.id] || [];
      const matchEstate = companyEstates.some(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.province && e.province.toLowerCase().includes(q)) ||
          (e.kabupaten && e.kabupaten.toLowerCase().includes(q))
      );
      const matchDivision = companyEstates.some((e) => {
        const divs = treeData.divisionMap[e.id] || [];
        return divs.some((d) => d.name.toLowerCase().includes(q));
      });

      return matchCompany || matchEstate || matchDivision;
    });
  }, [companies, searchQuery, treeData]);

  // Toggle company expand
  const toggleCompanyExpand = (id: number) => {
    setExpandedCompanies((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle estate expand
  const toggleEstateExpand = (id: number) => {
    setExpandedEstates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const compExp: Record<number, boolean> = {};
    companies.forEach((c) => {
      compExp[c.id] = true;
    });
    setExpandedCompanies(compExp);

    const estExp: Record<number, boolean> = {};
    estates.forEach((e) => {
      estExp[e.id] = true;
    });
    setExpandedEstates(estExp);
  };

  const collapseAll = () => {
    setExpandedCompanies({});
    setExpandedEstates({});
  };

  // -------------------------------------------------------------
  // CRUD Handlers
  // -------------------------------------------------------------

  // Open Company Modal
  const handleOpenCompanyModal = (mode: "create" | "edit", data?: Company) => {
    setFormError(null);
    if (mode === "edit" && data) {
      setCompanyForm({ name: data.name, address: data.address || "" });
      setCompanyModal({ open: true, mode: "edit", data });
    } else {
      setCompanyForm({ name: "", address: "" });
      setCompanyModal({ open: true, mode: "create" });
    }
  };

  // Submit Company Form
  const handleSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setFormError("Nama perusahaan wajib diisi.");
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);

      if (companyModal.mode === "create") {
        const res = await api.post<Company>("/companies", {
          name: companyForm.name.trim(),
          address: companyForm.address.trim() || undefined,
        });
        showToast(`Perusahaan "${res.data.name}" berhasil ditambahkan.`);
        setSelectedEntity({ type: "company", id: res.data.id });
      } else if (companyModal.data) {
        const res = await api.put<Company>(`/companies/${companyModal.data.id}`, {
          name: companyForm.name.trim(),
          address: companyForm.address.trim() || undefined,
        });
        showToast(`Perusahaan "${res.data.name}" berhasil diperbarui.`);
      }

      setCompanyModal({ open: false, mode: "create" });
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menyimpan perusahaan:", err);
      setFormError(err.response?.data?.detail || "Gagal menyimpan data perusahaan.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Estate Modal
  const handleOpenEstateModal = (mode: "create" | "edit", companyId?: number, data?: Estate) => {
    setFormError(null);
    if (mode === "edit" && data) {
      setEstateForm({
        company_id: data.company_id,
        name: data.name,
        province: data.province || "",
        kabupaten: data.kabupaten || "",
        latitude: data.latitude !== null && data.latitude !== undefined ? String(data.latitude) : "",
        longitude: data.longitude !== null && data.longitude !== undefined ? String(data.longitude) : "",
      });
      setEstateModal({ open: true, mode: "edit", data });
    } else {
      const defaultCompId = companyId || (companies.length > 0 ? companies[0].id : 0);
      setEstateForm({
        company_id: defaultCompId,
        name: "",
        province: "",
        kabupaten: "",
        latitude: "",
        longitude: "",
      });
      setEstateModal({ open: true, mode: "create", companyId: defaultCompId });
    }
  };

  // Submit Estate Form
  const handleSubmitEstate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estateForm.name.trim()) {
      setFormError("Nama estate/perkebunan wajib diisi.");
      return;
    }
    if (!estateForm.company_id) {
      setFormError("Pilih perusahaan induk.");
      return;
    }

    const lat = estateForm.latitude.trim() ? parseFloat(estateForm.latitude.trim()) : undefined;
    const lng = estateForm.longitude.trim() ? parseFloat(estateForm.longitude.trim()) : undefined;

    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      setFormError("Nilai Latitude harus berada di antara -90.0 dan 90.0");
      return;
    }
    if (lng !== undefined && (isNaN(lng) || lng < -180 || lng > 180)) {
      setFormError("Nilai Longitude harus berada di antara -180.0 dan 180.0");
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);

      const payload = {
        company_id: estateForm.company_id,
        name: estateForm.name.trim(),
        province: estateForm.province.trim() || undefined,
        kabupaten: estateForm.kabupaten.trim() || undefined,
        latitude: lat,
        longitude: lng,
      };

      if (estateModal.mode === "create") {
        const res = await api.post<Estate>(`/companies/${estateForm.company_id}/estates`, payload);
        showToast(`Estate "${res.data.name}" berhasil ditambahkan.`);
        setSelectedEntity({ type: "estate", id: res.data.id });
      } else if (estateModal.data) {
        const res = await api.put<Estate>(`/estates/${estateModal.data.id}`, payload);
        showToast(`Estate "${res.data.name}" berhasil diperbarui.`);
      }

      setEstateModal({ open: false, mode: "create" });
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menyimpan estate:", err);
      setFormError(err.response?.data?.detail || "Gagal menyimpan data estate.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Division Modal
  const handleOpenDivisionModal = (mode: "create" | "edit", estateId?: number, data?: Division) => {
    setFormError(null);
    if (mode === "edit" && data) {
      setDivisionForm({
        estate_id: data.estate_id,
        name: data.name,
      });
      setDivisionModal({ open: true, mode: "edit", data });
    } else {
      const defaultEstId = estateId || (estates.length > 0 ? estates[0].id : 0);
      setDivisionForm({
        estate_id: defaultEstId,
        name: "",
      });
      setDivisionModal({ open: true, mode: "create", estateId: defaultEstId });
    }
  };

  // Submit Division Form
  const handleSubmitDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!divisionForm.name.trim()) {
      setFormError("Nama divisi wajib diisi.");
      return;
    }
    if (!divisionForm.estate_id) {
      setFormError("Pilih estate/kebun induk.");
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);

      const payload = {
        estate_id: divisionForm.estate_id,
        name: divisionForm.name.trim(),
      };

      if (divisionModal.mode === "create") {
        const res = await api.post<Division>(`/estates/${divisionForm.estate_id}/divisions`, payload);
        showToast(`Divisi "${res.data.name}" berhasil ditambahkan.`);
        setSelectedEntity({ type: "division", id: res.data.id });
      } else if (divisionModal.data) {
        const res = await api.put<Division>(`/divisions/${divisionModal.data.id}`, payload);
        showToast(`Divisi "${res.data.name}" berhasil diperbarui.`);
      }

      setDivisionModal({ open: false, mode: "create" });
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menyimpan divisi:", err);
      setFormError(err.response?.data?.detail || "Gagal menyimpan data divisi.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Entity
  const handleConfirmDelete = async () => {
    try {
      setFormSubmitting(true);
      const { type, id, name } = deleteModal;

      if (type === "company") {
        await api.delete(`/companies/${id}`);
        showToast(`Perusahaan "${name}" berhasil dihapus.`);
      } else if (type === "estate") {
        await api.delete(`/estates/${id}`);
        showToast(`Estate "${name}" berhasil dihapus.`);
      } else if (type === "division") {
        await api.delete(`/divisions/${id}`);
        showToast(`Divisi "${name}" berhasil dihapus.`);
      }

      setDeleteModal({ open: false, type: "company", id: 0, name: "" });
      if (selectedEntity?.id === id && selectedEntity.type === type) {
        setSelectedEntity(null);
      }
      await fetchData();
    } catch (err: any) {
      console.error("Gagal menghapus entitas:", err);
      showToast(err.response?.data?.detail || "Gagal menghapus entitas.", "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Selected Entity Details
  const selectedDetails = useMemo(() => {
    if (!selectedEntity) return null;
    if (selectedEntity.type === "company") {
      const comp = companies.find((c) => c.id === selectedEntity.id);
      if (!comp) return null;
      const compEstates = treeData.estateMap[comp.id] || [];
      const totalDivs = compEstates.reduce(
        (acc, e) => acc + (treeData.divisionMap[e.id]?.length || 0),
        0
      );
      return {
        type: "company" as const,
        data: comp,
        estates: compEstates,
        totalDivisions: totalDivs,
      };
    }
    if (selectedEntity.type === "estate") {
      const est = estates.find((e) => e.id === selectedEntity.id);
      if (!est) return null;
      const comp = companies.find((c) => c.id === est.company_id);
      const estDivs = treeData.divisionMap[est.id] || [];
      return {
        type: "estate" as const,
        data: est,
        company: comp,
        divisions: estDivs,
      };
    }
    if (selectedEntity.type === "division") {
      const div = divisions.find((d) => d.id === selectedEntity.id);
      if (!div) return null;
      const est = estates.find((e) => e.id === div.estate_id);
      const comp = est ? companies.find((c) => c.id === est.company_id) : null;
      return {
        type: "division" as const,
        data: div,
        estate: est,
        company: comp,
      };
    }
    return null;
  }, [selectedEntity, companies, estates, divisions, treeData]);

  return (
    <AuthGuard requireAuth={true}>
      <div className="min-h-screen bg-[var(--canvas)] pt-[68px] text-[var(--ink)] flex flex-col">
        <Navbar />

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-5 duration-150">
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-[3px] border border-black/[0.08] text-[13px] font-medium bg-white ${
                toast.type === "success"
                  ? "text-[var(--accent-ink)]"
                  : "text-rose-800"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="ml-2 text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header & Page Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-black/[0.08] mb-8">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--accent-ink)] uppercase tracking-[0.04em] mb-1">
                <FolderTree className="w-4 h-4" /> Manajemen Entitas
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--ink)] tracking-tight">
                Hierarki Organisasi Lahan
              </h1>
              <p className="text-[13px] text-[var(--ink-2)] mt-1">
                Kelola struktur perusahaan perkebunan, estate/kebun, koordinat stasiun cuaca, dan divisi afdeling.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleOpenCompanyModal("create")}
                className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] text-white text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Perusahaan</span>
              </button>
              <button
                onClick={() => handleOpenEstateModal("create")}
                disabled={companies.length === 0}
                className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] inline-flex items-center gap-1.5 hover:bg-[var(--hover)] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Estate</span>
              </button>
              <button
                onClick={() => handleOpenDivisionModal("create")}
                disabled={estates.length === 0}
                className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] inline-flex items-center gap-1.5 hover:bg-[var(--hover)] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Divisi</span>
              </button>
              <button
                onClick={fetchData}
                className="h-[34px] px-[13px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)] transition-colors flex items-center justify-center cursor-pointer"
                title="Muat ulang data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="p-5 bg-white rounded-[3px] border border-black/[0.08] flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">Perusahaan Induk</p>
                <p className="text-2xl font-bold font-mono text-[var(--ink)] tabular-nums mt-1">{companies.length}</p>
                <p className="text-[12px] text-[var(--ink-2)] mt-0.5">Entitas korporasi pertanian</p>
              </div>
              <div className="p-2.5 bg-[var(--field)] text-[var(--accent)] rounded-[3px]">
                <Building2 className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 bg-white rounded-[3px] border border-black/[0.08] flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">Perkebunan / Estate</p>
                <p className="text-2xl font-bold font-mono text-[var(--ink)] tabular-nums mt-1">{estates.length}</p>
                <p className="text-[12px] text-[var(--ink-2)] mt-0.5">Unit kebun berkoordinat</p>
              </div>
              <div className="p-2.5 bg-[var(--field)] text-teal-700 rounded-[3px]">
                <Trees className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 bg-white rounded-[3px] border border-black/[0.08] flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">Divisi / Afdeling</p>
                <p className="text-2xl font-bold font-mono text-[var(--ink)] tabular-nums mt-1">{divisions.length}</p>
                <p className="text-[12px] text-[var(--ink-2)] mt-0.5">Sub-unit operasional lapangan</p>
              </div>
              <div className="p-2.5 bg-[var(--field)] text-indigo-700 rounded-[3px]">
                <Layers className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Main Layout: Left Tree View & Right Inspector Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Organization Tree */}
            <div className="lg:col-span-7 space-y-4">
              {/* Search & Collapse Controls */}
              <div className="bg-white p-4 rounded-[3px] border border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari perusahaan, estate, atau divisi..."
                    className="w-full pl-9 pr-4 border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--ink)]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={expandAll}
                    className="px-[13px] py-[5px] rounded-[3px] text-[12.5px] text-[var(--ink-2)] hover:bg-[var(--hover)] border border-black/[0.08] font-medium transition-colors cursor-pointer"
                  >
                    Buka Semua
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-[13px] py-[5px] rounded-[3px] text-[12.5px] text-[var(--ink-2)] hover:bg-[var(--hover)] border border-black/[0.08] font-medium transition-colors cursor-pointer"
                  >
                    Tutup Semua
                  </button>
                </div>
              </div>

              {/* Tree Container */}
              <div className="bg-white rounded-[3px] border border-black/[0.08] p-4 sm:p-5 overflow-hidden">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/[0.08]">
                  <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">
                    Struktur Hierarki
                  </span>
                  <span className="text-[12px] text-[var(--ink-2)] font-medium">
                    {filteredCompanies.length} Perusahaan Ditampilkan
                  </span>
                </div>

                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-[var(--ink-3)] text-sm">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-[var(--accent)] border-t-transparent mb-3" />
                    <span>Memuat struktur hierarki organisasi...</span>
                  </div>
                ) : filteredCompanies.length === 0 ? (
                  <div className="py-12 text-center text-[var(--ink-2)]">
                    <Building2 className="w-10 h-10 mx-auto text-[var(--ink-3)] mb-2" />
                    <p className="font-semibold text-[var(--ink)]">Belum ada data hierarki</p>
                    <p className="text-xs text-[var(--ink-2)] mt-1 max-w-sm mx-auto">
                      {searchQuery
                        ? "Tidak ada data yang cocok dengan kata kunci pencarian."
                        : "Klik tombol 'Tambah Perusahaan' di atas untuk memulai membuat struktur organisasi."}
                    </p>
                    {!searchQuery && (
                      <button
                        onClick={() => handleOpenCompanyModal("create")}
                        className="mt-4 inline-flex items-center gap-1.5 h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] text-white text-[13px] font-medium transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Tambah Perusahaan Pertama
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCompanies.map((company) => {
                      const companyEstates = treeData.estateMap[company.id] || [];
                      const isCompExpanded = !!expandedCompanies[company.id];
                      const isCompSelected =
                        selectedEntity?.type === "company" && selectedEntity.id === company.id;

                      return (
                        <div
                          key={`company-${company.id}`}
                          className={`rounded-[3px] border transition-all ${
                            isCompSelected
                              ? "border-[var(--accent)] bg-emerald-50/20"
                              : "border-black/[0.08] bg-white hover:border-black/[0.16]"
                          }`}
                        >
                          {/* Company Item Header */}
                          <div className="p-3.5 flex items-center justify-between gap-3">
                            <div
                              onClick={() => {
                                setSelectedEntity({ type: "company", id: company.id });
                              }}
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCompanyExpand(company.id);
                                }}
                                className="p-1 rounded-[3px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                              >
                                {isCompExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>

                              <div className="p-2 bg-[var(--field)] text-[var(--accent)] rounded-[3px] flex-shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-[var(--ink)] text-sm truncate">
                                    {company.name}
                                  </h3>
                                  <span className="px-2 py-0.5 rounded-[3px] text-[10px] font-semibold bg-emerald-50 text-[var(--accent-ink)] border border-black/[0.08]">
                                    Perusahaan
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--ink-2)] truncate mt-0.5">
                                  {company.address || "Belum ada alamat kantor"}
                                </p>
                              </div>
                            </div>

                            {/* Company Actions */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEstateModal("create", company.id)}
                                className="px-[8px] py-[4px] text-[var(--ink-2)] hover:text-[var(--accent)] hover:bg-[var(--hover)] rounded-[3px] text-xs font-medium inline-flex items-center gap-1 transition-colors border border-black/[0.08]"
                                title="Tambah Estate di bawah perusahaan ini"
                              >
                                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                                <span className="hidden sm:inline">Estate</span>
                              </button>
                              <button
                                onClick={() => handleOpenCompanyModal("edit", company)}
                                className="p-1.5 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] rounded-[3px] transition-colors"
                                title="Edit Perusahaan"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteModal({
                                    open: true,
                                    type: "company",
                                    id: company.id,
                                    name: company.name,
                                  })
                                }
                                className="p-1.5 text-[var(--ink-3)] hover:text-rose-600 hover:bg-rose-50 rounded-[3px] transition-colors"
                                title="Hapus Perusahaan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Sub-level: Estates */}
                          {isCompExpanded && (
                            <div className="border-t border-black/[0.08] bg-[var(--canvas)] p-3 pl-8 sm:pl-10 space-y-2.5">
                              {companyEstates.length === 0 ? (
                                <div className="py-3 px-4 rounded-[3px] bg-white border border-dashed border-black/[0.16] text-xs text-[var(--ink-2)] flex items-center justify-between">
                                  <span>Belum ada estate/perkebunan di perusahaan ini.</span>
                                  <button
                                    onClick={() => handleOpenEstateModal("create", company.id)}
                                    className="text-[var(--accent)] hover:text-[var(--accent-ink)] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Tambah Sekarang
                                  </button>
                                </div>
                              ) : (
                                companyEstates.map((estate) => {
                                  const estateDivisions = treeData.divisionMap[estate.id] || [];
                                  const isEstExpanded = !!expandedEstates[estate.id];
                                  const isEstSelected =
                                    selectedEntity?.type === "estate" && selectedEntity.id === estate.id;

                                  return (
                                    <div
                                      key={`estate-${estate.id}`}
                                      className={`rounded-[3px] border transition-all ${
                                        isEstSelected
                                          ? "border-[var(--accent)] bg-emerald-50/20"
                                          : "border-black/[0.08] bg-white hover:border-black/[0.16]"
                                      }`}
                                    >
                                      {/* Estate Item Header */}
                                      <div className="p-3 flex items-center justify-between gap-3">
                                        <div
                                          onClick={() => {
                                            setSelectedEntity({ type: "estate", id: estate.id });
                                          }}
                                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleEstateExpand(estate.id);
                                            }}
                                            className="p-1 rounded-[3px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                                          >
                                            {isEstExpanded ? (
                                              <ChevronDown className="w-3.5 h-3.5" />
                                            ) : (
                                              <ChevronRight className="w-3.5 h-3.5" />
                                            )}
                                          </button>

                                          <div className="p-1.5 bg-[var(--field)] text-teal-700 rounded-[3px] flex-shrink-0">
                                            <Trees className="w-3.5 h-3.5" />
                                          </div>

                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <h4 className="font-semibold text-[var(--ink)] text-xs sm:text-sm truncate">
                                                {estate.name}
                                              </h4>
                                              <span className="px-2 py-0.5 rounded-[3px] text-[10px] font-semibold bg-teal-50 text-teal-800 border border-black/[0.08]">
                                                Estate
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] text-[var(--ink-2)] mt-0.5 flex-wrap">
                                              <span>
                                                {[estate.kabupaten, estate.province].filter(Boolean).join(", ") ||
                                                  "Wilayah belum diset"}
                                              </span>
                                              {estate.latitude !== null && estate.latitude !== undefined && estate.longitude !== null && estate.longitude !== undefined && (
                                                <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-[3px] border border-teal-200 flex items-center gap-0.5">
                                                  <MapPin className="w-2.5 h-2.5" />
                                                  {Number(estate.latitude).toFixed(4)}, {Number(estate.longitude).toFixed(4)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Estate Actions */}
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleOpenDivisionModal("create", estate.id)}
                                            className="px-[8px] py-[3px] text-[var(--ink-2)] hover:text-[var(--accent)] hover:bg-[var(--hover)] rounded-[3px] text-xs font-medium inline-flex items-center gap-1 transition-colors border border-black/[0.08]"
                                            title="Tambah Divisi di bawah estate ini"
                                          >
                                            <Plus className="w-3 h-3 text-[var(--accent)]" />
                                            <span className="hidden sm:inline text-[11px]">Divisi</span>
                                          </button>
                                          <button
                                            onClick={() => handleOpenEstateModal("edit", estate.company_id, estate)}
                                            className="p-1 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] rounded-[3px] transition-colors"
                                            title="Edit Estate"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() =>
                                              setDeleteModal({
                                                open: true,
                                                type: "estate",
                                                id: estate.id,
                                                name: estate.name,
                                              })
                                            }
                                            className="p-1 text-[var(--ink-3)] hover:text-rose-600 hover:bg-rose-50 rounded-[3px] transition-colors"
                                            title="Hapus Estate"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Sub-sub-level: Divisions */}
                                      {isEstExpanded && (
                                        <div className="border-t border-black/[0.08] bg-[var(--field)] p-2.5 pl-6 sm:pl-8 space-y-1.5">
                                          {estateDivisions.length === 0 ? (
                                            <div className="py-2 px-3 rounded-[3px] bg-white border border-dashed border-black/[0.16] text-[11px] text-[var(--ink-3)] flex items-center justify-between">
                                              <span>Belum ada divisi di estate ini.</span>
                                              <button
                                                onClick={() => handleOpenDivisionModal("create", estate.id)}
                                                className="text-[var(--accent)] hover:text-[var(--accent-ink)] font-medium inline-flex items-center gap-0.5 cursor-pointer"
                                              >
                                                <Plus className="w-3 h-3" /> Tambah
                                              </button>
                                            </div>
                                          ) : (
                                            estateDivisions.map((division) => {
                                              const isDivSelected =
                                                selectedEntity?.type === "division" && selectedEntity.id === division.id;

                                              return (
                                                <div
                                                  key={`division-${division.id}`}
                                                  onClick={() => {
                                                    setSelectedEntity({ type: "division", id: division.id });
                                                  }}
                                                  className={`p-2 rounded-[3px] border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                                    isDivSelected
                                                      ? "border-[var(--accent)] bg-emerald-50/20"
                                                      : "border-black/[0.08] bg-white hover:border-black/[0.16]"
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <div className="p-1 bg-[var(--field)] text-indigo-700 rounded-[3px] flex-shrink-0">
                                                      <Layers className="w-3 h-3" />
                                                    </div>
                                                    <div className="min-w-0">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-[var(--ink)] text-xs truncate">
                                                          {division.name}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold bg-indigo-50 text-indigo-800 border border-black/[0.08]">
                                                          Divisi
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div className="flex items-center gap-1">
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDivisionModal("edit", division.estate_id, division);
                                                      }}
                                                      className="p-1 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] rounded-[3px] transition-colors"
                                                      title="Edit Divisi"
                                                    >
                                                      <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteModal({
                                                          open: true,
                                                          type: "division",
                                                          id: division.id,
                                                          name: division.name,
                                                        });
                                                      }}
                                                      className="p-1 text-[var(--ink-3)] hover:text-rose-600 hover:bg-rose-50 rounded-[3px] transition-colors"
                                                      title="Hapus Divisi"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Entity Inspector Panel */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-[3px] border border-black/[0.08] p-5 sticky top-24">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/[0.08]">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="font-semibold text-sm text-[var(--ink)]">Inspektor Entitas</h2>
                  </div>
                  {selectedDetails && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded-[3px] bg-[var(--field)] text-[var(--ink-2)] border border-black/[0.08]">
                      {selectedDetails.type}
                    </span>
                  )}
                </div>

                {!selectedDetails ? (
                  <div className="py-12 text-center text-[var(--ink-3)]">
                    <Info className="w-8 h-8 mx-auto text-[var(--ink-3)] mb-2" />
                    <p className="text-xs font-medium text-[var(--ink)]">Pilih entitas pada pohon organisasi</p>
                    <p className="text-[11px] text-[var(--ink-2)] mt-1">
                      Klik perusahaan, estate, atau divisi untuk melihat rincian koordinat, statistik, dan relasinya.
                    </p>
                  </div>
                ) : selectedDetails.type === "company" ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-start gap-3">
                      <div className="p-2.5 bg-[var(--accent)] text-white rounded-[3px]">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--accent-ink)]">
                          Perusahaan Induk
                        </span>
                        <h3 className="text-base font-semibold text-[var(--ink)] truncate mt-0.5">
                          {selectedDetails.data.name}
                        </h3>
                        <p className="text-xs text-[var(--ink-2)] mt-1">
                          {selectedDetails.data.address || "Alamat kantor belum dicantumkan."}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-[3px] border border-black/[0.08]">
                        <span className="text-[var(--ink-3)]">Total Estate / Kebun</span>
                        <p className="text-lg font-bold font-mono text-[var(--ink)] tabular-nums mt-0.5">
                          {selectedDetails.estates.length}
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-[3px] border border-black/[0.08]">
                        <span className="text-[var(--ink-3)]">Total Divisi Lapangan</span>
                        <p className="text-lg font-bold font-mono text-[var(--ink)] tabular-nums mt-0.5">
                          {selectedDetails.totalDivisions}
                        </p>
                      </div>
                    </div>

                    {/* Quick Estate List in Inspector */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.04em] mb-2">
                        Daftar Estate di Bawah Perusahaan
                      </h4>
                      {selectedDetails.estates.length === 0 ? (
                        <p className="text-xs text-[var(--ink-3)] italic">Belum ada estate.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {selectedDetails.estates.map((e) => (
                            <div
                              key={e.id}
                              onClick={() => setSelectedEntity({ type: "estate", id: e.id })}
                              className="p-2 bg-[var(--field)] hover:bg-[var(--hover)] rounded-[3px] border border-black/[0.08] flex items-center justify-between text-xs cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Trees className="w-3.5 h-3.5 text-teal-700" />
                                <span className="font-medium text-[var(--ink)]">{e.name}</span>
                              </div>
                              <span className="text-[10px] text-[var(--ink-3)]">
                                {[e.kabupaten, e.province].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Inspector Action Buttons */}
                    <div className="pt-3 border-t border-black/[0.08] flex gap-2">
                      <button
                        onClick={() => handleOpenCompanyModal("edit", selectedDetails.data)}
                        className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Perusahaan
                      </button>
                      <button
                        onClick={() => handleOpenEstateModal("create", selectedDetails.data.id)}
                        className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Estate
                      </button>
                    </div>
                  </div>
                ) : selectedDetails.type === "estate" ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-start gap-3">
                      <div className="p-2.5 bg-teal-700 text-white rounded-[3px]">
                        <Trees className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-teal-800">
                          Unit Perkebunan / Estate
                        </span>
                        <h3 className="text-base font-semibold text-[var(--ink)] truncate mt-0.5">
                          {selectedDetails.data.name}
                        </h3>
                        <p className="text-xs text-[var(--ink-2)] mt-0.5">
                          Induk: {selectedDetails.company?.name || "Perusahaan ID: " + selectedDetails.data.company_id}
                        </p>
                      </div>
                    </div>

                    {/* Location & Coordinates Card */}
                    <div className="p-3.5 bg-[var(--field)] rounded-[3px] border border-black/[0.08] space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[var(--ink-2)]">
                        <span className="font-medium text-[var(--ink)]">Wilayah Administrasi:</span>
                        <span>
                          {[selectedDetails.data.kabupaten, selectedDetails.data.province].filter(Boolean).join(", ") || "-"}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-black/[0.08]">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-[var(--ink)] flex items-center gap-1">
                            <Compass className="w-3.5 h-3.5 text-teal-700" /> Koordinat Lokasi (Point):
                          </span>
                          {selectedDetails.data.latitude !== null &&
                          selectedDetails.data.latitude !== undefined &&
                          selectedDetails.data.longitude !== null &&
                          selectedDetails.data.longitude !== undefined ? (
                            <a
                              href={`https://www.google.com/maps?q=${selectedDetails.data.latitude},${selectedDetails.data.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-700 hover:text-teal-800 font-semibold inline-flex items-center gap-0.5 text-[11px]"
                            >
                              Buka Peta <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </div>

                        {selectedDetails.data.latitude !== null &&
                        selectedDetails.data.latitude !== undefined &&
                        selectedDetails.data.longitude !== null &&
                        selectedDetails.data.longitude !== undefined ? (
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            <div className="p-2 bg-white rounded-[3px] border border-black/[0.08]">
                              <span className="text-[var(--ink-3)] block text-[10px]">Latitude (Y)</span>
                              <span className="font-bold text-[var(--ink)]">{Number(selectedDetails.data.latitude).toFixed(6)}</span>
                            </div>
                            <div className="p-2 bg-white rounded-[3px] border border-black/[0.08]">
                              <span className="text-[var(--ink-3)] block text-[10px]">Longitude (X)</span>
                              <span className="font-bold text-[var(--ink)]">{Number(selectedDetails.data.longitude).toFixed(6)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 bg-amber-50 rounded-[3px] border border-amber-200 text-amber-800 text-[11px]">
                            Koordinat belum diisi. Dibutuhkan untuk integrasi satelit Sentinel-2 & cuaca Open-Meteo.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Divisions under this estate */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.04em]">
                          Daftar Divisi ({selectedDetails.divisions.length})
                        </h4>
                        <button
                          onClick={() => handleOpenDivisionModal("create", selectedDetails.data.id)}
                          className="text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-ink)] inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Tambah Divisi
                        </button>
                      </div>

                      {selectedDetails.divisions.length === 0 ? (
                        <p className="text-xs text-[var(--ink-3)] italic">Belum ada divisi pada estate ini.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          {selectedDetails.divisions.map((d) => (
                            <div
                              key={d.id}
                              onClick={() => setSelectedEntity({ type: "division", id: d.id })}
                              className="p-2 bg-[var(--field)] hover:bg-[var(--hover)] rounded-[3px] border border-black/[0.08] flex items-center justify-between text-xs cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-indigo-700" />
                                <span className="font-medium text-[var(--ink)]">{d.name}</span>
                              </div>
                              <span className="text-[10px] text-[var(--ink-3)]">Divisi</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Inspector Action Buttons */}
                    <div className="pt-3 border-t border-black/[0.08] flex gap-2">
                      <button
                        onClick={() =>
                          handleOpenEstateModal(
                            "edit",
                            selectedDetails.data.company_id,
                            selectedDetails.data
                          )
                        }
                        className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Estate
                      </button>
                      <button
                        onClick={() => handleOpenDivisionModal("create", selectedDetails.data.id)}
                        className="h-[34px] px-[21px] rounded-[3px] bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Divisi
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-start gap-3">
                      <div className="p-2.5 bg-indigo-700 text-white rounded-[3px]">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-indigo-800">
                          Divisi / Afdeling
                        </span>
                        <h3 className="text-base font-semibold text-[var(--ink)] truncate mt-0.5">
                          {selectedDetails.data.name}
                        </h3>
                        <p className="text-xs text-[var(--ink-2)] mt-0.5">
                          Estate: {selectedDetails.estate?.name || "-"} | Perusahaan:{" "}
                          {selectedDetails.company?.name || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[var(--field)] rounded-[3px] border border-black/[0.08] space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[var(--ink-2)]">
                        <span>Estate Induk:</span>
                        <span className="font-semibold text-[var(--ink)]">
                          {selectedDetails.estate?.name || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[var(--ink-2)]">
                        <span>Perusahaan:</span>
                        <span className="font-semibold text-[var(--ink)]">
                          {selectedDetails.company?.name || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[var(--ink-2)]">
                        <span>Jumlah Petak / Blok:</span>
                        <span className="font-semibold text-[var(--ink)]">
                          {selectedDetails.data.petak_count || 0} Petak
                        </span>
                      </div>
                    </div>

                    {/* Inspector Action Buttons */}
                    <div className="pt-3 border-t border-black/[0.08] flex gap-2">
                      <button
                        onClick={() =>
                          handleOpenDivisionModal(
                            "edit",
                            selectedDetails.data.estate_id,
                            selectedDetails.data
                          )
                        }
                        className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors flex items-center justify-center gap-1.5 flex-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Divisi
                      </button>
                      <button
                        onClick={() =>
                          setDeleteModal({
                            open: true,
                            type: "division",
                            id: selectedDetails.data.id,
                            name: selectedDetails.data.name,
                          })
                        }
                        className="h-[34px] px-[21px] rounded-[3px] border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* ------------------------------------------------------------- */}
        {/* MODAL 1: COMPANY FORM (CREATE / EDIT) */}
        {/* ------------------------------------------------------------- */}
        {companyModal.open && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[3px] max-w-md w-full p-6 border border-black/[0.08]">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-black/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-[3px] border border-emerald-200">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-[var(--ink)]">
                      {companyModal.mode === "create"
                        ? "Tambah Perusahaan Baru"
                        : "Edit Data Perusahaan"}
                    </h3>
                    <p className="text-[12px] text-[var(--ink-3)]">
                      Entitas korporasi pemilik perkebunan lahan
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCompanyModal({ open: false, mode: "create" })}
                  className="p-1 rounded-[3px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-[3px] text-[12px] text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitCompany} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Nama Perusahaan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Sawit Nusantara Mandiri"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Alamat Kantor Pusat
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Gedung Agro Plaza Lt. 10, Jakarta Selatan"
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    className="w-full px-[13px] py-2 text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="pt-4 border-t border-black/[0.08] flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCompanyModal({ open: false, mode: "create" })}
                    className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-60"
                  >
                    {formSubmitting ? "Menyimpan..." : "Simpan Perusahaan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 2: ESTATE FORM (CREATE / EDIT WITH COORDINATES) */}
        {/* ------------------------------------------------------------- */}
        {estateModal.open && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[3px] max-w-lg w-full p-6 border border-black/[0.08]">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-black/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-teal-50 text-teal-700 rounded-[3px] border border-teal-200">
                    <Trees className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-[var(--ink)]">
                      {estateModal.mode === "create" ? "Tambah Estate Baru" : "Edit Data Estate"}
                    </h3>
                    <p className="text-[12px] text-[var(--ink-3)]">
                      Unit lahan kebun dengan koordinat titik pusat stasiun cuaca
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEstateModal({ open: false, mode: "create" })}
                  className="p-1 rounded-[3px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-[3px] text-[12px] text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitEstate} className="space-y-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Perusahaan Induk <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={estateForm.company_id}
                    onChange={(e) =>
                      setEstateForm({ ...estateForm, company_id: parseInt(e.target.value, 10) })
                    }
                    className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value={0} disabled>
                      -- Pilih Perusahaan --
                    </option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Nama Estate / Perkebunan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Estate Riau Permai"
                    value={estateForm.name}
                    onChange={(e) => setEstateForm({ ...estateForm, name: e.target.value })}
                    className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                      Provinsi
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Riau"
                      value={estateForm.province}
                      onChange={(e) => setEstateForm({ ...estateForm, province: e.target.value })}
                      className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                      Kabupaten / Kota
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Pelalawan"
                      value={estateForm.kabupaten}
                      onChange={(e) => setEstateForm({ ...estateForm, kabupaten: e.target.value })}
                      className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Coordinate Inputs and Presets */}
                <div className="p-3.5 bg-[var(--field)] rounded-[3px] border border-black/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      Titik Koordinat Pusat Estate (WGS84)
                    </span>
                  </div>

                  {/* Preset Quick Select Dropdown */}
                  <div>
                    <label className="block text-[11px] text-[var(--ink-3)] mb-1">
                      Gunakan Preset Wilayah Pertanian Indonesia:
                    </label>
                    <select
                      onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        if (!isNaN(idx) && INDONESIA_REGION_PRESETS[idx]) {
                          const p = INDONESIA_REGION_PRESETS[idx];
                          setEstateForm({
                            ...estateForm,
                            latitude: String(p.lat),
                            longitude: String(p.lng),
                            province: estateForm.province || p.prov,
                            kabupaten: estateForm.kabupaten || p.kab,
                          });
                        }
                      }}
                      defaultValue=""
                      className="w-full h-[32px] px-[10px] text-[12px] bg-white border border-black/[0.08] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)]"
                    >
                      <option value="" disabled>
                        -- Pilih Template Wilayah Pertanian --
                      </option>
                      {INDONESIA_REGION_PRESETS.map((preset, idx) => (
                        <option key={preset.name} value={idx}>
                          {preset.name} ({preset.lat}, {preset.lng})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                        Latitude (Lintang, -90 s/d 90)
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="Contoh: 0.5532"
                        value={estateForm.latitude}
                        onChange={(e) => setEstateForm({ ...estateForm, latitude: e.target.value })}
                        className="w-full h-[32px] px-[10px] text-[12px] font-mono bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                        Longitude (Bujur, -180 s/d 180)
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="Contoh: 101.8524"
                        value={estateForm.longitude}
                        onChange={(e) => setEstateForm({ ...estateForm, longitude: e.target.value })}
                        className="w-full h-[32px] px-[10px] text-[12px] font-mono bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                  <p className="text-[10.5px] text-[var(--ink-3)]">
                    Koordinat ini digunakan untuk mengambil data cuaca harian dan titik jangkar satelit.
                  </p>
                </div>

                <div className="pt-4 border-t border-black/[0.08] flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEstateModal({ open: false, mode: "create" })}
                    className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-60"
                  >
                    {formSubmitting ? "Menyimpan..." : "Simpan Estate"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 3: DIVISION FORM (CREATE / EDIT) */}
        {/* ------------------------------------------------------------- */}
        {divisionModal.open && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[3px] max-w-md w-full p-6 border border-black/[0.08]">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-black/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-[3px] border border-indigo-200">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-[var(--ink)]">
                      {divisionModal.mode === "create" ? "Tambah Divisi Baru" : "Edit Data Divisi"}
                    </h3>
                    <p className="text-[12px] text-[var(--ink-3)]">
                      Sub-unit kerja / afdeling operasional perkebunan
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDivisionModal({ open: false, mode: "create" })}
                  className="p-1 rounded-[3px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-[3px] text-[12px] text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitDivision} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Estate / Perkebunan Induk <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={divisionForm.estate_id}
                    onChange={(e) =>
                      setDivisionForm({ ...divisionForm, estate_id: parseInt(e.target.value, 10) })
                    }
                    className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value={0} disabled>
                      -- Pilih Estate Induk --
                    </option>
                    {estates.map((e) => {
                      const comp = companies.find((c) => c.id === e.company_id);
                      return (
                        <option key={e.id} value={e.id}>
                          {e.name} {comp ? `(${comp.name})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1">
                    Nama Divisi / Afdeling <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Divisi 1 - Afdeling Anggrek"
                    value={divisionForm.name}
                    onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                    className="w-full h-[34px] px-[13px] text-[13px] bg-white border border-black/[0.08] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="pt-4 border-t border-black/[0.08] flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDivisionModal({ open: false, mode: "create" })}
                    className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-60"
                  >
                    {formSubmitting ? "Menyimpan..." : "Simpan Divisi"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 4: DELETE CONFIRMATION MODAL */}
        {/* ------------------------------------------------------------- */}
        {deleteModal.open && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[3px] max-w-md w-full p-6 border border-black/[0.08]">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-[3px]">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--ink)]">Konfirmasi Hapus Data</h3>
                  <p className="text-[12px] text-rose-600 font-medium">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>

              <p className="text-[13px] text-[var(--ink-2)] my-4">
                Apakah Anda yakin ingin menghapus {deleteModal.type === "company" ? "perusahaan" : deleteModal.type === "estate" ? "estate" : "divisi"}{" "}
                <span className="font-bold text-[var(--ink)]">&quot;{deleteModal.name}&quot;</span>?
              </p>

              {deleteModal.type === "company" && (
                <div className="p-3 bg-amber-50 rounded-[3px] border border-amber-200 text-[12px] text-amber-800 mb-4">
                  <strong>Peringatan Cascade:</strong> Seluruh perkebunan (estate) dan divisi di bawah perusahaan ini juga akan terhapus secara permanen.
                </div>
              )}

              {deleteModal.type === "estate" && (
                <div className="p-3 bg-amber-50 rounded-[3px] border border-amber-200 text-[12px] text-amber-800 mb-4">
                  <strong>Peringatan Cascade:</strong> Seluruh divisi di bawah estate ini juga akan ikut terhapus.
                </div>
              )}

              <div className="pt-4 border-t border-black/[0.08] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteModal({ open: false, type: "company", id: 0, name: "" })}
                  className="h-[34px] px-[21px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] text-[13px] hover:bg-[var(--hover)] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={formSubmitting}
                  className="h-[34px] px-[21px] rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors disabled:opacity-60"
                >
                  {formSubmitting ? "Menyimpan..." : "Ya, Hapus Sekarang"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
