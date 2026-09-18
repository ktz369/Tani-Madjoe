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
  Bug,
  Trash2,
  PencilLine,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import PlotSatellitePanel from "@/components/satellite/PlotSatellitePanel";
import TimelineSlider from "@/components/map/TimelineSlider";
import SatelliteOverlayControl from "@/components/map/SatelliteOverlayControl";
import { PestScoutingModal, EditPlotModal } from "@/components/plot";
import { api } from "@/lib/api";
import { operationsApi } from "@/lib/operationsApi";
import { generatePestQuarantineBuffer, QuarantineGeoJSON } from "@/lib/duckdb-spatial";
import { PestScoutingReport } from "@/types/operations";
import {
  CropVariety,
  Estate,
  EstateIndicesTimeline,
  Plot,
  PlotSummary,
  SatelliteTileInfo,
} from "@/types";
import { applyMapboxToken, getMapStyle } from "@/lib/mapStyles";
import { BENGKOK_1_COORDINATES } from "@/lib/bengkokGeometry";

// Helper konversi nilai NDVI ke kode warna HEX
const getNdviColor = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return "#94a3b8"; // slate-400 (belum ada data)
  if (val < 0.3) return "#a8a29e"; // stone-400 (bera / tanah terbuka)
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
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const [mapStyleEpoch, setMapStyleEpoch] = useState<number>(0);

  // --- OPS-06: DuckDB-WASM Pest Quarantine & Scouting State ---
  const [scoutingReports, setScoutingReports] = useState<PestScoutingReport[]>([]);
  const [quarantineBufferGeoJSON, setQuarantineBufferGeoJSON] = useState<QuarantineGeoJSON | null>(null);
  const [showQuarantineOverlay, setShowQuarantineOverlay] = useState<boolean>(true);
  const [showScoutingModal, setShowScoutingModal] = useState<boolean>(false);
  // Hapus petak (deploy patch 2026-09-18)
  const [plotToDelete, setPlotToDelete] = useState<Plot | null>(null);
  const [deletingPlot, setDeletingPlot] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reloadPlotsTrigger, setReloadPlotsTrigger] = useState<number>(0);
  // Edit petak (deploy patch 2026-09-18)
  const [plotToEdit, setPlotToEdit] = useState<Plot | null>(null);
  const [varieties, setVarieties] = useState<CropVariety[]>([]);

  // Refs to prevent unnecessary map rebuilds while maintaining fresh references
  const plotsRef = useRef<Plot[]>([]);
  const hasFittedBoundsRef = useRef<boolean>(false);

  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);

  useEffect(() => {
    hasFittedBoundsRef.current = false;
  }, [selectedEstateId]);

  // 1. Initial Load: Estates
  useEffect(() => {
    async function loadEstates() {
      try {
        setLoadingEstates(true);
        const res = await api.get<Estate[]>("/estates");
        const estList = Array.isArray(res.data) ? res.data : [];
        setEstates(estList);
        if (estList.length > 0) {
          setSelectedEstateId(estList[0].id);
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

        const plotList = Array.isArray(plotsRes.data) ? plotsRes.data : [];
        setPlots(plotList);
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
  }, [selectedEstateId, reloadPlotsTrigger]);

  // Master varietas untuk form edit petak (deploy patch 2026-09-18)
  useEffect(() => {
    api
      .get<CropVariety[]>("/varieties")
      .then((res) => setVarieties(Array.isArray(res.data) ? res.data : []))
      .catch(() => setVarieties([]));
  }, []);

  const handleConfirmDeletePlot = async () => {
    if (!plotToDelete) return;
    try {
      setDeletingPlot(true);
      setDeleteError(null);
      await api.delete(`/plots/${plotToDelete.id}`);
      if (selectedPlot?.id === plotToDelete.id) setSelectedPlot(null);
      setPlotToDelete(null);
      setReloadPlotsTrigger((prev) => prev + 1);
    } catch (err: any) {
      console.error("Gagal menghapus petak:", err);
      setDeleteError(
        err.response?.data?.detail || "Gagal menghapus petak lahan. Coba lagi."
      );
    } finally {
      setDeletingPlot(false);
    }
  };

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
        const dates = Array.isArray(res.data?.dates) ? res.data.dates : [];
        setTimelineDates(dates);
        setTimelineData(res.data?.timeline || {});
        if (dates.length > 0) {
          // Default ke tanggal observasi paling mutakhir
          setActiveDateIndex(dates.length - 1);
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
  const initMapLayers = (map: mapboxgl.Map) => {
    if (!map.getSource("estate-plots")) {
      map.addSource("estate-plots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer("estate-plots-fill")) {
      map.addLayer({
        id: "estate-plots-fill",
        type: "fill",
        source: "estate-plots",
        paint: {
          "fill-color": ["get", "fill_color"],
          "fill-opacity": 0.55,
        },
      });
    }

    if (!map.getLayer("estate-plots-line")) {
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
    }

    if (!map.getLayer("estate-plots-highlight")) {
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
    }

    // Layer Karantina Spasial Hama (DuckDB-WASM ST_Buffer R=50m)
    if (!map.getSource("pest-quarantine")) {
      map.addSource("pest-quarantine", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer("pest-quarantine-fill")) {
      map.addLayer({
        id: "pest-quarantine-fill",
        type: "fill",
        source: "pest-quarantine",
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.28,
        },
      });
    }

    if (!map.getLayer("pest-quarantine-line")) {
      map.addLayer({
        id: "pest-quarantine-line",
        type: "line",
        source: "pest-quarantine",
        paint: {
          "line-color": "#dc2626",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
    }

    // Titik Lapang Pengamatan OPT
    if (!map.getSource("pest-scouting-points")) {
      map.addSource("pest-scouting-points", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer("pest-scouting-circles")) {
      map.addLayer({
        id: "pest-scouting-circles",
        type: "circle",
        source: "pest-scouting-points",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "severity"],
            "berat",
            "#dc2626",
            "sedang",
            "#f59e0b",
            "#10b981",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  };

  // 5. Initialize Mapbox GL Map (Single Mount)
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
        console.warn("Tile citra satelit Esri tidak dapat dijangkau, mengalihkan ke fallback OpenStreetMap...");
        hasFallbackTriggered = true;
        map.setStyle(getMapStyle("streets") as any);
      }
    });

    const onMapReady = () => {
      if (!mapRef.current) return;
      requestAnimationFrame(() => {
        try { mapRef.current?.resize(); } catch {}
      });
      initMapLayers(map);
      setIsMapLoaded(true);
    };

    if (map.isStyleLoaded()) {
      onMapReady();
    } else {
      map.once("idle", onMapReady);
    }

    map.on("load", () => {
      if (!isMapLoaded && map.isStyleLoaded()) {
        onMapReady();
      }

      // Click event on plot polygon
      map.on("click", "estate-plots-fill", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        const coordinates = e.lngLat;

        const plotId = Number(props.id);
        const matched = plotsRef.current.find((p) => p.id === plotId);
        if (matched) {
          setSelectedPlot(matched);
        }

        if (map.getLayer("estate-plots-highlight")) {
          map.setFilter("estate-plots-highlight", ["==", "id", plotId]);
        }

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
                <span class="font-medium text-slate-800">${props.variety_name && props.variety_name !== "-" ? props.variety_name : "Belum Ditanami"}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Luas:</span>
                <span class="font-bold text-emerald-700">${Number(props.area_hectares).toFixed(2)} ha</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Usia Tanam:</span>
                <span class="font-bold text-slate-800">${props.current_hst > 0 ? `${props.current_hst} HST` : "0 HST (Lahan Terbuka)"}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Fase:</span>
                <span class="font-semibold text-slate-800">${props.current_phase || "Bera / Belum Ditanami (Lahan Terbuka)"}</span>
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

      // Click event on pest scouting circle
      map.on("click", "pest-scouting-circles", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties as any;
        const coords = (feature.geometry as any).coordinates;

        const isSevere = props.severity === "berat";
        const badgeColor = isSevere
          ? "bg-red-50 text-red-800 border-red-200"
          : props.severity === "sedang"
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-emerald-50 text-emerald-800 border-emerald-200";

        new mapboxgl.Popup({ offset: 12, closeButton: true })
          .setLngLat(coords)
          .setHTML(`
            <div class="p-2.5 font-sans min-w-[210px]">
              <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1.5">
                <span class="font-bold text-xs text-slate-900">${(props.pest_type || "").toUpperCase().replace(/_/g, " ")}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}">
                  ${(props.severity || "").toUpperCase()}
                </span>
              </div>
              <div class="text-[11px] text-slate-600 space-y-1">
                ${isSevere ? '<div class="text-red-700 font-semibold text-[11px]">Zona Karantina 50m Aktif (DuckDB-WASM)</div>' : ""}
                <div><span class="text-slate-400">Tindakan:</span> ${props.action_taken || "-"}</div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseenter", "pest-scouting-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pest-scouting-circles", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    const handleWindowResize = () => {
      map.resize();
    };
    window.addEventListener("resize", handleWindowResize);

    // ResizeObserver: auto-resize canvas whenever the container element changes size
    // This fixes the blank/tiled canvas when the sidebar panel is toggled open/closed
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { mapRef.current?.resize(); } catch {}
      });
    });
    if (mapContainer.current) {
      ro.observe(mapContainer.current);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Trigger map resize whenever sidebar visibility changes
  useEffect(() => {
    if (!mapRef.current) return;
    requestAnimationFrame(() => {
      try { mapRef.current?.resize(); } catch {}
    });
  }, [showSidebar]);


  // 6. Update Map Polygons Data & Colors Real-time when Slider Moves or Filter Changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const buildFeatures = () => {
      const filtered = plots.filter((p) => {
        if (cropFilter !== "semua" && p.crop_type !== cropFilter) return false;
        if (searchQuery.trim() && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        return true;
      });

      const currentDate = timelineDates[activeDateIndex] || "";
      const currentNdvis = timelineData[currentDate] || {};

      return filtered
        .filter((p) => p.polygon && p.polygon.coordinates)
        .map((p) => {
          // Ambil nilai NDVI pada tanggal aktif saat ini
          const ndviVal = currentNdvis[p.id] ?? currentNdvis[String(p.id)] ?? null;
          const ndviColor = getNdviColor(ndviVal);
          const cropColor = p.crop_type === "padi" ? "#10b981" : "#f59e0b";
          const fillColor = isNdviMode ? ndviColor : cropColor;

          return {
            type: "Feature" as const,
            id: p.id,
            geometry: p.polygon,
            properties: {
              id: p.id,
              name: p.name,
              crop_type: p.crop_type,
              area_hectares: p.area_hectares,
              current_hst: p.current_hst,
              current_phase:
                p.current_phase ||
                (p.current_hst === 0 ? "Bera / Belum Ditanami (Lahan Terbuka)" : "-"),
              variety_name: p.variety_name,
              division_name: p.division_name,
              estate_name: p.estate_name,
              planting_date: p.planting_date,
              ndvi_val: ndviVal,
              fill_color: fillColor,
            },
          };
        });
    };

    const pushToMap = () => {
      const source = map.getSource("estate-plots") as mapboxgl.GeoJSONSource;
      if (!source) return;

      const features = buildFeatures();
      source.setData({
        type: "FeatureCollection",
        features,
      });

      // Fit bounds otomatis ke 24 koordinat WGS84 petak Bengkok 1 saat layer/source poligon siap
      if (!hasFittedBoundsRef.current) {
        const bounds = new mapboxgl.LngLatBounds();
        if (features.length > 0) {
          features.forEach((f: any) => {
            const ring = f.geometry?.coordinates?.[0];
            if (ring) {
              ring.forEach((coord: [number, number]) => {
                bounds.extend(coord);
              });
            }
          });
        }
        if (bounds.isEmpty()) {
          BENGKOK_1_COORDINATES.forEach((coord) => bounds.extend(coord));
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
          hasFittedBoundsRef.current = true;
        }
      }
    };

    // Jika style belum siap, tunggu 'idle' sebelum push data polygon
    if (!map.isStyleLoaded()) {
      map.once("idle", pushToMap);
    } else {
      pushToMap();
    }
  }, [
    plots,
    activeDateIndex,
    isNdviMode,
    cropFilter,
    searchQuery,
    selectedEstateId,
    timelineDates,
    timelineData,
    isMapLoaded,
    mapStyleEpoch,
  ]);

  // 6b. OPS-06: Fetch Pest Scouting Reports & Generate DuckDB-WASM Quarantine Buffer
  const fetchScoutingAndBuffer = async () => {
    try {
      const pid = selectedPlot ? selectedPlot.id : plotsRef.current[0]?.id;
      if (!pid) {
        setScoutingReports([]);
        setQuarantineBufferGeoJSON(null);
        return;
      }
      const rawReports = await operationsApi.getPestScoutingReports(pid);
      const reports = Array.isArray(rawReports) ? rawReports : [];
      setScoutingReports(reports);

      // Generate 50m quarantine buffer using DuckDB-WASM Spatial Engine
      const bufferGeo = await generatePestQuarantineBuffer(
        reports.map((r) => ({
          id: r.id,
          lat: r.latitude,
          lng: r.longitude,
          severity: r.severity,
          pest_type: r.pest_type,
        })),
        50
      );
      setQuarantineBufferGeoJSON(bufferGeo);
    } catch (err) {
      console.warn("Gagal memuat buffer karantina DuckDB-WASM:", err);
    }
  };

  useEffect(() => {
    fetchScoutingAndBuffer();
  }, [selectedPlot, plots]);

  // Push Quarantine Buffer & Scouting Points to Mapbox GL
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const pushQuarantine = () => {
      const qSource = map.getSource("pest-quarantine") as mapboxgl.GeoJSONSource;
      if (qSource) {
        qSource.setData(
          showQuarantineOverlay && quarantineBufferGeoJSON
            ? (quarantineBufferGeoJSON as any)
            : { type: "FeatureCollection", features: [] }
        );
      }

      const pSource = map.getSource("pest-scouting-points") as mapboxgl.GeoJSONSource;
      if (pSource) {
        const pts = showQuarantineOverlay && Array.isArray(scoutingReports)
          ? scoutingReports.map((r) => ({
              type: "Feature" as const,
              id: r.id,
              geometry: {
                type: "Point" as const,
                coordinates: [r.longitude, r.latitude],
              },
              properties: {
                id: r.id,
                pest_type: r.pest_type,
                severity: r.severity,
                action_taken: r.action_taken || "-",
                observation_date: r.observation_date,
              },
            }))
          : [];
        pSource.setData({
          type: "FeatureCollection",
          features: pts,
        });
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("idle", pushQuarantine);
    } else {
      pushQuarantine();
    }
  }, [quarantineBufferGeoJSON, scoutingReports, showQuarantineOverlay, mapStyleEpoch, isMapLoaded]);

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
        if (!currentMap || !currentMap.isStyleLoaded()) return;

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
    mapStyleEpoch,
    isMapLoaded,
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

    if (map.getLayer("estate-plots-highlight")) {
      map.setFilter("estate-plots-highlight", ["==", "id", plot.id]);
    }

    if (plot.polygon && plot.polygon.coordinates && plot.polygon.coordinates[0]) {
      const ring = plot.polygon.coordinates[0];
      const bounds = new mapboxgl.LngLatBounds();
      ring.forEach((c: any) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 120, maxZoom: 17 });

      const center = bounds.getCenter();
      if (popupRef.current) popupRef.current.remove();

      const cropLabel = plot.crop_type === "padi" ? "Padi (Oryza)" : "Jagung (Zea Mays)";
      const cropColor =
        plot.crop_type === "padi"
          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
          : "text-amber-800 bg-amber-50 border-amber-200";

      const popupHtml = `
        <div class="p-3 min-w-[250px] font-sans">
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
            <h3 class="font-bold text-slate-900 text-sm leading-tight">${plot.name}</h3>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${cropColor}">
              ${plot.crop_type?.toUpperCase()}
            </span>
          </div>
          <div class="space-y-1.5 text-xs text-slate-600">
            <div class="flex justify-between">
              <span class="text-slate-500">Komoditas:</span>
              <span class="font-semibold text-slate-800">${cropLabel}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Varietas:</span>
              <span class="font-medium text-slate-800">${plot.variety_name || "Belum Ditanami"}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Luas:</span>
              <span class="font-bold text-emerald-700">${Number(plot.area_hectares).toFixed(2)} ha</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Usia Tanam:</span>
              <span class="font-bold text-slate-800">${plot.current_hst > 0 ? `${plot.current_hst} HST` : "0 HST (Lahan Terbuka)"}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Fase:</span>
              <span class="font-semibold text-slate-800">${plot.current_phase || "Bera / Belum Ditanami (Lahan Terbuka)"}</span>
            </div>
          </div>
        </div>
      `;

      popupRef.current = new mapboxgl.Popup({ offset: 15, closeButton: true })
        .setLngLat(center)
        .setHTML(popupHtml)
        .addTo(map);
    }
  };

  // Toggle Map Base Style
  const toggleMapStyle = (style: "satellite" | "streets") => {
    if (!mapRef.current || style === mapStyleType) return;
    setMapStyleType(style);
    const map = mapRef.current;
    map.setStyle(getMapStyle(style) as any);
    map.once("style.load", () => {
      initMapLayers(map);

      // Push current polygon data immediately after layers are registered,
      // without waiting for React state update cycle (mapStyleEpoch / isMapLoaded no-op)
      const pushAfterIdle = () => {
        const source = map.getSource("estate-plots") as mapboxgl.GeoJSONSource;
        if (!source || !plotsRef.current.length) return;

        const currentPlots = plotsRef.current.filter(
          (p) => p.polygon && p.polygon.coordinates
        );
        const features = currentPlots.map((p) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: p.polygon,
          properties: {
            id: p.id,
            name: p.name,
            crop_type: p.crop_type,
            area_hectares: p.area_hectares,
            current_hst: p.current_hst,
            current_phase: p.current_phase || (p.current_hst === 0 ? "Bera / Belum Ditanami (Lahan Terbuka)" : "-"),
            variety_name: p.variety_name,
            division_name: p.division_name,
            estate_name: p.estate_name,
            planting_date: p.planting_date,
            ndvi_val: null,
            fill_color: p.crop_type === "padi" ? "#10b981" : "#f59e0b",
          },
        }));
        source.setData({ type: "FeatureCollection", features });
      };

      // Use 'idle' to wait until new base tiles have been fetched before pushing
      map.once("idle", pushAfterIdle);

      setIsMapLoaded(true);
      setMapStyleEpoch((prev) => prev + 1);
    });
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
    <div className="h-screen w-full overflow-hidden bg-[var(--canvas)] pt-[68px] flex flex-col">
      <Navbar />

      {/* Ambient Command Bar */}
      <div className="h-[34px] border-b border-black/[0.08] px-[21px] flex items-center justify-between text-xs shrink-0 bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 text-[var(--ink-3)] font-mono">
          <span className="text-[var(--ink-2)] font-medium">
            {estates.find((e) => e.id === Number(selectedEstateId))?.name || "Kebun Pacitan"}
          </span>
          <span>/</span>
          <span className="text-[var(--ink)] font-semibold">
            {selectedPlot ? selectedPlot.name : "Bengkok 1"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuarantineOverlay(!showQuarantineOverlay)}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-[3px] text-[11px] font-mono border transition-colors ${
              showQuarantineOverlay
                ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                : "bg-white text-[var(--ink-muted)] border-black/[0.08] hover:bg-black/[0.02]"
            }`}
            title="Tampilkan / Sembunyikan Buffer Karantina OPT 50m DuckDB-WASM"
          >
            <span className={`size-1.5 rounded-full ${showQuarantineOverlay ? "bg-red-500 animate-pulse" : "bg-neutral-400"}`} />
            <span>DuckDB Buffer (50m)</span>
          </button>

          <button
            onClick={() => setShowScoutingModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-mono bg-white border border-black/[0.08] text-[var(--ink)] hover:bg-black/[0.03] transition-colors"
            title="Input laporan pengamatan hama lapang"
          >
            <Bug className="w-3 h-3 text-red-600" />
            <span>+ Laporkan OPT</span>
          </button>

          <div className="flex items-center text-xs font-mono text-[var(--ink-2)]">
            <span className="size-2 rounded-full bg-emerald-500 inline-block animate-pulse mr-1.5" />
            <span>Sentinel-2 Live</span>
          </div>
        </div>
      </div>

      {/* Top Control Bar (reduced to h-[44px], flat border-b border-black/[0.08] bg-[var(--surface)]) */}
      <div className="h-[44px] border-b border-black/[0.08] px-[21px] flex items-center justify-between shrink-0 bg-[var(--surface)] text-xs z-20">
        {/* Left: Estate Switcher & Crop Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="label-telemetry">Kebun:</span>
            <select
              value={selectedEstateId}
              onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
              disabled={loadingEstates || estates.length === 0}
              className="text-xs font-medium rounded-[3px] border border-black/[0.08] bg-[var(--field)] py-1 pl-2 pr-7 focus:outline-none focus:border-[var(--accent)] text-[var(--ink)]"
            >
              {loadingEstates ? (
                <option>Memuat kebun...</option>
              ) : (
                estates.map((est) => (
                  <option key={est.id} value={est.id}>
                    {est.name} ({est.province || "Indonesia"})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="h-4 w-px bg-black/[0.08]" />

          {/* Crop Type Filter Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCropFilter("semua")}
              className={`px-2.5 py-1 text-xs rounded-[3px] transition-colors ${
                cropFilter === "semua"
                  ? "bg-[var(--ink)] text-white font-medium"
                  : "text-[var(--ink-2)] hover:bg-black/[0.04]"
              }`}
            >
              Semua ({plots.length})
            </button>
            <button
              type="button"
              onClick={() => setCropFilter("padi")}
              className={`px-2.5 py-1 text-xs rounded-[3px] flex items-center gap-1 transition-colors ${
                cropFilter === "padi"
                  ? "bg-emerald-600 text-white font-medium"
                  : "text-[var(--ink-2)] hover:bg-black/[0.04]"
              }`}
            >
              <Sprout className="w-3 h-3" />
              <span>Padi</span>
            </button>
            <button
              type="button"
              onClick={() => setCropFilter("jagung")}
              className={`px-2.5 py-1 text-xs rounded-[3px] flex items-center gap-1 transition-colors ${
                cropFilter === "jagung"
                  ? "bg-amber-600 text-white font-medium"
                  : "text-[var(--ink-2)] hover:bg-black/[0.04]"
              }`}
            >
              <Wheat className="w-3 h-3" />
              <span>Jagung</span>
            </button>
          </div>
        </div>

        {/* Right: Map Style switcher & Tambah Petak */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-black/[0.08] rounded-[3px] overflow-hidden p-0.5 bg-[var(--field)]">
            <button
              type="button"
              onClick={() => toggleMapStyle("satellite")}
              className={`px-2 py-0.5 text-xs rounded-[2px] transition-colors ${
                mapStyleType === "satellite"
                  ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
            >
              Satelit
            </button>
            <button
              type="button"
              onClick={() => toggleMapStyle("streets")}
              className={`px-2 py-0.5 text-xs rounded-[2px] transition-colors ${
                mapStyleType === "streets"
                  ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
            >
              Peta
            </button>
          </div>

          <Link
            href="/admin/petak-baru"
            className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent)] hover:bg-emerald-700 text-white rounded-[3px] text-xs font-medium transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Petak Baru</span>
          </Link>
        </div>
      </div>

      {/* Main Workspace Grid (flex-1 grid grid-cols-[1fr_480px] overflow-hidden) */}
      <div className="flex-1 grid grid-cols-[1fr_480px] overflow-hidden relative">
        {/* Left: Map canvas (relative w-full h-full overflow-hidden, zero margins, zero rounded outer wrapper) */}
        <div className="relative w-full h-full overflow-hidden">
          <div
            ref={mapContainer}
            className="absolute inset-0 w-full h-full bg-slate-900"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Floating Top Summary Stats Micro-HUD */}
          {summary && (
            <div className="absolute top-[21px] left-[21px] z-10 hidden md:flex items-center gap-4 backdrop-blur-[14px] bg-white/85 border border-black/[0.08] rounded-[3px] p-[8px_16px] text-xs">
              <div className="border-r border-black/[0.08] pr-3">
                <span className="label-telemetry block">Total Lahan</span>
                <span className="font-semibold text-[var(--ink)] tabular-nums">
                  {summary.total_plots} Petak <span className="text-[var(--ink-3)] font-normal">({summary.total_area_hectares} ha)</span>
                </span>
              </div>
              <div className="border-r border-black/[0.08] pr-3">
                <span className="label-telemetry block">Padi</span>
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {summary.padi_plots} petak <span className="text-[var(--ink-3)] font-normal">({summary.padi_area_hectares} ha)</span>
                </span>
              </div>
              <div>
                <span className="label-telemetry block">Jagung</span>
                <span className="font-semibold text-amber-700 tabular-nums">
                  {summary.jagung_plots} petak <span className="text-[var(--ink-3)] font-normal">({summary.jagung_area_hectares} ha)</span>
                </span>
              </div>
            </div>
          )}

          {/* Kontrol Overlay Citra Satelit */}
          <div className="absolute top-[21px] right-[21px] z-10 w-64 max-w-[calc(100vw-80px)]">
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

          {/* NDVI legend: floating Micro-HUD absolute bottom-[21px] left-[34px] backdrop-blur-[14px] bg-white/85 border border-black/[0.08] rounded-[3px] p-[13px_21px] z-10 */}
          <div className="absolute bottom-[21px] left-[34px] backdrop-blur-[14px] bg-white/85 border border-black/[0.08] rounded-[3px] p-[13px_21px] z-10 text-xs space-y-2">
            <span className="label-telemetry block">
              {isNdviMode ? "LEGENDA STATUS NDVI" : "LEGENDA TANAMAN"}
            </span>

            {isNdviMode ? (
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-emerald-700 border border-emerald-800" />
                  <span>Sangat Baik (&gt; 0.75)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-emerald-500 border border-emerald-600" />
                  <span>Baik (0.55 - 0.75)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-amber-500 border border-amber-600" />
                  <span>Waspada (0.30 - 0.55)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-stone-400 border border-stone-500" />
                  <span>Bera / Terbuka (&lt; 0.30)</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-emerald-500 border border-emerald-700" />
                  <span>Padi (Oryza Sativa)</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--ink-2)]">
                  <span className="w-3 h-3 rounded-[2px] bg-amber-500 border border-amber-700" />
                  <span>Jagung (Zea Mays)</span>
                </div>
              </div>
            )}
          </div>

          {/* Timeline slider: positioned neatly as floating bar above bottom canvas */}
          {timelineDates.length > 0 && (
            <div className="absolute bottom-[21px] left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl flex justify-center">
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
        </div>

        {/* Right: Telemetry Rail (w-[480px] border-l border-black/[0.08] bg-[var(--canvas)] overflow-y-auto p-[21px] flex flex-col gap-[34px]) */}
        <div className="w-[480px] border-l border-black/[0.08] bg-[var(--canvas)] overflow-y-auto p-[21px] flex flex-col gap-[34px]">
          {/* Selected Plot Telemetry (if active) */}
          {selectedPlot && (
            <div className="p-4 rounded-[3px] border border-black/[0.08] bg-[var(--surface)] space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-black/[0.08] pb-2">
                <div>
                  <span className="label-telemetry">PETAK AKTIF</span>
                  <h3 className="text-sm font-bold text-[var(--ink)]">{selectedPlot.name}</h3>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-[2px] border ${
                    selectedPlot.crop_type === "padi"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-amber-800 bg-amber-50 border-amber-200"
                  }`}
                >
                  {selectedPlot.crop_type.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="label-telemetry block">Varietas</span>
                  <span className="font-semibold text-[var(--ink)]">
                    {selectedPlot.variety_name || "Belum Ditanami"}
                  </span>
                </div>
                <div>
                  <span className="label-telemetry block">Luas</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {Number(selectedPlot.area_hectares).toFixed(2)} ha
                  </span>
                </div>
                <div>
                  <span className="label-telemetry block">Usia Tanam</span>
                  <span className="font-semibold text-[var(--ink)] tabular-nums">
                    {selectedPlot.current_hst > 0 ? `${selectedPlot.current_hst} HST` : "0 HST (Lahan Terbuka)"}
                  </span>
                </div>
                <div>
                  <span className="label-telemetry block">Fase</span>
                  <span className="font-semibold text-[var(--ink)] truncate block">
                    {selectedPlot.current_phase || "Bera / Terbuka"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSatelliteModalPlot(selectedPlot)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[3px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-600" />
                <span>Analisis Citra Satelit & SAR</span>
              </button>
            </div>
          )}

          {/* DAFTAR PETAK Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="label-telemetry font-bold">
                  DAFTAR PETAK ({filteredPlots.length})
                </h2>
              </div>
            </div>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Cari petak atau varietas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-[3px] border border-black/[0.08] bg-[var(--surface)] p-2.5 text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)]"
            />

            {/* Plot List */}
            <div className="flex flex-col gap-2">
              {loadingPlots ? (
                <div className="p-8 text-center text-xs text-[var(--ink-3)] font-mono">
                  Memuat data petak lahan...
                </div>
              ) : filteredPlots.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--ink-3)] font-mono">
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
                      className={`p-3 rounded-[3px] cursor-pointer transition-colors border ${
                        isSelected
                          ? "bg-[var(--surface)] border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                          : "bg-[var(--surface)] border-black/[0.08] hover:border-black/[0.16]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <h4 className="font-semibold text-[var(--ink)] text-xs truncate">
                          {plot.name}
                        </h4>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] ${
                            isPadi
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {plot.crop_type.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--ink-2)]">
                        <span>{plot.variety_name && plot.variety_name !== "-" ? plot.variety_name : "Belum Ditanami"}</span>
                        <span className="font-bold text-emerald-700 tabular-nums">{Number(plot.area_hectares).toFixed(2)} ha</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        <span className="text-[var(--ink-3)]">
                          {plot.current_hst === 0 || !plot.current_phase || plot.current_phase.toLowerCase().includes("bera")
                            ? "Bera / Lahan Terbuka"
                            : plot.current_phase}
                        </span>
                        <span className="font-mono text-[var(--ink-2)] tabular-nums">
                          {plot.current_hst > 0 ? `${plot.current_hst} HST` : "0 HST"}
                        </span>
                      </div>

                      {/* Observasi NDVI pada slider aktif */}
                      {plotNdvi !== null && plotNdvi !== undefined && (
                        <div className="mt-2 flex items-center justify-between text-[10px] px-2 py-1 bg-[var(--field)] rounded-[2px] border border-black/[0.06] font-mono">
                          <span className="text-[var(--ink-3)]">NDVI Observasi:</span>
                          <span className="font-bold text-emerald-700 tabular-nums">{plotNdvi.toFixed(4)}</span>
                        </div>
                      )}

                      <div className="mt-2.5 pt-2 border-t border-black/[0.06] flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSatelliteModalPlot(plot);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-[2px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold border border-emerald-200 transition-colors"
                        >
                          <Radio className="w-3 h-3 text-emerald-600" />
                          <span>Satelit & SAR</span>
                        </button>
                        <Link
                          href={`/petak/${plot.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="py-1 px-2 rounded-[2px] bg-black/[0.04] hover:bg-black/[0.08] text-[var(--ink-2)] text-[10px] font-medium transition-colors"
                        >
                          Detail &rarr;
                        </Link>
                        <button
                          type="button"
                          title="Edit petak (nama, komoditas, varietas, tanggal tanam)"
                          aria-label="Edit petak lahan"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlotToEdit(plot);
                          }}
                          className="py-1 px-1.5 rounded-[2px] bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 transition-colors"
                        >
                          <PencilLine className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Hapus petak lahan"
                          aria-label="Hapus petak lahan"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteError(null);
                            setPlotToDelete(plot);
                          }}
                          className="py-1 px-1.5 rounded-[2px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Edit Petak (deploy patch 2026-09-18) */}
        <EditPlotModal
          isOpen={plotToEdit !== null}
          plot={plotToEdit ?? ({} as Plot)}
          varieties={varieties}
          onClose={() => setPlotToEdit(null)}
          onSuccess={() => {
            setPlotToEdit(null);
            setReloadPlotsTrigger((prev) => prev + 1);
          }}
        />

        {/* Modal Konfirmasi Hapus Petak (deploy patch 2026-09-18) */}
        {plotToDelete && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deletingPlot && setPlotToDelete(null)}
          >
            <div
              className="w-full max-w-md bg-white border border-black/[0.08] rounded-[3px] p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex-shrink-0 rounded-[3px] bg-rose-50 border border-rose-200 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-bold text-[var(--ink)]">Hapus Petak Lahan?</h3>
                  <p className="mt-1 text-[12px] text-[var(--ink-2)] leading-relaxed">
                    Petak <strong className="text-[var(--ink)]">{plotToDelete.name}</strong> akan
                    dihapus permanen dari sistem.
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--ink-3)] bg-[var(--field)] border border-black/[0.08] rounded-[3px] p-2 font-mono leading-relaxed">
                    Peringatan: musim tanam, observasi satelit (NDVI/SAR), akumulasi GDD, dan
                    alert yang terikat pada petak ini ikut terhapus.
                  </p>
                  {deleteError && (
                    <p className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-[3px] p-2 font-mono">
                      {deleteError}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPlotToDelete(null)}
                  disabled={deletingPlot}
                  className="h-[34px] px-3.5 rounded-[3px] border border-black/[0.08] bg-white hover:bg-black/[0.03] text-[var(--ink)] text-[12px] font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeletePlot}
                  disabled={deletingPlot}
                  className="h-[34px] px-3.5 rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-medium transition-colors disabled:opacity-50"
                >
                  {deletingPlot ? "Menghapus..." : "Ya, Hapus Petak"}
                </button>
              </div>
            </div>
          </div>
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

        {/* Modal Pengamatan OPT & Karantina (OPS-06) */}
        <PestScoutingModal
          isOpen={showScoutingModal}
          onClose={() => setShowScoutingModal(false)}
          plotId={selectedPlot ? selectedPlot.id : (plotsRef.current[0]?.id || 1)}
          plotName={selectedPlot ? selectedPlot.name : (plotsRef.current[0]?.name || "Pacitan Bengkok 1")}
          onSuccess={() => {
            fetchScoutingAndBuffer();
          }}
        />
      </div>
    </div>
  );
}
