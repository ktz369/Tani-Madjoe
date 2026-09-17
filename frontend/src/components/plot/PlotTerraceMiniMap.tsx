"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Mountain,
  Compass,
  MapPin,
  Sparkles,
} from "lucide-react";
import { applyMapboxToken, getMapStyle } from "@/lib/mapStyles";
import { BENGKOK_1_COORDINATES, BENGKOK_1_CENTER } from "@/lib/bengkokGeometry";

interface Props {
  plotId: number;
  plotName: string;
  areaHectares?: number;
  polygonCoordinates?: [number, number][];
  compact?: boolean;
}

export default function PlotTerraceMiniMap({
  plotId,
  plotName,
  areaHectares = 0.37,
  polygonCoordinates,
  compact = false,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapStyleType, setMapStyleType] = useState<"satellite" | "streets">("satellite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showVertices, setShowVertices] = useState(true);

  const coords = polygonCoordinates && polygonCoordinates.length >= 3
    ? polygonCoordinates
    : BENGKOK_1_COORDINATES;

  const fitPlotBounds = (map: mapboxgl.Map) => {
    const bounds = new mapboxgl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
  };

  const initLayers = (map: mapboxgl.Map) => {
    // 1. Source Poligon Terasiring
    const geojsonData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: plotName,
            area_hectares: areaHectares,
          },
          geometry: {
            type: "Polygon",
            coordinates: [coords],
          },
        },
      ],
    };

    if (!map.getSource("terrace-plot-source")) {
      map.addSource("terrace-plot-source", {
        type: "geojson",
        data: geojsonData,
      });
    } else {
      (map.getSource("terrace-plot-source") as mapboxgl.GeoJSONSource).setData(geojsonData);
    }

    // 2. Fill Layer
    if (!map.getLayer("terrace-plot-fill")) {
      map.addLayer({
        id: "terrace-plot-fill",
        type: "fill",
        source: "terrace-plot-source",
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.35,
        },
      });
    }

    // 3. Line Layer (Batas Pematang / Galengan Terasiring)
    if (!map.getLayer("terrace-plot-line")) {
      map.addLayer({
        id: "terrace-plot-line",
        type: "line",
        source: "terrace-plot-source",
        paint: {
          "line-color": "#34d399",
          "line-width": 3,
          "line-opacity": 0.95,
        },
      });
    }

    // 4. Vertex Points (24 Titik Sudut WGS84)
    const vertexFeatures: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: coords.map((pt, idx) => ({
        type: "Feature",
        properties: { index: idx + 1, lng: pt[0], lat: pt[1] },
        geometry: { type: "Point", coordinates: pt },
      })),
    };

    if (!map.getSource("terrace-plot-vertices")) {
      map.addSource("terrace-plot-vertices", {
        type: "geojson",
        data: vertexFeatures,
      });
    } else {
      (map.getSource("terrace-plot-vertices") as mapboxgl.GeoJSONSource).setData(vertexFeatures);
    }

    if (!map.getLayer("terrace-plot-vertex-circles")) {
      map.addLayer({
        id: "terrace-plot-vertex-circles",
        type: "circle",
        source: "terrace-plot-vertices",
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#059669",
        },
      });
    }
  };

  // Mount Mapbox
  useEffect(() => {
    if (!mapContainerRef.current) return;

    applyMapboxToken(mapboxgl);

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(mapStyleType) as any,
      center: BENGKOK_1_CENTER,
      zoom: 17.5,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const onReady = () => {
      map.resize();
      initLayers(map);
      fitPlotBounds(map);
      setIsMapReady(true);
    };

    // Re-init layers after every style reload (styledata fires after setStyle)
    map.on("styledata", () => {
      if (map.isStyleLoaded()) {
        initLayers(map);
      }
    });

    if (map.isStyleLoaded()) {
      onReady();
    } else {
      map.once("load", onReady);
    }

    mapRef.current = map;

    // ResizeObserver: trigger map.resize() whenever the container changes size
    // This fixes blank canvas when switching tabs (URL ?tab=...) without page reload
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        requestAnimationFrame(() => {
          try { mapRef.current?.resize(); } catch {}
        });
      }
    });
    if (mapContainerRef.current) {
      ro.observe(mapContainerRef.current);
    }

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [mapStyleType]);


  // Handle visibility of vertices
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    if (map.getLayer("terrace-plot-vertex-circles")) {
      map.setLayoutProperty(
        "terrace-plot-vertex-circles",
        "visibility",
        showVertices ? "visible" : "none"
      );
    }
  }, [showVertices, isMapReady]);

  const handleResetZoom = () => {
    if (mapRef.current) {
      fitPlotBounds(mapRef.current);
    }
  };

  if (compact && !isFullscreen) {
    return (
      <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
        {/* Mobile (<768px): Auto-collapse into a location badge */}
        <div className="md:hidden flex items-center justify-between p-2.5 bg-emerald-50/70 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#1b4332]" />
            <div>
              <span className="text-[11px] font-semibold text-[var(--ink)] block">
                {plotName} ({areaHectares ? areaHectares.toFixed(2) : "0.37"} ha)
              </span>
              <span className="text-[10px] font-mono text-[var(--ink-3)]">
                Citra Satelit & Terasiring WGS84
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(true);
              setTimeout(() => mapRef.current?.resize(), 200);
            }}
            className="h-[28px] px-2.5 rounded-[3px] bg-white border border-black/[0.08] text-[11px] font-medium text-[var(--ink)] hover:bg-black/[0.03] inline-flex items-center gap-1.5 transition-colors shadow-sm"
            title="Buka Peta Ukuran Penuh"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#1b4332]" />
            <span>Peta</span>
          </button>
        </div>

        {/* Desktop (>=768px): Compact Mini-Map 140px */}
        <div className="hidden md:block relative h-[140px] w-full">
          <div ref={mapContainerRef} className="w-full h-full" />
          
          {/* Top-right floating controls */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
            <button
              onClick={() =>
                setMapStyleType((prev) => (prev === "satellite" ? "streets" : "satellite"))
              }
              className="h-[24px] px-2 rounded-[2px] bg-white/90 backdrop-blur-sm border border-black/10 text-[10px] font-medium text-[var(--ink)] hover:bg-white shadow-sm flex items-center gap-1 transition-colors"
              title="Ganti Tampilan Citra Satelit / Peta Vektor"
            >
              <Layers className="w-3 h-3 text-[#1b4332]" />
              <span>{mapStyleType === "satellite" ? "Satelit" : "Vektor"}</span>
            </button>
            <button
              onClick={() => {
                setIsFullscreen(true);
                setTimeout(() => mapRef.current?.resize(), 200);
              }}
              className="h-[24px] px-2 rounded-[2px] bg-white/90 backdrop-blur-sm border border-black/10 text-[10px] font-semibold text-[var(--ink)] hover:bg-white shadow-sm flex items-center gap-1 transition-colors"
              title="Perbesar Peta Layar Penuh"
            >
              <Maximize2 className="w-3 h-3 text-[#1b4332]" />
              <span>Perbesar</span>
            </button>
          </div>

          {/* Bottom-left minimal badge */}
          <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
            <span className="bg-black/75 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-[2px] border border-white/20 shadow-sm inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>{plotName} • 24 Titik WGS84</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border border-black/[0.08] bg-white rounded-[3px] overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-4 z-50 shadow-2xl flex flex-col"
          : "relative"
      }`}
    >
      {/* Top Header Strip */}
      <div className="px-4 py-3 border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-[#1b4332]" />
          <div>
            <h3 className="text-xs font-semibold text-[var(--ink)] flex items-center gap-2">
              <span>Mini-Map Spasial Terasiring Bengkok 1</span>
              <span className="px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-300">
                24 Titik WGS84
              </span>
            </h3>
            <p className="text-[11px] text-[var(--ink-muted)]">
              Citra satelit resolusi tinggi & visualisasi batas kontur pematang terasiring (Pacitan)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle Style Satelit / Topografi */}
          <button
            onClick={() =>
              setMapStyleType((prev) => (prev === "satellite" ? "streets" : "satellite"))
            }
            className="h-[28px] px-2.5 rounded-[3px] border border-black/[0.08] bg-white text-[11px] font-medium text-[var(--ink)] hover:bg-black/[0.03] flex items-center gap-1.5 transition-colors"
            title="Ganti Tampilan Citra Satelit / Peta Vektor"
          >
            <Layers className="w-3.5 h-3.5 text-[#1b4332]" />
            <span>{mapStyleType === "satellite" ? "Citra Satelit" : "Topografi"}</span>
          </button>

          {/* Toggle Verteks */}
          <button
            onClick={() => setShowVertices((prev) => !prev)}
            className={`h-[28px] px-2.5 rounded-[3px] border border-black/[0.08] text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              showVertices
                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                : "bg-white text-[var(--ink-muted)] hover:bg-black/[0.03]"
            }`}
            title="Tampilkan / Sembunyikan 24 Titik Titik Sudut Verteks"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Verteks (24)</span>
          </button>

          {/* Reset Zoom to Plot Bounds */}
          <button
            onClick={handleResetZoom}
            className="h-[28px] px-2.5 rounded-[3px] border border-black/[0.08] bg-white text-[11px] font-medium text-[var(--ink)] hover:bg-black/[0.03] flex items-center gap-1.5 transition-colors"
            title="Auto-FitBounds Zoom 17-18 ke Petak Bengkok 1"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#1b4332]" />
            <span>Fokus Petak</span>
          </button>

          {/* Toggle Fullscreen */}
          <button
            onClick={() => {
              setIsFullscreen((prev) => !prev);
              setTimeout(() => mapRef.current?.resize(), 200);
            }}
            className="h-[28px] px-2 rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink)] hover:bg-black/[0.03] flex items-center transition-colors"
            title={isFullscreen ? "Kecilkan Peta" : "Perbesar Layar Penuh"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Mapbox Canvas Container */}
      <div className={`relative ${isFullscreen ? "flex-1 w-full" : "h-[360px] sm:h-[420px] w-full"}`}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating Telemetry & Geometry Badge */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex flex-col gap-1.5">
          <div className="bg-black/75 backdrop-blur-md text-white text-[11px] font-mono px-3 py-2 rounded-[3px] border border-white/20 shadow-lg space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold font-sans">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Petak Bengkok 1 (0,37 Ha)</span>
            </div>
            <div className="text-[10px] text-slate-300">
              Koordinat: 111.0632°E – 111.0640°E, 8.0839°S – 8.0845°S
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-300 pt-0.5 border-t border-white/10">
              <span>Elevasi: ~327 m dpl</span>
              <span>•</span>
              <span>24 Titik Sudut Presisi</span>
              <span>•</span>
              <span>Teras Bertingkat</span>
            </div>
          </div>
        </div>

        {/* Satellite Source Credit Watermark */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <span className="bg-white/90 backdrop-blur-sm text-[10px] font-mono font-medium text-slate-700 px-2 py-1 rounded-[2px] border border-black/10 shadow-sm">
            {mapStyleType === "satellite"
              ? "Esri World Imagery (High-Res 0.3m)"
              : "OpenStreetMap Topo Layer"}
          </span>
        </div>
      </div>
    </div>
  );
}
