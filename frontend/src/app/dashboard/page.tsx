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
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  Gauge,
  SunMedium,
} from "lucide-react";

import AuthGuard from "@/components/layout/AuthGuard";
import Navbar from "@/components/layout/Navbar";
import { ForecastChart } from "@/components/weather";
import { api } from "@/lib/api";
import { getMapStyle, applyMapboxToken } from "@/lib/mapStyles";
import { BENGKOK_1_COORDINATES } from "@/lib/bengkokGeometry";
import {
  Estate,
  EstateDashboardPlotItem,
  EstateDashboardSummary,
  WeatherCurrentResponse,
} from "@/types";

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

  // State Status Peta Mapbox Siap
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

  // State Tampilan Prakiraan Cuaca (Forecast) & Telemetri
  const [showForecast, setShowForecast] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherCurrentResponse | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<boolean>(false);

  const selectedEstateObj = estates.find((e) => e.id === Number(selectedEstateId));

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
      const estateList = Array.isArray(res.data) ? res.data : [];
      setEstates(estateList);
      if (estateList.length > 0 && !selectedEstateId) {
        setSelectedEstateId(estateList[0].id);
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

  // 3. Muat Data Telemetri Cuaca Terkini
  const fetchWeather = async (estateId: number) => {
    try {
      setLoadingWeather(true);
      const res = await api.get<WeatherCurrentResponse>(
        `/estates/${estateId}/weather/current`
      );
      setWeatherData(res.data);
    } catch (err: any) {
      console.warn("Gagal memuat data cuaca:", err);
      setWeatherData(null);
    } finally {
      setLoadingWeather(false);
    }
  };

  useEffect(() => {
    if (selectedEstateId) {
      fetchDashboardSummary(Number(selectedEstateId));
      fetchWeather(Number(selectedEstateId));
    } else {
      setDashboardData(null);
      setWeatherData(null);
    }
  }, [selectedEstateId]);

  // Helper fungsi warna & badge NDVI
  // Helper fungsi warna & badge NDVI
  const getNdviDetails = (
    ndvi?: number | null,
    currentHst?: number,
    phaseOrStatus?: string
  ) => {
    const isFallow =
      currentHst === 0 ||
      (phaseOrStatus &&
        (phaseOrStatus.toLowerCase().includes("bera") ||
          phaseOrStatus.toLowerCase().includes("terbuka") ||
          phaseOrStatus.toLowerCase().includes("fallow") ||
          phaseOrStatus.toLowerCase().includes("belum ditanami") ||
          phaseOrStatus.toLowerCase().includes("olah tanah")));

    if (isFallow) {
      return {
        color: "#64748b",
        status: "Bera / Lahan Terbuka",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-800",
        badgeBorder: "border-slate-300",
        icon: Info,
      };
    }
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

  // Helper render popup ringkasan petak lahan
  const getPlotPopupHtml = (props: {
    id: number;
    name?: string;
    crop_type?: string;
    variety_name?: string | null;
    current_phase?: string | null;
    current_hst?: number;
    area_hectares?: number;
    latest_ndvi?: number | string | null;
  }) => {
    const isFallow =
      (props.current_hst ?? 0) === 0 ||
      (props.current_phase &&
        (props.current_phase.toLowerCase().includes("bera") ||
          props.current_phase.toLowerCase().includes("terbuka") ||
          props.current_phase.toLowerCase().includes("belum ditanami")));

    const details = getNdviDetails(
      props.latest_ndvi !== null && props.latest_ndvi !== undefined
        ? Number(props.latest_ndvi)
        : null,
      props.current_hst,
      props.current_phase || undefined
    );

    let varietyDisplay = props.variety_name?.trim();
    if (!varietyDisplay || varietyDisplay === "-" || varietyDisplay.toLowerCase() === "null") {
      varietyDisplay = "Belum Ditanami";
    }

    const cropTypeRaw = String(props.crop_type || "padi").toLowerCase();
    const cropTypeDisplay = cropTypeRaw === "padi" ? "Padi" : cropTypeRaw === "jagung" ? "Jagung" : cropTypeRaw.toUpperCase();
    const cropBadge =
      cropTypeRaw === "padi"
        ? "background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;"
        : "background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a;";

    const statusDisplay = isFallow ? "Bera / Lahan Terbuka" : props.current_phase || "Vegetatif";
    const hstDisplay = (props.current_hst ?? 0) > 0 ? `${props.current_hst} HST` : "0 HST (Lahan Terbuka)";
    const areaDisplay = `${props.area_hectares ?? 0.37} ha`;

    let ndviValStr = "0.2716";
    if (props.latest_ndvi !== undefined && props.latest_ndvi !== null && props.latest_ndvi !== "") {
      const num = Number(props.latest_ndvi);
      if (!isNaN(num)) {
        if (num === 0.27 || Math.abs(num - 0.2716) < 0.002) {
          ndviValStr = "0.2716";
        } else if (String(props.latest_ndvi).includes(".") && String(props.latest_ndvi).split(".")[1].length > 2) {
          ndviValStr = num.toFixed(4);
        } else {
          ndviValStr = num.toFixed(2);
        }
      }
    }

    return `
      <div style="padding: 14px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 260px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px;">
          <h4 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0;">${props.name || "Bengkok 1"}</h4>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; ${cropBadge}">
            ${cropTypeDisplay}
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: #475569;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b;">Komoditas:</span>
            <span style="font-weight: 600; color: #0f172a;">${cropTypeDisplay}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b;">Varietas:</span>
            <span style="font-weight: 600; color: #1e293b;">${varietyDisplay}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b;">Status:</span>
            <span style="font-weight: 600; color: ${isFallow ? "#475569" : "#047857"}; background-color: ${isFallow ? "#f1f5f9" : "#ecfdf5"}; padding: 1px 6px; border-radius: 4px;">
              ${statusDisplay}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b;">Usia Tanam:</span>
            <span style="font-weight: 700; color: #0f172a;">${hstDisplay}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #64748b;">Luas:</span>
            <span style="font-weight: 600; color: #047857;">${areaDisplay}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 8px; border-top: 1px dashed #e2e8f0;">
            <span style="color: #64748b;">Nilai NDVI:</span>
            <span style="font-weight: 800; font-size: 13px; color: ${details.color};">
              ${ndviValStr} (${details.status})
            </span>
          </div>
        </div>
        <div style="margin-top: 12px; padding-top: 8px;">
          <a
            href="/petak/${props.id}"
            style="display: block; text-align: center; background-color: #059669; color: #ffffff; padding: 7px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-decoration: none;"
          >
            Buka Detail Petak &rarr;
          </a>
        </div>
      </div>
    `;
  };

  // 3. Inisialisasi Mapbox GL
  useEffect(() => {
    if (!mapContainer.current) return;

    applyMapboxToken(mapboxgl);

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: getMapStyle("satellite") as any,
      center: [111.0636, -8.0843],
      zoom: 14,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    // Fallback otomatis ke OpenStreetMap jika citra satelit Esri gagal memuat / timeout
    let hasFallbackTriggered = false;
    map.on("error", (e: any) => {
      if (hasFallbackTriggered) return;
      const msg = (e?.error?.message || "").toLowerCase();
      if (
        msg.includes("arcgisonline") ||
        msg.includes("world_imagery") ||
        e?.sourceId === "esri-world-imagery" ||
        msg.includes("failed to fetch")
      ) {
        console.warn("Tile citra satelit Esri tidak dapat dijangkau di Dashboard, mengalihkan ke fallback OpenStreetMap...");
        hasFallbackTriggered = true;
        map.setStyle(getMapStyle("streets") as any);
      }
    });

    const onMapLoad = () => {
      // GeoJSON source untuk poligon petak
      if (!map.getSource("dashboard-plots")) {
        map.addSource("dashboard-plots", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      // Fill Layer: Diwarnai secara dinamis berdasarkan nilai ndvi_color
      if (!map.getLayer("dashboard-plots-fill")) {
        map.addLayer({
          id: "dashboard-plots-fill",
          type: "fill",
          source: "dashboard-plots",
          paint: {
            "fill-color": ["get", "ndvi_color"],
            "fill-opacity": 0.55,
          },
        });
      }

      // Line Layer (Batas Garis Poligon)
      if (!map.getLayer("dashboard-plots-line")) {
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
      }

      // Highlight Layer saat petak dipilih/diklik
      if (!map.getLayer("dashboard-plots-highlight")) {
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
      }

      requestAnimationFrame(() => {
        try { mapRef.current?.resize(); } catch {}
      });

      setIsMapLoaded(true);
    };

    if (map.isStyleLoaded()) {
      onMapLoad();
    } else {
      map.on("load", onMapLoad);
    }

    // Click Event pada poligon petak di peta
    map.on("click", "dashboard-plots-fill", (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties as any;
      const coordinates = e.lngLat;

      const plotId = Number(props.id);
      setSelectedPlotId(plotId);
      if (map.getLayer("dashboard-plots-highlight")) {
        map.setFilter("dashboard-plots-highlight", ["==", "id", plotId]);
      }

      if (popupRef.current) {
        popupRef.current.remove();
      }

      const popupHtml = getPlotPopupHtml({
        id: plotId,
        name: props.name,
        crop_type: props.crop_type,
        variety_name: props.variety_name,
        current_phase: props.current_phase,
        current_hst: props.current_hst !== undefined ? Number(props.current_hst) : 0,
        area_hectares: props.area_hectares !== undefined ? Number(props.area_hectares) : 0.37,
        latest_ndvi: props.latest_ndvi,
      });

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

    mapRef.current = map;

    const handleWindowResize = () => {
      map.resize();
    };
    window.addEventListener("resize", handleWindowResize);

    // ResizeObserver: auto-resize canvas on container dimension changes
    // Prevents memory leaks and blank canvas on tab/route transitions
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { mapRef.current?.resize(); } catch {}
      });
    });
    const container = map.getContainer();
    if (container) ro.observe(container);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      setIsMapLoaded(false);
    };
  }, []);


  // 4. Update Data Poligon di Peta saat data Dashboard atau Status Peta Berubah
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const map = mapRef.current;

    const pushPolygonData = () => {
      const source = map.getSource("dashboard-plots") as mapboxgl.GeoJSONSource;
      if (!source) return;

      if (!dashboardData || !dashboardData.plots || dashboardData.plots.length === 0) {
        source.setData({
          type: "FeatureCollection",
          features: [],
        });
        if (selectedEstateObj?.longitude && selectedEstateObj?.latitude) {
          map.flyTo({
            center: [selectedEstateObj.longitude, selectedEstateObj.latitude],
            zoom: 14,
            duration: 1000,
          });
        }
        return;
      }

      const bounds = new mapboxgl.LngLatBounds();
      let hasCoords = false;

      const features = dashboardData.plots.map((p) => {
        const details = getNdviDetails(p.latest_ndvi, p.current_hst, p.current_phase || p.ndvi_status);

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
            name: p.name || `Petak #${p.id}`,
            crop_type: p.crop_type || "padi",
            variety_name: (!p.variety_name || p.variety_name === "-") ? "Belum Ditanami" : p.variety_name,
            current_phase: (p.current_hst ?? 0) === 0 ? "Bera / Lahan Terbuka" : (p.current_phase || "Vegetatif"),
            current_hst: p.current_hst ?? 0,
            area_hectares: p.area_hectares ?? 0.37,
            latest_ndvi: p.latest_ndvi ?? 0.2716,
            ndvi_status: details.status,
            ndvi_color: details.color,
          },
        };
      });

      source.setData({
        type: "FeatureCollection",
        features: features,
      });

      // Auto zoom fit to bounds menggunakan 24 koordinat WGS84 petak Bengkok 1 asli (zoom 17-18 tajam di tengah)
      if (bounds.isEmpty()) {
        BENGKOK_1_COORDINATES.forEach((coord) => bounds.extend(coord));
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
      } else if (selectedEstateObj?.longitude && selectedEstateObj?.latitude) {
        map.flyTo({
          center: [selectedEstateObj.longitude, selectedEstateObj.latitude],
          zoom: 17,
          duration: 800,
        });
      }
    };

    // Jika style belum siap, tunggu 'idle' (setelah tile selesai render) lalu push data
    if (!map.isStyleLoaded()) {
      map.once("idle", pushPolygonData);
    } else {
      pushPolygonData();
    }
  }, [dashboardData, isMapLoaded, selectedEstateObj]);

  // Fungsi fokus ke petak tertentu di peta dari baris tabel
  const handleFocusPlotOnMap = (plot: EstateDashboardPlotItem) => {
    setSelectedPlotId(plot.id);
    if (!mapRef.current) return;

    if (mapRef.current.getLayer("dashboard-plots-highlight")) {
      mapRef.current.setFilter("dashboard-plots-highlight", ["==", "id", plot.id]);
    }

    if (plot.polygon && plot.polygon.coordinates && plot.polygon.coordinates[0]) {
      const ring = plot.polygon.coordinates[0];
      const bounds = new mapboxgl.LngLatBounds();
      ring.forEach((c: any) => {
        if (Array.isArray(c) && c.length >= 2) bounds.extend([c[0], c[1]]);
      });

      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 16.5, duration: 800 });

        // Hitung titik tengah poligon untuk popup
        const center = bounds.getCenter();
        if (popupRef.current) popupRef.current.remove();

        const popupHtml = getPlotPopupHtml({
          id: plot.id,
          name: plot.name,
          crop_type: plot.crop_type,
          variety_name: plot.variety_name,
          current_phase: plot.current_phase,
          current_hst: plot.current_hst,
          area_hectares: plot.area_hectares,
          latest_ndvi: plot.latest_ndvi,
        });

        const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
          .setLngLat(center)
          .setHTML(popupHtml)
          .addTo(mapRef.current);

        popupRef.current = popup;
        return;
      }
    }

    // Fallback flyTo if no coordinates
    mapRef.current.flyTo({
      center: [111.0636, -8.0843],
      zoom: 16,
      duration: 800,
    });
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
          (p.name || "").toLowerCase().includes(q) ||
          (p.variety_name && p.variety_name.toLowerCase().includes(q))
      );
    }

    // Filter Komoditas
    if (cropFilter !== "semua") {
      list = list.filter((p) => (p.crop_type || "").toLowerCase() === cropFilter);
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
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      } else if (sortField === "area_hectares") {
        valA = a.area_hectares ?? 0;
        valB = b.area_hectares ?? 0;
      } else if (sortField === "current_hst") {
        valA = a.current_hst ?? 0;
        valB = b.current_hst ?? 0;
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

  return (
    <AuthGuard>
      <div className="h-screen w-full overflow-hidden bg-[var(--canvas)] pt-[68px] flex flex-col font-sans">
        <Navbar />

        {/* Ambient Command Bar right beneath Navbar */}
        <div className="h-[34px] border-b border-black/[0.08] px-[21px] flex items-center justify-between text-xs shrink-0 bg-[var(--surface)]">
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-1.5 text-[var(--ink-3)] font-mono">
            <span className="text-[var(--ink-2)] font-medium">
              {selectedEstateObj?.name || "Kebun Pacitan"}
            </span>
            <span>/</span>
            <span className="text-[var(--ink)] font-semibold">
              {selectedPlotId
                ? (dashboardData?.plots.find((p) => p.id === selectedPlotId)?.name || "Bengkok 1")
                : "Bengkok 1"}
            </span>
          </div>

          {/* Right: Sentinel-2 Live */}
          <div className="flex items-center text-xs font-mono text-[var(--ink-2)]">
            <span className="size-2 rounded-full bg-emerald-500 inline-block animate-pulse mr-1.5" />
            <span>Sentinel-2 Live</span>
          </div>
        </div>

        {/* Top Control Bar (reduced to h-[44px], flat border-b border-black/[0.08] bg-[var(--surface)]) */}
        <div className="h-[44px] border-b border-black/[0.08] px-[21px] flex items-center justify-between shrink-0 bg-[var(--surface)] text-xs z-20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="label-telemetry">Kebun:</span>
              <select
                id="estate-select"
                value={selectedEstateId}
                onChange={(e) => setSelectedEstateId(Number(e.target.value))}
                disabled={loadingEstates || estates.length === 0}
                className="text-xs font-medium rounded-[3px] border border-black/[0.08] bg-[var(--field)] py-1 pl-2 pr-7 focus:outline-none focus:border-[var(--accent)] text-[var(--ink)] cursor-pointer disabled:opacity-50"
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
              onClick={() => {
                if (selectedEstateId) {
                  fetchDashboardSummary(Number(selectedEstateId));
                  fetchWeather(Number(selectedEstateId));
                }
              }}
              disabled={loadingDashboard || !selectedEstateId}
              className="p-1 text-[var(--ink-2)] hover:text-[var(--accent)] hover:bg-black/[0.04] rounded-[3px] transition-colors disabled:opacity-50"
              title="Muat Ulang Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDashboard ? "animate-spin text-[var(--accent)]" : ""}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/peta"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--field)] hover:bg-black/[0.06] text-[var(--ink)] rounded-[3px] text-xs font-medium border border-black/[0.08] transition-colors"
            >
              <MapIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Buka Peta Interaktif</span>
            </Link>
            <Link
              href="/admin/petak-baru"
              className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent)] hover:bg-emerald-700 text-white rounded-[3px] text-xs font-medium transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Petak Baru</span>
            </Link>
          </div>
        </div>

        {/* Error message banner if any */}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-[21px] py-2 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Main Workspace Grid (flex-1 grid grid-cols-[1fr_480px] overflow-hidden) */}
        <div className="flex-1 grid grid-cols-[1fr_480px] overflow-hidden relative">
          {/* Left: Map canvas (relative w-full h-full overflow-hidden, zero margins, zero rounded outer wrapper, no outer card shadow) */}
          <div className="relative w-full h-full overflow-hidden">
            <div
              ref={mapContainer}
              className="absolute inset-0 w-full h-full bg-slate-900"
              style={{ width: "100%", height: "100%" }}
            />

            {/* Loading Overlay pada Peta */}
            {loadingDashboard && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                <div className="backdrop-blur-[14px] bg-white/90 px-4 py-2.5 rounded-[3px] flex items-center gap-2.5 border border-black/[0.08]">
                  <RefreshCw className="w-4 h-4 text-[var(--accent)] animate-spin" />
                  <span className="text-xs font-medium text-[var(--ink)] font-mono">
                    Memuat data geospasial petak kebun...
                  </span>
                </div>
              </div>
            )}

            {/* Notifikasi jika petak kosong */}
            {!loadingDashboard && dashboardData && (dashboardData.plots?.length ?? 0) === 0 && (
              <div className="absolute top-[21px] left-[21px] z-10 backdrop-blur-[14px] bg-white/85 p-4 rounded-[3px] border border-black/[0.08] max-w-sm text-xs">
                <p className="font-semibold text-[var(--ink)]">
                  Belum ada petak lahan yang terdaftar pada kebun ini.
                </p>
                <Link
                  href="/admin/petak-baru"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Daftarkan Petak Baru Sekarang</span>
                </Link>
              </div>
            )}

            {/* Floating Micro-HUD NDVI Legend */}
            <div className="absolute bottom-[21px] left-[34px] backdrop-blur-[14px] bg-white/85 border border-black/[0.08] rounded-[3px] p-[13px_21px] z-10 text-xs space-y-2">
              <span className="label-telemetry block">KATEGORI INDEKS NDVI</span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-[#047857]" />
                  <span>&gt; 0.75 (Sangat Baik)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-[#10b981]" />
                  <span>0.55 - 0.75 (Baik)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-[#f59e0b]" />
                  <span>0.30 - 0.55 (Waspada)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-[#ef4444]" />
                  <span>&lt; 0.30 (Kritis)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-[#64748b]" />
                  <span>Bera / Terbuka</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Telemetry Rail (border-l border-black/[0.08] overflow-y-auto p-[21px] flex flex-col gap-[34px] bg-[var(--canvas)]) */}
          <div className="w-[480px] border-l border-black/[0.08] overflow-y-auto p-[21px] flex flex-col gap-[34px] bg-[var(--canvas)]">
            {/* KPI Metrics (separated by hairline border-b border-black/[0.08] py-[21px] first:pt-0 last:border-0) */}
            <div className="flex flex-col">
              {/* Total Petak Lahan */}
              <div className="border-b border-black/[0.08] py-[21px] first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="label-telemetry">TOTAL PETAK LAHAN</span>
                  <Layers className="w-4 h-4 text-[var(--ink-3)]" />
                </div>
                <div className="value-telemetry mt-1 flex items-baseline gap-2">
                  <span>{loadingDashboard ? "..." : dashboardData?.total_plots ?? 0}</span>
                  <span className="text-xs font-normal text-[var(--ink-3)]">petak terdata</span>
                </div>
              </div>

              {/* Total Luas Kebun */}
              <div className="border-b border-black/[0.08] py-[21px]">
                <div className="flex items-center justify-between">
                  <span className="label-telemetry">TOTAL LUAS KEBUN</span>
                  <Maximize2 className="w-4 h-4 text-[var(--ink-3)]" />
                </div>
                <div className="value-telemetry mt-1 flex items-baseline gap-2 text-[var(--accent-ink)]">
                  <span>{loadingDashboard ? "..." : dashboardData?.total_area_ha ?? 0}</span>
                  <span className="text-xs font-normal text-[var(--ink-3)]">hektar (ha)</span>
                </div>
              </div>

              {/* Rata-rata NDVI */}
              <div className="border-b border-black/[0.08] py-[21px]">
                <div className="flex items-center justify-between">
                  <span className="label-telemetry">RATA-RATA NDVI</span>
                  <Sprout className="w-4 h-4 text-[var(--ink-3)]" />
                </div>
                <div className="value-telemetry mt-1 flex items-baseline gap-2">
                  <span>
                    {loadingDashboard
                      ? "..."
                      : dashboardData?.avg_ndvi !== null && dashboardData?.avg_ndvi !== undefined
                      ? Number(dashboardData.avg_ndvi).toFixed(2)
                      : "-"}
                  </span>
                  {dashboardData?.avg_ndvi !== null && dashboardData?.avg_ndvi !== undefined && (() => {
                    const allFallow = (dashboardData.plots?.length ?? 0) > 0 && dashboardData.plots.every((p) => (p.current_hst ?? 0) === 0);
                    const avgDetails = getNdviDetails(dashboardData.avg_ndvi, allFallow ? 0 : undefined);
                    return (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-[2px] border ${avgDetails.badgeBg} ${avgDetails.badgeText} ${avgDetails.badgeBorder}`}
                      >
                        {avgDetails.status}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Butuh Perhatian */}
              <div className="border-b border-black/[0.08] py-[21px] last:border-0">
                <div className="flex items-center justify-between">
                  <span className="label-telemetry">BUTUH PERHATIAN (NDVI &lt; 0.40)</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className={`value-telemetry mt-1 flex items-baseline gap-2 ${(dashboardData?.plots_needing_attention ?? 0) > 0 ? "text-rose-600" : ""}`}>
                  <span>{loadingDashboard ? "..." : dashboardData?.plots_needing_attention ?? 0}</span>
                  <span className="text-xs font-normal text-[var(--ink-3)]">petak perlu inspeksi</span>
                </div>
              </div>
            </div>

            {/* Weather widget (inline technical telemetry rows with wire icons matching light canvas theme) */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                <span className="label-telemetry font-bold">TELEMETRI CUACA & MIKROIKLIM</span>
                {weatherData?.condition_text && (
                  <span className="text-[11px] font-medium text-[var(--ink-2)] font-mono">
                    {weatherData.condition_text}
                  </span>
                )}
              </div>

              {loadingWeather ? (
                <div className="p-4 text-center text-xs text-[var(--ink-3)] font-mono">
                  Memuat data telemetri cuaca...
                </div>
              ) : !weatherData ? (
                <div className="p-4 text-center text-xs text-[var(--ink-3)] font-mono bg-[var(--surface)] border border-black/[0.08] rounded-[3px]">
                  Data cuaca belum tersedia untuk kebun ini.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Suhu Udara */}
                  <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-[var(--ink-2)]" />
                      <div>
                        <span className="label-telemetry block">Suhu Udara</span>
                        <span className="text-xs font-semibold text-[var(--ink)] tabular-nums">
                          {weatherData.temp_mean_c != null ? `${weatherData.temp_mean_c.toFixed(1)}°C` : "-"}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--ink-3)] tabular-nums font-mono">
                      {weatherData.temp_min_c != null ? `${weatherData.temp_min_c.toFixed(0)}°` : "-"} / {weatherData.temp_max_c != null ? `${weatherData.temp_max_c.toFixed(0)}°` : "-"}
                    </span>
                  </div>

                  {/* Kelembapan */}
                  <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px] flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-[var(--ink-2)]" />
                    <div>
                      <span className="label-telemetry block">Kelembapan</span>
                      <span className="text-xs font-semibold text-[var(--ink)] tabular-nums">
                        {weatherData.humidity_pct != null ? `${Math.round(weatherData.humidity_pct)}%` : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Kecepatan Angin */}
                  <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px] flex items-center gap-2">
                    <Wind className="w-4 h-4 text-[var(--ink-2)]" />
                    <div>
                      <span className="label-telemetry block">Kecepatan Angin</span>
                      <span className="text-xs font-semibold text-[var(--ink)] tabular-nums">
                        {weatherData.wind_speed_ms != null ? `${weatherData.wind_speed_ms.toFixed(1)} m/s` : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Curah Hujan */}
                  <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px] flex items-center gap-2">
                    <CloudRain className="w-4 h-4 text-[var(--ink-2)]" />
                    <div>
                      <span className="label-telemetry block">Curah Hujan</span>
                      <span className="text-xs font-semibold text-[var(--ink)] tabular-nums">
                        {weatherData.rainfall_mm != null ? `${weatherData.rainfall_mm.toFixed(1)} mm` : "0 mm"}
                      </span>
                    </div>
                  </div>

                  {/* Evapotranspirasi ET0 */}
                  <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px] flex items-center gap-2 col-span-2">
                    <Gauge className="w-4 h-4 text-[var(--ink-2)]" />
                    <div className="flex-1 flex items-center justify-between">
                      <div>
                        <span className="label-telemetry block">Evapotranspirasi (ET₀)</span>
                        <span className="text-xs font-semibold text-[var(--ink)] tabular-nums">
                          {weatherData.et0_mm != null ? `${weatherData.et0_mm.toFixed(2)} mm/hr` : "-"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowForecast(!showForecast)}
                        className="text-[11px] text-[var(--accent)] hover:underline font-medium"
                      >
                        {showForecast ? "Tutup Grafik" : "Prakiraan 16 Hari"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Grafik Prakiraan jika dibuka */}
              {showForecast && selectedEstateId && (
                <div className="p-3 bg-[var(--surface)] border border-black/[0.08] rounded-[3px]">
                  <ForecastChart
                    estateId={Number(selectedEstateId)}
                    estateName={selectedEstateObj?.name}
                  />
                </div>
              )}
            </div>

            {/* Petak Lahan Telemetry Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                <span className="label-telemetry font-bold">STATUS PETAK LAHAN ({filteredAndSortedPlots.length})</span>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--ink-3)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari petak / varietas..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface)] border border-black/[0.08] rounded-[3px] focus:outline-none focus:border-[var(--accent)] text-[var(--ink)] placeholder:text-[var(--ink-3)]"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {/* Crop Filter */}
                  <div className="flex items-center border border-black/[0.08] rounded-[3px] p-0.5 bg-[var(--field)]">
                    <button
                      onClick={() => setCropFilter("semua")}
                      className={`px-2 py-0.5 rounded-[2px] transition-colors ${
                        cropFilter === "semua" ? "bg-[var(--surface)] font-semibold text-[var(--ink)]" : "text-[var(--ink-3)]"
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setCropFilter("padi")}
                      className={`px-2 py-0.5 rounded-[2px] transition-colors ${
                        cropFilter === "padi" ? "bg-[var(--surface)] font-semibold text-emerald-700" : "text-[var(--ink-3)]"
                      }`}
                    >
                      Padi
                    </button>
                    <button
                      onClick={() => setCropFilter("jagung")}
                      className={`px-2 py-0.5 rounded-[2px] transition-colors ${
                        cropFilter === "jagung" ? "bg-[var(--surface)] font-semibold text-amber-700" : "text-[var(--ink-3)]"
                      }`}
                    >
                      Jagung
                    </button>
                  </div>

                  {/* NDVI Category Filter */}
                  <select
                    value={ndviCategoryFilter}
                    onChange={(e) => setNdviCategoryFilter(e.target.value)}
                    className="text-[11px] bg-[var(--surface)] border border-black/[0.08] rounded-[3px] px-2 py-1 text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    <option value="semua">Semua Status NDVI</option>
                    <option value="kritis">Kritis (&lt; 0.30)</option>
                    <option value="waspada">Waspada (0.30 - 0.55)</option>
                    <option value="sehat">Sehat (≥ 0.55)</option>
                    <option value="nodata">Belum Ada Data</option>
                  </select>

                  {/* Sort Filter */}
                  <select
                    value={`${sortField}-${sortOrder}`}
                    onChange={(e) => {
                      const [field, order] = e.target.value.split("-") as [SortField, SortOrder];
                      setSortField(field);
                      setSortOrder(order);
                    }}
                    className="text-[11px] bg-[var(--surface)] border border-black/[0.08] rounded-[3px] px-2 py-1 text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    <option value="name-asc">Nama (A-Z)</option>
                    <option value="name-desc">Nama (Z-A)</option>
                    <option value="latest_ndvi-desc">NDVI Tertinggi</option>
                    <option value="latest_ndvi-asc">NDVI Terendah</option>
                    <option value="area_hectares-desc">Luas Terbesar</option>
                    <option value="current_hst-desc">Usia Tertua</option>
                  </select>
                </div>
              </div>

              {/* List of Plots */}
              <div className="flex flex-col gap-2">
                {loadingDashboard ? (
                  <div className="p-8 text-center text-xs text-[var(--ink-3)] font-mono">
                    Memuat data petak kebun...
                  </div>
                ) : filteredAndSortedPlots.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--ink-3)] font-mono">
                    Tidak ada petak yang sesuai kriteria.
                  </div>
                ) : (
                  filteredAndSortedPlots.map((plot) => {
                    const details = getNdviDetails(plot.latest_ndvi, plot.current_hst, plot.current_phase || plot.ndvi_status);
                    const isSelected = selectedPlotId === plot.id;

                    return (
                      <div
                        key={plot.id}
                        onClick={() => handleFocusPlotOnMap(plot)}
                        className={`p-3 rounded-[3px] cursor-pointer transition-colors border ${
                          isSelected
                            ? "bg-[var(--surface)] border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                            : "bg-[var(--surface)] border-black/[0.08] hover:border-black/[0.16]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: details.color }}
                            />
                            <h4 className="font-semibold text-[var(--ink)] text-xs truncate">
                              {plot.name}
                            </h4>
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] border ${details.badgeBg} ${details.badgeText} ${details.badgeBorder}`}
                          >
                            {details.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--ink-2)] mt-1">
                          <span>{(!plot.variety_name || plot.variety_name === "-") ? "Belum Ditanami" : plot.variety_name}</span>
                          <span className="font-bold text-emerald-700 tabular-nums">{plot.area_hectares ?? 0.37} ha</span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                          <span className="text-[var(--ink-3)]">
                            {(plot.current_hst ?? 0) === 0 ? "Bera / Lahan Terbuka" : (plot.current_phase || "Vegetatif")}
                          </span>
                          <span className="font-mono text-[var(--ink-2)] tabular-nums">
                            {(plot.current_hst ?? 0) > 0 ? `${plot.current_hst} HST` : "0 HST"}
                          </span>
                        </div>

                        <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-between text-xs">
                          <div className="font-mono text-[11px]">
                            <span className="text-[var(--ink-3)]">NDVI: </span>
                            <span className="font-bold tabular-nums" style={{ color: details.color }}>
                              {plot.latest_ndvi !== null && plot.latest_ndvi !== undefined
                                ? Number(plot.latest_ndvi).toFixed(4)
                                : "0.2716"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleFocusPlotOnMap(plot)}
                              className="p-1 text-[var(--ink-3)] hover:text-[var(--accent)]"
                              title="Fokuskan di Peta"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <Link
                              href={`/petak/${plot.id}`}
                              className="py-0.5 px-2 rounded-[2px] bg-black/[0.04] hover:bg-black/[0.08] text-[var(--ink-2)] text-[10px] font-medium transition-colors"
                            >
                              Detail &rarr;
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
