"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  MapPin,
  Sprout,
  Wheat,
  PlusCircle,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  Filter,
  Eye,
  Info,
  Maximize2,
  X,
  Radio,
  Activity,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import PlotSatellitePanel from "@/components/satellite/PlotSatellitePanel";
import TimelineSlider from "@/components/map/TimelineSlider";
import SatelliteOverlayControl from "@/components/map/SatelliteOverlayControl";
import { api } from "@/lib/api";
import {
  Estate,
  EstateIndicesTimeline,
  Plot,
  PlotSummary,
  SatelliteTileInfo,
} from "@/types";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example";

// Helper konversi nilai NDVI ke kode warna HEX
const getNdviColor = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return "#94a3b8"; // slate-400 (belum ada data)
  if (val < 0.3) return "#ef4444"; // red-500 (kritis)
  if (val < 0.55) return "#f59e0b"; // amber-500 (waspada)
  if (val <= 0.75) return "#10b981"; // emerald-500 (baik)
  return "#047857"; // emerald-700 (sangat baik)
};

export default function PetaLahanPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Data state
  const [estates, setEstates] = useState<Estate[]>([]);
  const [selectedEstateId, setSelectedEstateId] = useState<number | "">("");
  const [plots, setPlots] = useState<Plot[]>([]);
  const [summary, setSummary] = useState<PlotSummary | null>(null);

  // Filters & View state
  const [cropFilter, setCropFilter] = useState<"semua" | "padi" | "jagung">("semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [satelliteModalPlot, setSatelliteModalPlot] = useState<Plot | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mapStyleType, setMapStyleType] = useState<"satellite" | "streets">("satellite");

  // Loading state
  const [loadingEstates, setLoadingEstates] = useState(true);
  const [loadingPlots, setLoadingPlots] = useState(false);

  // --- Tiket 15: Timeline Slider Temporal State ---
  const [timelineDates, setTimelineDates] = useState<string[]>([]);
  const [timelineData, setTimelineData] = useState<Record<string, Record<string, number | null>>>({});
  const [activeDateIndex, setActiveDateIndex] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isNdviMode, setIsNdviMode] = useState<boolean>(true);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);

  // --- Tiket 15: Satellite Raster Layer Overlay State ---
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState<boolean>(false);
  const [satelliteVisType, setSatelliteVisType] = useState<"true_color" | "false_color">("true_color");
  const [satelliteOpacity, setSatelliteOpacity] = useState<number>(0.85);
  const [loadingSatelliteTile, setLoadingSatelliteTile] = useState<boolean>(false);
  const [satelliteTileInfo, setSatelliteTileInfo] = useState<SatelliteTileInfo | null>(null);

  // 1. Initial Load: Estates
  useEffect(() => {
    async function loadEstates() {
      try {
        setLoadingEstates(true);
        const res = await api.get<Estate[]>("/estates");
        setEstates(res.data);
        if (res.data.length > 0) {
          setSelectedEstateId(res.data[0].id);
        }
      } catch (err) {
        console.error("Gagal memuat perkebunan/estate:", err);
      } finally {
        setLoadingEstates(false);
      }
    }
    loadEstates();
  }, []);

  // 2. Fetch Plots and Summary when selectedEstateId changes
  useEffect(() => {
    if (!selectedEstateId) {
      setPlots([]);
      setSummary(null);
      return;
    }

    async function loadPlots() {
      try {
        setLoadingPlots(true);
        const [plotsRes, summaryRes] = await Promise.all([
          api.get<Plot[]>(`/estates/${selectedEstateId}/plots`),
          api.get<PlotSummary>(`/estates/${selectedEstateId}/plots/summary`).catch(() => null),
        ]);

        setPlots(plotsRes.data);
        if (summaryRes) {
          setSummary(summaryRes.data);
        }
      } catch (err) {
        console.error("Gagal memuat petak lahan:", err);
      } finally {
        setLoadingPlots(false);
      }
    }

    loadPlots();
  }, [selectedEstateId]);

  // 3. Fetch Indices Timeline for selected estate
  useEffect(() => {
    if (!selectedEstateId) {
      setTimelineDates([]);
      setTimelineData({});
      return;
    }

    async function loadTimeline() {
      try {
        setLoadingTimeline(true);
        const res = await api.get<EstateIndicesTimeline>(
          `/estates/${selectedEstateId}/indices-timeline`
        );
        setTimelineDates(res.data.dates);
        setTimelineData(res.data.timeline);
        if (res.data.dates.length > 0) {
          // Default ke tanggal observasi paling mutakhir
          setActiveDateIndex(res.data.dates.length - 1);
        }
      } catch (err) {
        console.error("Gagal memuat timeline NDVI perkebunan:", err);
      } finally {
        setLoadingTimeline(false);
      }
    }

    loadTimeline();
  }, [selectedEstateId]);

  // 4. Timelapse Playback Interval
  useEffect(() => {
    if (!isPlayingTimeline || timelineDates.length === 0) return;

    const intervalTime = 1500 / playbackSpeed;
    const interval = setInterval(() => {
      setActiveDateIndex((prev) => (prev + 1) % timelineDates.length);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isPlayingTimeline, timelineDates.length, playbackSpeed]);

  // 5. Initialize Mapbox GL Map
  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [101.8524, 0.5532],
      zoom: 14,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("load", () => {
      // Source for plots polygons
      map.addSource("estate-plots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Fill layer with dynamic fill_color
      map.addLayer({
        id: "estate-plots-fill",
        type: "fill",
        source: "estate-plots",
        paint: {
          "fill-color": ["get", "fill_color"],
          "fill-opacity": 0.55,
        },
      });

      // Outline layer
      map.addLayer({
        id: "estate-plots-line",
        type: "line",
        source: "estate-plots",
        paint: {
          "line-color": "#ffffff",
          "line-width": 2,
          "line-opacity": 0.9,
        },
      });

      // Highlight line layer for selected/hovered plot
      map.addLayer({
        id: "estate-plots-highlight",
        type: "line",
        source: "estate-plots",
        paint: {
          "line-color": "#38bdf8",
          "line-width": 4,
        },
        filter: ["==", "id", ""],
      });

      // Click event on plot polygon
      map.on("click", "estate-plots-fill", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        const coordinates = e.lngLat;

        const plotId = Number(props.id);
        const matched = plots.find((p) => p.id === plotId);
        if (matched) {
          setSelectedPlot(matched);
        }

        map.setFilter("estate-plots-highlight", ["==", "id", plotId]);

        if (popupRef.current) {
          popupRef.current.remove();
        }

        const cropLabel = props.crop_type === "padi" ? "Padi (Oryza)" : "Jagung (Zea Mays)";
        const cropColor =
          props.crop_type === "padi"
            ? "text-emerald-700 bg-emerald-50 border-emerald-200"
            : "text-amber-800 bg-amber-50 border-amber-200";

        const ndviValText =
          props.ndvi_val !== undefined && props.ndvi_val !== null && props.ndvi_val !== ""
            ? Number(props.ndvi_val).toFixed(4)
            : "Belum Ada Data";

        const popupHtml = `
          <div class="p-3 min-w-[250px] font-sans">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
              <h3 class="font-bold text-slate-900 text-sm leading-tight">${props.name}</h3>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${cropColor}">
                ${props.crop_type?.toUpperCase()}
              </span>
            </div>
            <div class="space-y-1.5 text-xs text-slate-600">
              <div class="flex justify-between">
                <span class="text-slate-500">Komoditas:</span>
                <span class="font-semibold text-slate-800">${cropLabel}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Varietas:</span>
                <span class="font-medium text-slate-800">${props.variety_name || "-"}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Luas:</span>
                <span class="font-bold text-emerald-700">${props.area_hectares} ha</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Usia Tanam:</span>
                <span class="font-bold text-slate-800">${props.current_hst} HST</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Fase:</span>
                <span class="font-medium text-slate-800">${props.current_phase || "Vegetatif"}</span>
              </div>
              <div class="flex justify-between items-center pt-1 border-t border-slate-100">
                <span class="text-slate-500 font-semibold">NDVI Observasi:</span>
                <span class="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ${ndviValText}
                </span>
              </div>
            </div>
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 15, closeButton: true })
          .setLngLat(coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        popupRef.current = popup;
      });

      map.on("mouseenter", "estate-plots-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "estate-plots-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [plots]);

  // 6. Update Map Polygons Data & Colors Real-time when Slider Moves or Filter Changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("estate-plots") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const filtered = plots.filter((p) => {
      if (cropFilter !== "semua" && p.crop_type !== cropFilter) return false;
      if (searchQuery.trim() && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });

    const currentDate = timelineDates[activeDateIndex] || "";
    const currentNdvis = timelineData[currentDate] || {};

    const features: any[] = filtered
      .filter((p) => p.polygon && p.polygon.coordinates)
      .map((p) => {
        // Ambil nilai NDVI pada tanggal aktif saat ini
        const ndviVal = currentNdvis[p.id] ?? currentNdvis[String(p.id)] ?? null;
        const ndviColor = getNdviColor(ndviVal);
        const cropColor = p.crop_type === "padi" ? "#10b981" : "#f59e0b";
        const fillColor = isNdviMode ? ndviColor : cropColor;

        return {
          type: "Feature",
          id: p.id,
          geometry: p.polygon,
          properties: {
            id: p.id,
            name: p.name,
            crop_type: p.crop_type,
            area_hectares: p.area_hectares,
            current_hst: p.current_hst,
            current_phase: p.current_phase,
            variety_name: p.variety_name,
            division_name: p.division_name,
            estate_name: p.estate_name,
            planting_date: p.planting_date,
            ndvi_val: ndviVal,
            fill_color: fillColor,
          },
        };
      });

    source.setData({
      type: "FeatureCollection",
      features,
    });

    // Fit bounds pada render awal
    if (features.length > 0 && !isPlayingTimeline) {
      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => {
        const ring = f.geometry.coordinates[0];
        if (ring) {
          ring.forEach((coord: [number, number]) => {
            bounds.extend(coord);
          });
        }
      });
      // Hanya lakukan fit bounds jika belum pernah di-fit untuk mencegah map melompat saat play
      if (!map.isMoving()) {
        map.fitBounds(bounds, { padding: 90, maxZoom: 16 });
      }
    }
  }, [
    plots,
    cropFilter,
    searchQuery,
    selectedEstateId,
    activeDateIndex,
    timelineDates,
    timelineData,
    isNdviMode,
  ]);

  // 7. Handle Satellite Raster Tile Overlay (Add / Remove layer)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = "satellite-overlay-source";
    const layerId = "satellite-overlay-layer";

    if (!showSatelliteOverlay) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      setSatelliteTileInfo(null);
      return;
    }

    if (!selectedEstateId) return;

    async function applySatelliteRaster() {
      try {
        setLoadingSatelliteTile(true);
        const currentDate = timelineDates[activeDateIndex] || "";
        const res = await api.get<SatelliteTileInfo>(
          `/estates/${selectedEstateId}/satellite-tile`,
          {
            params: {
              type: satelliteVisType,
              date: currentDate || undefined,
            },
          }
        );
        setSatelliteTileInfo(res.data);

        const currentMap = mapRef.current;
        if (!currentMap) return;

        if (currentMap.getLayer(layerId)) currentMap.removeLayer(layerId);
        if (currentMap.getSource(sourceId)) currentMap.removeSource(sourceId);

        currentMap.addSource(sourceId, {
          type: "raster",
          tiles: [res.data.tile_url],
          tileSize: 256,
        });

        // Letakkan sebelum "estate-plots-fill" agar batas dan fill poligon petak tetap terlihat di atasnya
        const beforeLayerId = currentMap.getLayer("estate-plots-fill")
          ? "estate-plots-fill"
          : undefined;

        currentMap.addLayer(
          {
            id: layerId,
            type: "raster",
            source: sourceId,
            paint: {
              "raster-opacity": satelliteOpacity,
              "raster-fade-duration": 300,
            },
          },
          beforeLayerId
        );
      } catch (err) {
        console.error("Gagal memuat raster tile satelit:", err);
      } finally {
        setLoadingSatelliteTile(false);
      }
    }

    applySatelliteRaster();
  }, [
    showSatelliteOverlay,
    satelliteVisType,
    selectedEstateId,
    activeDateIndex,
    timelineDates,
  ]);

  // 8. Update Opacity satelit secara dinamis
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("satellite-overlay-layer")) {
      map.setPaintProperty("satellite-overlay-layer", "raster-opacity", satelliteOpacity);
    }
  }, [satelliteOpacity]);

  // Fly to specific plot
  const handleSelectPlot = (plot: Plot) => {
    setSelectedPlot(plot);
    const map = mapRef.current;
    if (!map) return;

    map.setFilter("estate-plots-highlight", ["==", "id", plot.id]);

    if (plot.polygon && plot.polygon.coordinates && plot.polygon.coordinates[0]) {
      const ring = plot.polygon.coordinates[0];
      const bounds = new mapboxgl.LngLatBounds();
      ring.forEach((c: any) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 120, maxZoom: 17 });
    }
  };

  // Toggle Map Base Style
  const toggleMapStyle = (style: "satellite" | "streets") => {
    if (!mapRef.current) return;
    setMapStyleType(style);
    const styleUrl =
      style === "satellite"
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/outdoors-v12";
    mapRef.current.setStyle(styleUrl);
  };

  // Hitung rata-rata NDVI pada tanggal observasi yang sedang aktif
  const currentAvgNdvi = useMemo(() => {
    if (timelineDates.length === 0) return null;
    const curDate = timelineDates[activeDateIndex];
    if (!curDate || !timelineData[curDate]) return null;

    const values = Object.values(timelineData[curDate]).filter(
      (v): v is number => typeof v === "number" && !isNaN(v)
    );
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [timelineDates, timelineData, activeDateIndex]);

  const filteredPlots = plots.filter((p) => {
    if (cropFilter !== "semua" && p.crop_type !== cropFilter) return false;
    if (searchQuery.trim() && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Main Container */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Control Bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 sm:px-6 shadow-sm z-20 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Estate Switcher & Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <label className="text-xs font-semibold text-slate-700">Estate:</label>
              <select
                value={selectedEstateId}
                onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                disabled={loadingEstates || estates.length === 0}
                className="text-xs font-medium rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-slate-50 py-1.5 pl-2.5 pr-8"
              >
                {loadingEstates ? (
                  <option>Memuat estate...</option>
                ) : (
                  estates.map((est) => (
                    <option key={est.id} value={est.id}>
                      {est.name} ({est.province || "Indonesia"})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Crop Type Filter Tabs */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setCropFilter("semua")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  cropFilter === "semua"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semua ({plots.length})
              </button>
              <button
                type="button"
                onClick={() => setCropFilter("padi")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                  cropFilter === "padi"
                    ? "bg-emerald-600 text-white font-bold shadow-xs"
                    : "text-slate-600 hover:text-emerald-700"
                }`}
              >
                <Sprout className="w-3.5 h-3.5" />
                <span>Padi</span>
              </button>
              <button
                type="button"
                onClick={() => setCropFilter("jagung")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                  cropFilter === "jagung"
                    ? "bg-amber-600 text-white font-bold shadow-xs"
                    : "text-slate-600 hover:text-amber-800"
                }`}
              >
                <Wheat className="w-3.5 h-3.5" />
                <span>Jagung</span>
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Style switcher */}
            <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => toggleMapStyle("satellite")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mapStyleType === "satellite"
                    ? "bg-emerald-700 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Satelit
              </button>
              <button
                type="button"
                onClick={() => toggleMapStyle("streets")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mapStyleType === "streets"
                    ? "bg-emerald-700 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Peta
              </button>
            </div>

            {/* Tambah Petak Baru Button */}
            <Link
              href="/admin/petak-baru"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tambah Petak Baru</span>
            </Link>
          </div>
        </div>

        {/* Map Workspace */}
        <div className="flex-1 flex relative overflow-hidden h-[calc(100vh-120px)]">
          {/* Map Container */}
          <div ref={mapContainer} className="flex-1 w-full h-full bg-slate-900" />

          {/* Floating Top Summary Stats Card */}
          {summary && (
            <div className="absolute top-4 left-4 z-10 hidden md:flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-slate-200/80 text-xs">
              <div className="border-r border-slate-200 pr-3">
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Lahan</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {summary.total_plots} Petak <span className="text-slate-400 font-normal">({summary.total_area_hectares} ha)</span>
                </span>
              </div>
              <div className="border-r border-slate-200 pr-3">
                <span className="text-emerald-700 block text-[10px] font-bold uppercase flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Padi
                </span>
                <span className="font-bold text-slate-800">
                  {summary.padi_plots} petak <span className="text-slate-500">({summary.padi_area_hectares} ha)</span>
                </span>
              </div>
              <div>
                <span className="text-amber-800 block text-[10px] font-bold uppercase flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Jagung
                </span>
                <span className="font-bold text-slate-800">
                  {summary.jagung_plots} petak <span className="text-slate-500">({summary.jagung_area_hectares} ha)</span>
                </span>
              </div>
            </div>
          )}

          {/* Kontrol Overlay Citra Satelit (Pojok Kanan Atas) */}
          <div className="absolute top-4 right-14 z-10 w-64 max-w-[calc(100vw-80px)]">
            <SatelliteOverlayControl
              isEnabled={showSatelliteOverlay}
              onToggleEnabled={setShowSatelliteOverlay}
              visType={satelliteVisType}
              onVisTypeChange={setSatelliteVisType}
              opacity={satelliteOpacity}
              onOpacityChange={setSatelliteOpacity}
              isLoading={loadingSatelliteTile}
              attribution={satelliteTileInfo?.attribution}
            />
          </div>

          {/* Map Legend (Keterangan Warna Dinamis: NDVI Spektrum vs Komoditas) */}
          <div className="absolute bottom-28 left-4 z-10 bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-md border border-slate-200 text-xs space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {isNdviMode ? "Legenda Status NDVI" : "Legenda Tanaman"}
            </span>

            {isNdviMode ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-700 border border-emerald-800" />
                  <span className="font-medium">Sangat Baik (&gt; 0.75)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-600" />
                  <span className="font-medium">Baik (0.55 - 0.75)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-amber-500 border border-amber-600" />
                  <span className="font-medium">Waspada (0.30 - 0.55)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-rose-500 border border-rose-600" />
                  <span className="font-medium">Kritis (&lt; 0.30)</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-700" />
                  <span className="font-medium">Padi (Oryza Sativa)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-3.5 h-3.5 rounded bg-amber-500 border border-amber-700" />
                  <span className="font-medium">Jagung (Zea Mays)</span>
                </div>
              </div>
            )}
          </div>

          {/* Timeline Slider Temporal di Bawah Peta */}
          {timelineDates.length > 0 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[94%] sm:w-auto flex justify-center">
              <TimelineSlider
                dates={timelineDates}
                currentIndex={activeDateIndex}
                onIndexChange={setActiveDateIndex}
                isPlaying={isPlayingTimeline}
                onTogglePlay={() => setIsPlayingTimeline(!isPlayingTimeline)}
                speed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
                isNdviMode={isNdviMode}
                onToggleNdviMode={() => setIsNdviMode(!isNdviMode)}
                avgNdvi={currentAvgNdvi}
                totalPlots={plots.length}
              />
            </div>
          )}

          {/* Collapsible Sidebar: Daftar Petak */}
          <div
            className={`absolute top-0 right-0 h-full w-80 bg-white/95 backdrop-blur-md border-l border-slate-200 z-10 flex flex-col shadow-xl transition-transform duration-300 ${
              showSidebar ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Sidebar Header */}
            <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Daftar Petak ({filteredPlots.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500"
                title="Sembunyikan panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-slate-100">
              <input
                type="text"
                placeholder="Cari petak lahan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 bg-white shadow-xs focus:border-emerald-500 focus:ring-emerald-500"
              />
            </div>

            {/* Plot List Items */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {loadingPlots ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat data petak lahan...
                </div>
              ) : filteredPlots.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada petak lahan yang sesuai.
                </div>
              ) : (
                filteredPlots.map((plot) => {
                  const isSelected = selectedPlot?.id === plot.id;
                  const isPadi = plot.crop_type === "padi";
                  const curDate = timelineDates[activeDateIndex];
                  const plotNdvi =
                    curDate && timelineData[curDate]
                      ? timelineData[curDate][plot.id] ?? timelineData[curDate][String(plot.id)] ?? null
                      : null;

                  return (
                    <div
                      key={plot.id}
                      onClick={() => handleSelectPlot(plot)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? "bg-emerald-50 border border-emerald-300 shadow-xs"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <h4 className="font-semibold text-slate-900 text-xs truncate">
                          {plot.name}
                        </h4>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            isPadi
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {plot.crop_type.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{plot.variety_name || "Varietas N/A"}</span>
                        <span className="font-bold text-emerald-700">{plot.area_hectares} ha</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{plot.current_phase || "Fase Vegetatif"}</span>
                        <span className="font-medium text-slate-700">{plot.current_hst} HST</span>
                      </div>

                      {/* Observasi NDVI pada slider aktif */}
                      {plotNdvi !== null && plotNdvi !== undefined && (
                        <div className="mt-1.5 flex items-center justify-between text-[10px] px-2 py-0.5 bg-slate-50 rounded border border-slate-200">
                          <span className="text-slate-500">NDVI Saat Ini:</span>
                          <span className="font-bold text-emerald-700">{plotNdvi.toFixed(3)}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSatelliteModalPlot(plot);
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold border border-emerald-200 transition-colors"
                      >
                        <Radio className="w-3 h-3 text-emerald-600" />
                        <span>Indeks Satelit & SAR</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Re-open Sidebar Button when closed */}
          {!showSidebar && (
            <button
              type="button"
              onClick={() => setShowSidebar(true)}
              className="absolute top-4 right-4 z-10 p-2.5 bg-white rounded-lg shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>Lihat Daftar Petak</span>
            </button>
          )}

          {/* Modal Indeks Satelit & SAR */}
          {satelliteModalPlot && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
              <div className="w-full max-w-2xl max-h-[90vh]">
                <PlotSatellitePanel
                  plotId={satelliteModalPlot.id}
                  plotName={satelliteModalPlot.name}
                  cropType={satelliteModalPlot.crop_type}
                  onClose={() => setSatelliteModalPlot(null)}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
