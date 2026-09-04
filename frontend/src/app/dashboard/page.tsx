"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Layers,
  MapPin,
  Sprout,
  Wheat,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ExternalLink,
  Maximize2,
  RefreshCw,
  Building2,
  Filter,
  Eye,
  Activity,
  PlusCircle,
  Map as MapIcon,
  Info,
} from "lucide-react";

import AuthGuard from "@/components/layout/AuthGuard";
import Navbar from "@/components/layout/Navbar";
import { WeatherWidget, ForecastChart } from "@/components/weather";
import { api } from "@/lib/api";
import {
  Estate,
  EstateDashboardPlotItem,
  EstateDashboardSummary,
} from "@/types";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example";

type SortField = "name" | "area_hectares" | "current_hst" | "latest_ndvi";
type SortOrder = "asc" | "desc";

export default function DashboardPage() {
  const router = useRouter();

  // State Data Perkebunan
  const [estates, setEstates] = useState<Estate[]>([]);
  const [selectedEstateId, setSelectedEstateId] = useState<number | "">("");
  const [dashboardData, setDashboardData] = useState<EstateDashboardSummary | null>(null);

  // State Loading & Error
  const [loadingEstates, setLoadingEstates] = useState<boolean>(true);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State Filter & Sorting Tabel
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cropFilter, setCropFilter] = useState<"semua" | "padi" | "jagung">("semua");
  const [ndviCategoryFilter, setNdviCategoryFilter] = useState<string>("semua");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // State Seleksi Petak di Peta
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);

  // State Tampilan Prakiraan Cuaca (Forecast)
  const [showForecast, setShowForecast] = useState<boolean>(false);

  // Mapbox Refs
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // 1. Muat Daftar Perkebunan (Estates)
  const fetchEstates = async () => {
    try {
      setLoadingEstates(true);
      setErrorMsg(null);
      const res = await api.get<Estate[]>("/estates");
      setEstates(res.data);
      if (res.data.length > 0 && !selectedEstateId) {
        setSelectedEstateId(res.data[0].id);
      }
    } catch (err: any) {
      console.error("Gagal memuat perkebunan:", err);
      setErrorMsg("Gagal memuat daftar perkebunan. Silakan coba lagi.");
    } finally {
      setLoadingEstates(false);
    }
  };

  useEffect(() => {
    fetchEstates();
  }, []);

  // 2. Muat Ringkasan Dashboard Estate Terpilih
  const fetchDashboardSummary = async (estateId: number) => {
    try {
      setLoadingDashboard(true);
      setErrorMsg(null);
      const res = await api.get<EstateDashboardSummary>(
        `/estates/${estateId}/dashboard-summary`
      );
      setDashboardData(res.data);
    } catch (err: any) {
      console.error("Gagal memuat ringkasan dashboard:", err);
      setErrorMsg("Gagal memuat data ringkasan dashboard perkebunan.");
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (selectedEstateId) {
      fetchDashboardSummary(Number(selectedEstateId));
    } else {
      setDashboardData(null);
    }
  }, [selectedEstateId]);

  // Helper fungsi warna & badge NDVI
  const getNdviDetails = (ndvi?: number | null) => {
    if (ndvi === null || ndvi === undefined) {
      return {
        color: "#94a3b8",
        status: "Belum Ada Data",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-700",
        badgeBorder: "border-slate-300",
        icon: HelpCircle,
      };
    }
    if (ndvi < 0.3) {
      return {
        color: "#ef4444",
        status: "Kritis",
        badgeBg: "bg-rose-50",
        badgeText: "text-rose-700",
        badgeBorder: "border-rose-200",
        icon: AlertTriangle,
      };
    }
    if (ndvi < 0.55) {
      return {
        color: "#f59e0b",
        status: "Waspada",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-700",
        badgeBorder: "border-amber-200",
        icon: AlertTriangle,
      };
    }
    if (ndvi <= 0.75) {
      return {
        color: "#10b981",
        status: "Baik",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-700",
        badgeBorder: "border-emerald-200",
        icon: CheckCircle2,
      };
    }
    return {
      color: "#047857",
      status: "Sangat Baik",
      badgeBg: "bg-teal-50",
      badgeText: "text-teal-800",
      badgeBorder: "border-teal-300",
      icon: CheckCircle2,
    };
  };

  // 3. Inisialisasi Mapbox GL
  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [101.8524, 0.5532],
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("load", () => {
      // GeoJSON source untuk poligon petak
      map.addSource("dashboard-plots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Fill Layer: Diwarnai secara dinamis berdasarkan nilai ndvi_color
      map.addLayer({
        id: "dashboard-plots-fill",
        type: "fill",
        source: "dashboard-plots",
        paint: {
          "fill-color": ["get", "ndvi_color"],
          "fill-opacity": 0.55,
        },
      });

      // Line Layer (Batas Garis Poligon)
      map.addLayer({
        id: "dashboard-plots-line",
        type: "line",
        source: "dashboard-plots",
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.5,
          "line-opacity": 0.85,
        },
      });

      // Highlight Layer saat petak dipilih/diklik
      map.addLayer({
        id: "dashboard-plots-highlight",
        type: "line",
        source: "dashboard-plots",
        paint: {
          "line-color": "#38bdf8",
          "line-width": 4,
          "line-opacity": 1.0,
        },
        filter: ["==", "id", ""],
      });

      // Click Event pada poligon petak di peta
      map.on("click", "dashboard-plots-fill", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        const coordinates = e.lngLat;

        const plotId = Number(props.id);
        setSelectedPlotId(plotId);
        map.setFilter("dashboard-plots-highlight", ["==", "id", plotId]);

        if (popupRef.current) {
          popupRef.current.remove();
        }

        const cropBadge =
          props.crop_type === "padi"
            ? "background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;"
            : "background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a;";

        const ndviVal = props.latest_ndvi !== undefined && props.latest_ndvi !== null && props.latest_ndvi !== ""
          ? Number(props.latest_ndvi).toFixed(2)
          : null;

        const popupHtml = `
          <div style="padding: 12px; font-family: ui-sans-serif, system-ui, sans-serif; min-width: 240px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 8px;">
              <h4 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0;">${props.name}</h4>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; ${cropBadge}">
                ${String(props.crop_type).toUpperCase()}
              </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #475569;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Varietas:</span>
                <span style="font-weight: 600; color: #1e293b;">${props.variety_name || "-"}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Fase Fenologi:</span>
                <span style="font-weight: 500; color: #1e293b;">${props.current_phase || "Vegetatif"}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Usia Tanam:</span>
                <span style="font-weight: 700; color: #0f172a;">${props.current_hst} HST</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Luas Petak:</span>
                <span style="font-weight: 600; color: #047857;">${props.area_hectares} ha</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
                <span style="color: #64748b;">Nilai NDVI:</span>
                <span style="font-weight: 700; font-size: 13px; color: ${props.ndvi_color};">
                  ${ndviVal !== null ? `${ndviVal} (${props.ndvi_status})` : "Belum ada data"}
                </span>
              </div>
            </div>
            <div style="margin-top: 10px; padding-top: 8px;">
              <a
                href="/petak/${props.id}"
                style="display: block; text-align: center; background-color: #059669; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-decoration: none;"
              >
                Buka Detail Petak &rarr;
              </a>
            </div>
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
          .setLngLat(coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        popupRef.current = popup;
      });

      // Cursor pointer saat hover di poligon petak
      map.on("mouseenter", "dashboard-plots-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "dashboard-plots-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
    };
  }, []);

  // 4. Update Data Poligon di Peta saat data Dashboard Berubah
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    const source = mapRef.current.getSource("dashboard-plots") as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (!dashboardData || !dashboardData.plots || dashboardData.plots.length === 0) {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    let hasCoords = false;

    const features = dashboardData.plots.map((p) => {
      const details = getNdviDetails(p.latest_ndvi);

      // Hitung koordinat untuk fitBounds
      if (p.polygon && p.polygon.coordinates) {
        try {
          const ring = p.polygon.coordinates[0];
          if (Array.isArray(ring)) {
            ring.forEach((coord: any) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                bounds.extend([coord[0], coord[1]]);
                hasCoords = true;
              }
            });
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      return {
        type: "Feature" as const,
        id: p.id,
        geometry: p.polygon,
        properties: {
          id: p.id,
          name: p.name,
          crop_type: p.crop_type,
          variety_name: p.variety_name,
          current_phase: p.current_phase,
          current_hst: p.current_hst,
          area_hectares: p.area_hectares,
          latest_ndvi: p.latest_ndvi,
          ndvi_status: details.status,
          ndvi_color: details.color,
        },
      };
    });

    source.setData({
      type: "FeatureCollection",
      features: features,
    });

    // Auto zoom fit to bounds jika ada koordinat poligon
    if (hasCoords && !bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 1200 });
    }
  }, [dashboardData]);

  // Fungsi fokus ke petak tertentu di peta dari baris tabel
  const handleFocusPlotOnMap = (plot: EstateDashboardPlotItem) => {
    setSelectedPlotId(plot.id);
    if (!mapRef.current) return;

    mapRef.current.setFilter("dashboard-plots-highlight", ["==", "id", plot.id]);

    if (plot.polygon && plot.polygon.coordinates && plot.polygon.coordinates[0]) {
      const ring = plot.polygon.coordinates[0];
      const bounds = new mapboxgl.LngLatBounds();
      ring.forEach((c: any) => {
        if (Array.isArray(c) && c.length >= 2) bounds.extend([c[0], c[1]]);
      });

      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 16.5, duration: 800 });
      }

      // Hitung titik tengah poligon untuk popup
      const center = bounds.getCenter();
      if (popupRef.current) popupRef.current.remove();

      const details = getNdviDetails(plot.latest_ndvi);
      const ndviVal = plot.latest_ndvi !== undefined && plot.latest_ndvi !== null
        ? Number(plot.latest_ndvi).toFixed(2)
        : null;

      const popupHtml = `
        <div style="padding: 12px; font-family: ui-sans-serif, system-ui, sans-serif; min-width: 240px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 8px;">
            <h4 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0;">${plot.name}</h4>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">
              ${plot.crop_type.toUpperCase()}
            </span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #475569;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Varietas:</span>
              <span style="font-weight: 600; color: #1e293b;">${plot.variety_name || "-"}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Fase:</span>
              <span style="font-weight: 500; color: #1e293b;">${plot.current_phase || "Vegetatif"}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Usia Tanam:</span>
              <span style="font-weight: 700; color: #0f172a;">${plot.current_hst} HST</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Luas:</span>
              <span style="font-weight: 600; color: #047857;">${plot.area_hectares} ha</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
              <span style="color: #64748b;">Nilai NDVI:</span>
              <span style="font-weight: 700; font-size: 13px; color: ${details.color};">
                ${ndviVal !== null ? `${ndviVal} (${details.status})` : "Belum ada data"}
              </span>
            </div>
          </div>
          <div style="margin-top: 10px; padding-top: 8px;">
            <a
              href="/petak/${plot.id}"
              style="display: block; text-align: center; background-color: #059669; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-decoration: none;"
            >
              Buka Detail Petak &rarr;
            </a>
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
        .setLngLat(center)
        .setHTML(popupHtml)
        .addTo(mapRef.current);

      popupRef.current = popup;
    }
  };

  // 5. Filter & Urutkan Petak untuk Tabel
  const filteredAndSortedPlots = useMemo(() => {
    if (!dashboardData || !dashboardData.plots) return [];

    let list = [...dashboardData.plots];

    // Filter Teks (Pencarian Nama Petak / Varietas)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.variety_name && p.variety_name.toLowerCase().includes(q))
      );
    }

    // Filter Komoditas
    if (cropFilter !== "semua") {
      list = list.filter((p) => p.crop_type.toLowerCase() === cropFilter);
    }

    // Filter Kategori NDVI
    if (ndviCategoryFilter !== "semua") {
      if (ndviCategoryFilter === "kritis") {
        list = list.filter((p) => p.latest_ndvi !== null && p.latest_ndvi !== undefined && p.latest_ndvi < 0.3);
      } else if (ndviCategoryFilter === "waspada") {
        list = list.filter(
          (p) =>
            p.latest_ndvi !== null &&
            p.latest_ndvi !== undefined &&
            p.latest_ndvi >= 0.3 &&
            p.latest_ndvi < 0.55
        );
      } else if (ndviCategoryFilter === "sehat") {
        list = list.filter(
          (p) => p.latest_ndvi !== null && p.latest_ndvi !== undefined && p.latest_ndvi >= 0.55
        );
      } else if (ndviCategoryFilter === "nodata") {
        list = list.filter((p) => p.latest_ndvi === null || p.latest_ndvi === undefined);
      }
    }

    // Sorting
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "area_hectares") {
        valA = a.area_hectares;
        valB = b.area_hectares;
      } else if (sortField === "current_hst") {
        valA = a.current_hst;
        valB = b.current_hst;
      } else if (sortField === "latest_ndvi") {
        valA = a.latest_ndvi !== null && a.latest_ndvi !== undefined ? a.latest_ndvi : -999;
        valB = b.latest_ndvi !== null && b.latest_ndvi !== undefined ? b.latest_ndvi : -999;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [dashboardData, searchQuery, cropFilter, ndviCategoryFilter, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 ml-1" />
    );
  };

  const selectedEstateObj = estates.find((e) => e.id === Number(selectedEstateId));

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header Bar: Judul & Dropdown Pemilihan Kebun (Estate) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Activity className="w-5 h-5" />
                </span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Dashboard Pemantauan Kebun
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Peta Heatmap NDVI Satelit Sentinel-2 & Ringkasan Kesehatan Petak Lahan
                  </p>
                </div>
              </div>
            </div>

            {/* Dropdown Pemilihan Estate */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <label htmlFor="estate-select" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Kebun / Estate:
                </label>
                <select
                  id="estate-select"
                  value={selectedEstateId}
                  onChange={(e) => setSelectedEstateId(Number(e.target.value))}
                  disabled={loadingEstates || estates.length === 0}
                  className="bg-transparent text-sm font-bold text-slate-900 border-none focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-50"
                >
                  {estates.length === 0 ? (
                    <option value="">Tidak ada kebun terdaftar</option>
                  ) : (
                    estates.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.name} {est.kabupaten ? `(${est.kabupaten})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button
                onClick={() => selectedEstateId && fetchDashboardSummary(Number(selectedEstateId))}
                disabled={loadingDashboard || !selectedEstateId}
                className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                title="Muat Ulang Data"
              >
                <RefreshCw className={`w-4 h-4 ${loadingDashboard ? "animate-spin text-emerald-600" : ""}`} />
              </button>
            </div>
          </div>

          {/* Pesan Error jika Ada */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Kartu Metrik Ringkasan Estate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metrik 1: Total Petak */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Petak Lahan
                </span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Layers className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  {loadingDashboard ? "..." : dashboardData?.total_plots ?? 0}
                </span>
                <span className="text-xs text-slate-500 font-medium">Petak terdata</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {selectedEstateObj?.name || "Seluruh petak dalam kebun"}
              </p>
            </div>

            {/* Metrik 2: Total Luas (Ha) */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Luas Kebun
                </span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Maximize2 className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-emerald-700">
                  {loadingDashboard ? "..." : dashboardData?.total_area_ha ?? 0}
                </span>
                <span className="text-xs text-slate-600 font-semibold">Hektar (Ha)</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Total area batas poligon aktif</p>
            </div>

            {/* Metrik 3: Rata-rata Nilai NDVI Kebun */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Rata-rata NDVI
                </span>
                <span className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                  <Sprout className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  {loadingDashboard
                    ? "..."
                    : dashboardData?.avg_ndvi !== null && dashboardData?.avg_ndvi !== undefined
                    ? Number(dashboardData.avg_ndvi).toFixed(2)
                    : "-"}
                </span>
                {dashboardData?.avg_ndvi !== null && dashboardData?.avg_ndvi !== undefined && (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      getNdviDetails(dashboardData.avg_ndvi).badgeBg
                    } ${getNdviDetails(dashboardData.avg_ndvi).badgeText} ${
                      getNdviDetails(dashboardData.avg_ndvi).badgeBorder
                    }`}
                  >
                    {getNdviDetails(dashboardData.avg_ndvi).status}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">Kerapatan tajuk & klorofil tanaman</p>
            </div>

            {/* Metrik 4: Petak Butuh Perhatian (NDVI < 0.40) */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Butuh Perhatian
                </span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <AlertTriangle className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={`text-3xl font-extrabold ${
                    (dashboardData?.plots_needing_attention ?? 0) > 0
                      ? "text-rose-600"
                      : "text-slate-900"
                  }`}
                >
                  {loadingDashboard ? "..." : dashboardData?.plots_needing_attention ?? 0}
                </span>
                <span className="text-xs text-slate-500 font-medium">Petak</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Petak dengan indeks NDVI &lt; 0.40</p>
            </div>
          </div>

          {/* Widget Cuaca & Prakiraan Iklim Kebun */}
          {selectedEstateId && (
            <div className="space-y-4">
              <WeatherWidget
                estateId={Number(selectedEstateId)}
                estateName={selectedEstateObj?.name}
                showForecastToggle={true}
                isForecastOpen={showForecast}
                onToggleForecast={() => setShowForecast(!showForecast)}
              />
              {showForecast && (
                <ForecastChart
                  estateId={Number(selectedEstateId)}
                  estateName={selectedEstateObj?.name}
                />
              )}
            </div>
          )}

          {/* Visualisasi Peta Mapbox Heatmap NDVI */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Header Peta & Legenda */}
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-emerald-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Peta Heatmap Indeks Vegetasi (NDVI)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Citra satelit optik Sentinel-2. Klik poligon petak untuk melihat rincian agronomi.
                  </p>
                </div>
              </div>

              {/* Legenda Warna NDVI */}
              <div className="flex flex-wrap items-center gap-2 text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs">
                <span className="font-semibold text-slate-700 mr-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Kategori NDVI:
                </span>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
                  <span className="text-slate-600 font-medium">&lt; 0.30 (Kritis)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-slate-600 font-medium">0.30 - 0.55 (Waspada)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[#10b981]" />
                  <span className="text-slate-600 font-medium">0.55 - 0.75 (Baik)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[#047857]" />
                  <span className="text-slate-600 font-medium">&gt; 0.75 (Sangat Baik)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[#94a3b8]" />
                  <span className="text-slate-500">Belum Ada Data</span>
                </div>
              </div>
            </div>

            {/* Container Canvas Mapbox */}
            <div className="relative w-full h-[460px] sm:h-[520px] bg-slate-900">
              <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

              {/* Loading Overlay pada Peta */}
              {loadingDashboard && (
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                  <div className="bg-white/95 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 border border-slate-200">
                    <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
                    <span className="text-sm font-semibold text-slate-800">
                      Memuat data geospasial petak kebun...
                    </span>
                  </div>
                </div>
              )}

              {/* Notifikasi jika petak kosong */}
              {!loadingDashboard && dashboardData && dashboardData.plots.length === 0 && (
                <div className="absolute top-4 left-4 z-10 bg-white/95 px-4 py-3 rounded-xl shadow border border-slate-200 max-w-sm">
                  <p className="text-xs font-semibold text-slate-800">
                    Belum ada petak lahan yang terdaftar pada kebun ini.
                  </p>
                  <Link
                    href="/admin/petak-baru"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Daftarkan Petak Baru Sekarang</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Komponen Tabel Ringkasan Petak Lahan */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Toolbar Filter & Pencarian */}
            <div className="p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4 bg-slate-50/60">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar & Status Kesehatan Petak Lahan
                </h2>
                <p className="text-xs text-slate-500">
                  Menampilkan {filteredAndSortedPlots.length} dari {dashboardData?.plots?.length || 0} petak
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Input Cari */}
                <div className="relative min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari petak / varietas..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                {/* Filter Jenis Tanaman */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                  <button
                    onClick={() => setCropFilter("semua")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      cropFilter === "semua"
                        ? "bg-slate-900 text-white font-semibold shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => setCropFilter("padi")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      cropFilter === "padi"
                        ? "bg-emerald-600 text-white font-semibold shadow-xs"
                        : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    Padi
                  </button>
                  <button
                    onClick={() => setCropFilter("jagung")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      cropFilter === "jagung"
                        ? "bg-amber-600 text-white font-semibold shadow-xs"
                        : "text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    Jagung
                  </button>
                </div>

                {/* Filter Status NDVI */}
                <div className="relative">
                  <select
                    value={ndviCategoryFilter}
                    onChange={(e) => setNdviCategoryFilter(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="semua">Semua Status NDVI</option>
                    <option value="kritis">Kritis (NDVI &lt; 0.30)</option>
                    <option value="waspada">Waspada (0.30 - 0.55)</option>
                    <option value="sehat">Sehat (≥ 0.55)</option>
                    <option value="nodata">Belum Ada Data Satelit</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tabel Data */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-900"
                      onClick={() => toggleSort("name")}
                    >
                      <div className="flex items-center">
                        <span>Nama Petak</span>
                        {renderSortIcon("name")}
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3">Komoditas</th>
                    <th scope="col" className="px-4 py-3">Varietas</th>
                    <th scope="col" className="px-4 py-3">Fase Fenologi</th>
                    <th
                      scope="col"
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-900"
                      onClick={() => toggleSort("current_hst")}
                    >
                      <div className="flex items-center">
                        <span>Usia Tanam</span>
                        {renderSortIcon("current_hst")}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-900"
                      onClick={() => toggleSort("area_hectares")}
                    >
                      <div className="flex items-center">
                        <span>Luas (Ha)</span>
                        {renderSortIcon("area_hectares")}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-900"
                      onClick={() => toggleSort("latest_ndvi")}
                    >
                      <div className="flex items-center">
                        <span>NDVI Terakhir</span>
                        {renderSortIcon("latest_ndvi")}
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3">Status Kesehatan</th>
                    <th scope="col" className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loadingDashboard ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                          <span className="text-sm font-medium">Memuat data petak lahan...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSortedPlots.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                          <Layers className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">Tidak ada petak yang sesuai kriteria</p>
                          <p className="text-xs text-slate-400">
                            Coba ubah kata kunci pencarian atau sesuaikan pilihan filter komoditas / status NDVI.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedPlots.map((plot) => {
                      const details = getNdviDetails(plot.latest_ndvi);
                      const isSelected = selectedPlotId === plot.id;
                      const StatusIcon = details.icon;

                      return (
                        <tr
                          key={plot.id}
                          onClick={() => handleFocusPlotOnMap(plot)}
                          className={`transition-colors cursor-pointer hover:bg-slate-50 ${
                            isSelected ? "bg-emerald-50/60 font-medium" : ""
                          }`}
                        >
                          {/* Nama Petak */}
                          <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: details.color }}
                                title={`NDVI: ${plot.latest_ndvi ?? "N/A"}`}
                              />
                              <span>{plot.name}</span>
                            </div>
                          </td>

                          {/* Komoditas */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                plot.crop_type === "padi"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}
                            >
                              {plot.crop_type === "padi" ? (
                                <Sprout className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Wheat className="w-3 h-3 text-amber-600" />
                              )}
                              <span className="capitalize">{plot.crop_type}</span>
                            </span>
                          </td>

                          {/* Varietas */}
                          <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                            {plot.variety_name || "-"}
                          </td>

                          {/* Fase Fenologi */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[11px]">
                              {plot.current_phase || "Vegetatif"}
                            </span>
                          </td>

                          {/* HST */}
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                            {plot.current_hst} HST
                          </td>

                          {/* Luas */}
                          <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-700">
                            {plot.area_hectares} ha
                          </td>

                          {/* NDVI Terakhir */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {plot.latest_ndvi !== null && plot.latest_ndvi !== undefined ? (
                              <span
                                className="font-extrabold text-sm"
                                style={{ color: details.color }}
                              >
                                {Number(plot.latest_ndvi).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                Belum ada
                              </span>
                            )}
                          </td>

                          {/* Status Kesehatan */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${details.badgeBg} ${details.badgeText} ${details.badgeBorder}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              <span>{details.status}</span>
                            </span>
                          </td>

                          {/* Aksi */}
                          <td className="px-4 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleFocusPlotOnMap(plot)}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Fokuskan Petak di Peta"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <Link
                                href={`/petak/${plot.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                              >
                                <span>Lihat Detail</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Tabel */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <span>
                Menampilkan <strong>{filteredAndSortedPlots.length}</strong> petak dari total{" "}
                <strong>{dashboardData?.plots?.length || 0}</strong> petak terdaftar.
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/petak-baru"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Tambah Petak Baru</span>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
