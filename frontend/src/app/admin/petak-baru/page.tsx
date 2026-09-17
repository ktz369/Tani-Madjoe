"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Sprout,
  MapPin,
  Layers,
  Save,
  RotateCcw,
  Undo2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Building2,
  Check,
  Wheat,
  Map,
  UploadCloud,
  FileCode,
  X,
  FileCheck,
  RefreshCw,
  CheckSquare,
  Square,
  Sparkles,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import {
  ModeSegmentedControl,
  SpatialDropzone,
  BatchSummaryCard,
  BatchRecordsTable,
  BatchCompletionModal,
} from "@/components/plot";
import { api } from "@/lib/api";
import { getMapStyle, applyMapboxToken } from "@/lib/mapStyles";
import {
  Company,
  CropVariety,
  Division,
  Estate,
  GeoJSONPolygon,
  PlotCreateRequest,
  PlotImportPreviewResponse,
  PlotBatchImportPreviewResponse,
  PlotBatchItemPreview,
  PlotBatchCreateRequest,
  PlotBatchCreateResponse,
  PlotResponse,
} from "@/types";

export interface BatchPlotRow {
  id: string;
  selected: boolean;
  name: string;
  crop_type: "padi" | "jagung";
  variety_id: number | "";
  planting_date: string;
  geometry: GeoJSONPolygon;
  area_hectares: number;
  area_m2: number;
  vertex_count: number;
  bounding_box: [number, number, number, number];
  centroid: [number, number];
  warnings: string[];
}


// Earth radius in meters for spherical polygon area calculation
const EARTH_RADIUS = 6378137.0;

/**
 * Calculate accurate spherical polygon area in hectares from WGS84 coordinates [[lng, lat], ...]
 */
function calculateHectares(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const pts =
    coords.length > 3 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords;

  const n = pts.length;
  if (n < 3) return 0;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const prevLng = (pts[(i - 1 + n) % n][0] * Math.PI) / 180;
    const nextLng = (pts[(i + 1 + n) % n][0] * Math.PI) / 180;
    const currLat = (pts[i][1] * Math.PI) / 180;
    total += (nextLng - prevLng) * Math.sin(currLat);
  }

  const areaM2 = Math.abs((total * (EARTH_RADIUS * EARTH_RADIUS)) / 2.0);
  return Number((areaM2 / 10000).toFixed(4));
}


export default function PetakBaruPage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Organization state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");
  const [selectedEstateId, setSelectedEstateId] = useState<number | "">("");
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | "">("");

  // Varieties state
  const [varieties, setVarieties] = useState<CropVariety[]>([]);

  // Form state
  const [plotName, setPlotName] = useState("");
  const [cropType, setCropType] = useState<"padi" | "jagung">("padi");
  const [selectedVarietyId, setSelectedVarietyId] = useState<number | "">("");
  const [plantingDate, setPlantingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [currentHstPreview, setCurrentHstPreview] = useState(0);

  // Polygon Drawing state (coordinates in [lng, lat])
  const [drawnCoords, setDrawnCoords] = useState<[number, number][]>([]);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);
  const [calculatedAreaHa, setCalculatedAreaHa] = useState<number>(0);
  const [mapStyleType, setMapStyleType] = useState<"satellite" | "streets">(
    "satellite"
  );

  // Wave 7: Geospatial File Import state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [importedFileInfo, setImportedFileInfo] = useState<{
    fileName: string;
    format: string;
    vertexCount: number;
    areaHa: number;
    warnings: string[];
  } | null>(null);

  // UI status
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPlot, setSuccessPlot] = useState<PlotResponse | null>(null);

  // Wave 8: Mode Tab & Batch Import Wizard state
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const [batchUploadLoading, setBatchUploadLoading] = useState(false);
  const [batchIsDragging, setBatchIsDragging] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    fileName: string;
    format: string;
    totalPlots: number;
    totalAreaHa: number;
    totalAreaM2: number;
    unifiedBbox: [number, number, number, number];
  } | null>(null);
  const [batchRows, setBatchRows] = useState<BatchPlotRow[]>([]);
  const [batchBulkCropType, setBatchBulkCropType] = useState<"padi" | "jagung">("padi");
  const [batchBulkVarietyId, setBatchBulkVarietyId] = useState<number | "">("");
  const [batchBulkPlantingDate, setBatchBulkPlantingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [batchSubmitLoading, setBatchSubmitLoading] = useState(false);
  const [batchSuccessResult, setBatchSuccessResult] = useState<PlotBatchCreateResponse | null>(null);


  // 1. Initial Data Fetch (Companies & Varieties)
  useEffect(() => {
    async function loadInitialData() {
      try {
        setInitialLoading(true);
        const [compRes, varRes] = await Promise.all([
          api.get<Company[]>("/companies"),
          api.get<CropVariety[]>("/varieties"),
        ]);
        setCompanies(compRes.data);
        setVarieties(varRes.data);

        // Auto-select first company if available
        if (compRes.data.length > 0) {
          const firstComp = compRes.data[0];
          setSelectedCompanyId(firstComp.id);
        }
      } catch (err: any) {
        console.error("Gagal memuat data awal:", err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // 2. Fetch Estates when Company changes
  useEffect(() => {
    if (!selectedCompanyId) {
      setEstates([]);
      setSelectedEstateId("");
      return;
    }
    api
      .get<Estate[]>(`/estates?company_id=${selectedCompanyId}`)
      .then((res) => {
        setEstates(res.data);
        if (res.data.length > 0) {
          setSelectedEstateId(res.data[0].id);
        } else {
          setSelectedEstateId("");
        }
      })
      .catch((err) => console.error("Gagal memuat estate:", err));
  }, [selectedCompanyId]);

  // 3. Fetch Divisions when Estate changes & Center Map
  useEffect(() => {
    if (!selectedEstateId) {
      setDivisions([]);
      setSelectedDivisionId("");
      return;
    }
    api
      .get<Division[]>(`/divisions?estate_id=${selectedEstateId}`)
      .then((res) => {
        setDivisions(res.data);
        if (res.data.length > 0) {
          setSelectedDivisionId(res.data[0].id);
        } else {
          setSelectedDivisionId("");
        }
      })
      .catch((err) => console.error("Gagal memuat divisi:", err));

    // Fly map to estate location
    const currEstate = estates.find((e) => e.id === Number(selectedEstateId));
    if (
      currEstate &&
      currEstate.latitude &&
      currEstate.longitude &&
      mapRef.current
    ) {
      mapRef.current.flyTo({
        center: [currEstate.longitude, currEstate.latitude],
        zoom: 15,
        essential: true,
      });
    }
  }, [selectedEstateId, estates]);

  // 4. Calculate HST Preview when plantingDate changes
  useEffect(() => {
    if (plantingDate) {
      const today = new Date();
      const pDate = new Date(plantingDate);
      const diffTime = today.getTime() - pDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      setCurrentHstPreview(diffDays >= 0 ? diffDays : 0);
    } else {
      setCurrentHstPreview(0);
    }
  }, [plantingDate]);

  // Filtered varieties per cropType
  const filteredVarieties = varieties.filter((v) => v.crop_type === cropType);

  // Auto-select first matching variety when cropType changes
  useEffect(() => {
    if (filteredVarieties.length > 0) {
      setSelectedVarietyId(filteredVarieties[0].id);
    } else {
      setSelectedVarietyId("");
    }
  }, [cropType, varieties]);

  // Track activeTab and data in refs for Mapbox event handlers and style switching
  const activeTabRef = useRef<"single" | "batch">("single");
  const batchRowsRef = useRef<BatchPlotRow[]>([]);
  const drawnCoordsRef = useRef<[number, number][]>([]);
  const isPolygonClosedRef = useRef<boolean>(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    batchRowsRef.current = batchRows;
  }, [batchRows]);

  useEffect(() => {
    drawnCoordsRef.current = drawnCoords;
    isPolygonClosedRef.current = isPolygonClosed;
  }, [drawnCoords, isPolygonClosed]);

  // 5. Initialize Mapbox Map
  useEffect(() => {
    if (!mapContainer.current) return;

    applyMapboxToken(mapboxgl);

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: getMapStyle("satellite"),
      center: [111.0636, -8.0843], // Wilayah Kerja Pacitan
      zoom: 14,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    const syncBatchPolygons = () => {
      const batchSource = map.getSource("batch-polygons-source") as mapboxgl.GeoJSONSource;
      if (!batchSource) return;

      if (activeTabRef.current !== "batch" || batchRowsRef.current.length === 0) {
        batchSource.setData({
          type: "FeatureCollection",
          features: [],
        });
        return;
      }

      const features = batchRowsRef.current.map((row, idx) => ({
        type: "Feature" as const,
        geometry: row.geometry,
        properties: {
          index: idx,
          name: row.name,
          selected: row.selected,
          fillColor: row.selected ? "#10b981" : "#94a3b8",
          fillOpacity: row.selected ? 0.45 : 0.15,
          lineColor: row.selected ? "#047857" : "#64748b",
          lineWidth: row.selected ? 2.5 : 1.5,
        },
      }));

      batchSource.setData({
        type: "FeatureCollection",
        features,
      });
    };

    const syncDrawnPolygons = () => {
      const source = map.getSource("drawn-polygon-source") as mapboxgl.GeoJSONSource;
      if (!source) return;

      const coords = drawnCoordsRef.current;
      const isClosed = isPolygonClosedRef.current;

      if (activeTabRef.current === "batch" || coords.length === 0) {
        source.setData({
          type: "FeatureCollection",
          features: [],
        });
        return;
      }

      const features: any[] = [];
      coords.forEach((pt, idx) => {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: pt,
          },
          properties: { index: idx },
        });
      });

      if (coords.length >= 2) {
        if (isClosed && coords.length >= 3) {
          const closed =
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]
              ? coords
              : [...coords, coords[0]];

          features.push({
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [closed],
            },
          });
        } else {
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          });
        }
      }

      source.setData({
        type: "FeatureCollection",
        features,
      });
    };

    const setupLayers = () => {
      if (!map.getSource("drawn-polygon-source")) {
        map.addSource("drawn-polygon-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.getLayer("drawn-polygon-fill")) {
        map.addLayer({
          id: "drawn-polygon-fill",
          type: "fill",
          source: "drawn-polygon-source",
          paint: {
            "fill-color": "#10b981", // Emerald
            "fill-opacity": 0.4,
          },
        });
      }

      if (!map.getLayer("drawn-polygon-line")) {
        map.addLayer({
          id: "drawn-polygon-line",
          type: "line",
          source: "drawn-polygon-source",
          paint: {
            "line-color": "#059669",
            "line-width": 3,
            "line-dasharray": [1, 0],
          },
        });
      }

      if (!map.getLayer("drawn-polygon-points")) {
        map.addLayer({
          id: "drawn-polygon-points",
          type: "circle",
          source: "drawn-polygon-source",
          paint: {
            "circle-radius": 6,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#047857",
            "circle-stroke-width": 2,
          },
        });
      }

      // Wave 8: Batch multi-polygon source and layers
      if (!map.getSource("batch-polygons-source")) {
        map.addSource("batch-polygons-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
      }

      if (!map.getLayer("batch-polygons-fill")) {
        map.addLayer({
          id: "batch-polygons-fill",
          type: "fill",
          source: "batch-polygons-source",
          paint: {
            "fill-color": ["get", "fillColor"],
            "fill-opacity": ["get", "fillOpacity"],
          },
        });
      }

      if (!map.getLayer("batch-polygons-line")) {
        map.addLayer({
          id: "batch-polygons-line",
          type: "line",
          source: "batch-polygons-source",
          paint: {
            "line-color": ["get", "lineColor"],
            "line-width": ["get", "lineWidth"],
          },
        });
      }

      // Restore spatial data onto recreated layers after style change
      syncBatchPolygons();
      syncDrawnPolygons();

      map.resize();
      setTimeout(() => {
        if (mapRef.current) mapRef.current.resize();
      }, 150);
    };

    map.on("load", setupLayers);
    map.on("style.load", setupLayers);
    if (map.isStyleLoaded()) {
      setupLayers();
    }

    // Map Click Listener to add polygon vertices
    map.on("click", (e) => {
      // In batch mode, clicking on map should not draw manual single polygon
      if (activeTabRef.current === "batch") return;

      const newPt: [number, number] = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];

      setDrawnCoords((prev) => {
        // If already closed, restart drawing with new point
        const updated = isPolygonClosed ? [newPt] : [...prev, newPt];
        return updated;
      });
      setIsPolygonClosed(false);
    });

    mapRef.current = map;

    const handleWindowResize = () => {
      map.resize();
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Wave 8: Sync Batch Polygons to Mapbox GeoJSON source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const batchSource = map.getSource("batch-polygons-source") as mapboxgl.GeoJSONSource;
    if (!batchSource) return;

    if (activeTab !== "batch" || batchRows.length === 0) {
      batchSource.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const features = batchRows.map((row, idx) => ({
      type: "Feature" as const,
      geometry: row.geometry,
      properties: {
        index: idx,
        name: row.name,
        selected: row.selected,
        fillColor: row.selected ? "#10b981" : "#94a3b8",
        fillOpacity: row.selected ? 0.45 : 0.15,
        lineColor: row.selected ? "#047857" : "#64748b",
        lineWidth: row.selected ? 2.5 : 1.5,
      },
    }));

    batchSource.setData({
      type: "FeatureCollection",
      features,
    });
  }, [activeTab, batchRows]);

  // 6. Update Map GeoJSON layers whenever drawnCoords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("drawn-polygon-source") as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (activeTab === "batch" || drawnCoords.length === 0) {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
      if (activeTab === "single") setCalculatedAreaHa(0);
      return;
    }


    // Calculate live area
    const area = calculateHectares(drawnCoords);
    setCalculatedAreaHa(area);

    const features: any[] = [];

    // Points feature
    drawnCoords.forEach((pt, idx) => {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: pt,
        },
        properties: { index: idx },
      });
    });

    // Line or Polygon feature
    if (drawnCoords.length >= 2) {
      if (isPolygonClosed && drawnCoords.length >= 3) {
        const closed =
          drawnCoords[0][0] === drawnCoords[drawnCoords.length - 1][0] &&
          drawnCoords[0][1] === drawnCoords[drawnCoords.length - 1][1]
            ? drawnCoords
            : [...drawnCoords, drawnCoords[0]];

        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [closed],
          },
        });
      } else {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: drawnCoords,
          },
        });
      }
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }, [drawnCoords, isPolygonClosed]);

  // Handle closing polygon
  const handleClosePolygon = () => {
    if (drawnCoords.length < 3) return;
    setIsPolygonClosed(true);
    const area = calculateHectares(drawnCoords);
    setCalculatedAreaHa(area);
  };

  // Undo last vertex
  const handleUndoPoint = () => {
    if (drawnCoords.length === 0) return;
    setDrawnCoords((prev) => prev.slice(0, -1));
    setIsPolygonClosed(false);
  };

  // Clear polygon
  const handleClearPolygon = () => {
    setDrawnCoords([]);
    setIsPolygonClosed(false);
    setCalculatedAreaHa(0);
    setImportedFileInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Wave 7: Handle Geospatial File Upload (KML / KMZ / GeoJSON)
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setErrorMessage(null);
    setUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post<PlotImportPreviewResponse>(
        "/plots/import-preview",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const data = res.data;

      // 1. Auto-fill plot name if available
      if (data.name) {
        setPlotName(data.name);
      }

      // 2. Set coordinates and close polygon
      const rings = data.geometry.coordinates;
      if (rings && rings.length > 0) {
        const extRing = rings[0] as [number, number][];
        setDrawnCoords(extRing);
        setIsPolygonClosed(true);
      }

      // 3. Set area in hectares
      setCalculatedAreaHa(data.area_hectares);

      // 4. Save metadata for badge display
      setImportedFileInfo({
        fileName: file.name,
        format: data.format,
        vertexCount: data.vertex_count,
        areaHa: data.area_hectares,
        warnings: data.warnings || [],
      });

      // 5. Fit bounds to Mapbox map with smooth transition (Ticket 05)
      if (mapRef.current && data.bounding_box) {
        const [minLng, minLat, maxLng, maxLat] = data.bounding_box;
        mapRef.current.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 70, bottom: 70, left: 70, right: 70 },
            duration: 1500,
            maxZoom: 18,
          }
        );
      }
    } catch (err: any) {
      console.error("Gagal mengimpor berkas geospasial:", err);
      const msg =
        err.response?.data?.detail ||
        "Gagal memproses berkas geospasial. Pastikan berkas KML, KMZ, atau GeoJSON valid.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Wave 7: Reset imported file state
  const handleResetImport = () => {
    setImportedFileInfo(null);
    setPlotName("");
    setDrawnCoords([]);
    setIsPolygonClosed(false);
    setCalculatedAreaHa(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Wave 8: Handle Batch Geospatial File Upload (Multi-Placemark KML / KMZ / GeoJSON)
  const handleBatchFileUpload = async (file: File) => {
    if (!file) return;
    setErrorMessage(null);
    setBatchUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post<PlotBatchImportPreviewResponse>(
        "/plots/batch-import-preview",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const data = res.data;

      setBatchSummary({
        fileName: file.name,
        format: data.format,
        totalPlots: data.total_plots,
        totalAreaHa: data.total_area_hectares,
        totalAreaM2: data.total_area_m2,
        unifiedBbox: data.unified_bounding_box,
      });

      // Map rows with defaults from bulk settings
      const rows: BatchPlotRow[] = data.plots.map((p, idx) => ({
        id: `plot-${idx}-${Date.now()}`,
        selected: true,
        name: p.name || `Petak ${idx + 1}`,
        crop_type: batchBulkCropType,
        variety_id: batchBulkVarietyId,
        planting_date: batchBulkPlantingDate,
        geometry: p.geometry,
        area_hectares: p.area_hectares,
        area_m2: p.area_m2,
        vertex_count: p.vertex_count,
        bounding_box: p.bounding_box,
        centroid: p.centroid,
        warnings: p.warnings || [],
      }));

      setBatchRows(rows);

      // Fit map to unified bounding box
      if (mapRef.current && data.unified_bounding_box) {
        const [minLng, minLat, maxLng, maxLat] = data.unified_bounding_box;
        mapRef.current.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 70, bottom: 70, left: 70, right: 70 },
            duration: 1500,
            maxZoom: 17,
          }
        );
      }
    } catch (err: any) {
      console.error("Gagal mengimpor batch berkas geospasial:", err);
      const msg =
        err.response?.data?.detail ||
        "Gagal memproses berkas geospasial massal. Pastikan format berkas valid.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setBatchUploadLoading(false);
      if (batchFileInputRef.current) {
        batchFileInputRef.current.value = "";
      }
    }
  };

  // Wave 8: Reset Batch Import
  const handleResetBatchImport = () => {
    setBatchSummary(null);
    setBatchRows([]);
    setBatchSuccessResult(null);
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = "";
    }
  };

  // Wave 8: Apply quick bulk controls to selected rows
  const handleApplyBatchSettings = () => {
    setBatchRows((prev) =>
      prev.map((row) => {
        if (!row.selected) return row;
        return {
          ...row,
          crop_type: batchBulkCropType,
          variety_id: batchBulkVarietyId,
          planting_date: batchBulkPlantingDate,
        };
      })
    );
  };

  // Wave 8: Toggle select all batch rows
  const handleToggleSelectAll = (select: boolean) => {
    setBatchRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: select,
      }))
    );
  };

  // Wave 8: Toggle single batch row selection
  const handleToggleRowSelect = (index: number) => {
    setBatchRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  // Wave 8: Update individual row field
  const handleUpdateRowField = (
    index: number,
    field: keyof BatchPlotRow,
    val: any
  ) => {
    setBatchRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, [field]: val };
        // If crop_type changed, reset variety if incompatible
        if (field === "crop_type") {
          const currentVar = varieties.find((v) => v.id === r.variety_id);
          if (currentVar && currentVar.crop_type !== val) {
            updated.variety_id = "";
          }
        }
        return updated;
      })
    );
  };

  // Wave 8: Focus Map on specific batch row
  const handleFocusBatchPlot = (row: BatchPlotRow) => {
    if (!mapRef.current) return;
    if (row.bounding_box && row.bounding_box.length === 4) {
      const [minLng, minLat, maxLng, maxLat] = row.bounding_box;
      mapRef.current.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: { top: 100, bottom: 100, left: 100, right: 100 },
          duration: 1000,
          maxZoom: 18,
        }
      );
    }
  };

  // Wave 8: Submit Batch Plots Registration
  const handleSubmitBatchPlots = async () => {
    setErrorMessage(null);

    if (!selectedDivisionId) {
      setErrorMessage("Silakan pilih Divisi / Afdeling tujuan terlebih dahulu.");
      return;
    }

    const selectedPlots = batchRows.filter((r) => r.selected);
    if (selectedPlots.length === 0) {
      setErrorMessage("Pilih minimal satu petak lahan untuk didaftarkan.");
      return;
    }

    const payload: PlotBatchCreateRequest = {
      division_id: Number(selectedDivisionId),
      plots: selectedPlots.map((r) => ({
        name: r.name.trim() || "Petak Lahan",
        crop_type: r.crop_type,
        variety_id: r.variety_id ? Number(r.variety_id) : null,
        planting_date: r.planting_date || null,
        polygon: r.geometry,
      })),
    };

    try {
      setBatchSubmitLoading(true);
      const res = await api.post<PlotBatchCreateResponse>("/plots/batch-create", payload);
      setBatchSuccessResult(res.data);
    } catch (err: any) {
      console.error("Gagal mendaftarkan petak secara massal:", err);
      const msg =
        err.response?.data?.detail ||
        "Gagal menyimpan petak lahan secara massal. Silakan periksa kembali data.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setBatchSubmitLoading(false);
    }
  };

  // Change Map Style
  const toggleMapStyle = (style: "satellite" | "streets") => {
    if (!mapRef.current || mapStyleType === style) return;
    setMapStyleType(style);
    applyMapboxToken(mapboxgl);
    mapRef.current.setStyle(getMapStyle(style));
  };

  // 7. Save Plot Submit Handler (Ticket 06)
  const handleSubmitPlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedDivisionId) {
      setErrorMessage("Silakan pilih Divisi / Afdeling terlebih dahulu.");
      return;
    }
    if (!plotName.trim()) {
      setErrorMessage("Nama petak wajib diisi.");
      return;
    }
    if (drawnCoords.length < 3) {
      setErrorMessage("Poligon harus memiliki minimal 3 titik sudut di peta.");
      return;
    }

    // Ensure polygon is closed
    const ring =
      drawnCoords[0][0] === drawnCoords[drawnCoords.length - 1][0] &&
      drawnCoords[0][1] === drawnCoords[drawnCoords.length - 1][1]
        ? drawnCoords
        : [...drawnCoords, drawnCoords[0]];

    const payload: PlotCreateRequest = {
      name: plotName.trim(),
      division_id: Number(selectedDivisionId),
      crop_type: cropType,
      variety_id: selectedVarietyId ? Number(selectedVarietyId) : null,
      planting_date: plantingDate || null,
      polygon: {
        type: "Polygon",
        coordinates: [ring],
      },
    };

    try {
      setLoading(true);
      const res = await api.post<PlotResponse>(
        `/divisions/${selectedDivisionId}/plots`,
        payload
      );
      setSuccessPlot(res.data);
      // Automatically redirect to plot detail after 1.8 seconds (Ticket 06)
      setTimeout(() => {
        router.push(`/petak/${res.data.id}`);
      }, 1800);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || "Gagal menyimpan petak lahan. Silakan coba lagi.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] pt-[68px] flex flex-col text-[var(--ink)]">
      <Navbar />

      {/* Main Workspace Layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: Form Panel */}
        <div
          className={`${
            activeTab === "batch"
              ? "w-full lg:w-[550px] xl:w-[610px]"
              : "w-full lg:w-[377px] xl:w-[377px]"
          } bg-white border-r border-black/[0.08] flex flex-col h-auto lg:h-[calc(100vh-68px)] overflow-y-auto z-10 transition-all duration-300`}
        >
          {/* Header */}
          <div className="px-[21px] py-[16px] border-b border-black/[0.08] bg-white">
            <div className="flex items-center justify-between mb-2">
              <Link
                href="/peta"
                className="inline-flex items-center gap-1.5 px-[8px] py-[4px] rounded-[3px] text-[12.5px] text-[var(--ink-2)] hover:bg-[var(--hover)] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Peta Lahan</span>
              </Link>
              <span className="text-[11px] font-medium px-[8px] py-[2px] bg-emerald-50 text-[var(--accent-ink)] border border-black/[0.08] rounded-[3px]">
                SaaS Pertanian
              </span>
            </div>
            <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--ink)] flex items-center gap-2">
              <Sprout className="w-5 h-5 text-[var(--accent)]" />
              <span>{activeTab === "batch" ? "Impor Massal Petak (Batch)" : "Daftar Petak Baru"}</span>
            </h1>
            <p className="text-[12.5px] text-[var(--ink-2)] font-normal leading-relaxed mt-1">
              {activeTab === "batch"
                ? "Unggah berkas KML / KMZ / GeoJSON multi-poligon untuk mendaftarkan banyak petak sekaligus."
                : "Gambar batas poligon di peta lalu lengkapi informasi agronomis petak."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="px-[21px] py-[13px] border-b border-black/[0.08] bg-[var(--field)]">
            <ModeSegmentedControl
              activeTab={activeTab}
              onChange={(tab) => {
                setActiveTab(tab);
                setErrorMessage(null);
              }}
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mx-[21px] mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[12px] rounded-[3px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Single Plot Mode Content */}
          {activeTab === "single" && (
            <>
              {/* Success Notification Banner */}
              {successPlot && (
                <div className="p-4 bg-emerald-50 border-b border-black/[0.08] text-[var(--accent-ink)] text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--ink)]">
                        Petak &quot;{successPlot.name}&quot; Berhasil Didaftarkan!
                      </p>
                      <p className="text-xs text-[var(--ink-2)] mt-0.5">
                        Luas: <span className="font-bold text-[var(--ink)]">{successPlot.area_hectares} ha</span> | Tanaman:{" "}
                        <span className="capitalize font-semibold text-[var(--ink)]">{successPlot.crop_type}</span>
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Link
                          href={`/petak/${successPlot.id}`}
                          className="h-[30px] px-[13px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] text-white text-xs font-medium flex items-center transition-colors"
                        >
                          Buka Detail Petak &rarr;
                        </Link>
                        <Link
                          href="/peta"
                          className="h-[30px] px-[13px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)] text-xs font-medium flex items-center transition-colors"
                        >
                          Peta Lahan
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setSuccessPlot(null);
                            setPlotName("");
                            setDrawnCoords([]);
                            setIsPolygonClosed(false);
                            setCalculatedAreaHa(0);
                            setImportedFileInfo(null);
                          }}
                          className="h-[30px] px-[13px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)] text-xs font-medium flex items-center transition-colors"
                        >
                          Tambah Lain
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Registration Form */}
              <form onSubmit={handleSubmitPlot} className="p-[21px] space-y-[16px] flex-1">
                {/* Wave 7 & 9: Spatial Dropzone */}
                <div className="space-y-2 pb-[16px] border-b border-black/[0.08]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">
                      <UploadCloud className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Impor Berkas Geospasial</span>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--accent)] bg-emerald-50 border border-black/[0.08] px-2 py-0.5 rounded-[3px]">
                      KML / KMZ / GeoJSON
                    </span>
                  </div>

                  <SpatialDropzone
                    onFileUpload={handleFileUpload}
                    loading={uploadLoading}
                    label="Tarik & lepas berkas KML / KMZ / GeoJSON"
                    sublabel="atau pilih dari komputer"
                    fileInfo={
                      importedFileInfo
                        ? {
                            fileName: importedFileInfo.fileName,
                            format: importedFileInfo.format,
                            vertexCount: importedFileInfo.vertexCount,
                            areaHa: importedFileInfo.areaHa,
                            warnings: importedFileInfo.warnings,
                          }
                        : null
                    }
                    onReset={handleResetImport}
                  />
                </div>

                {/* 1. Hierarchy Selectors */}
                <div className="space-y-[13px] pb-[16px] border-b border-black/[0.08]">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">
                    <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Hierarki Lokasi Petak</span>
                  </div>

                  {/* Perusahaan */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Perusahaan
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(Number(e.target.value) || "")}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      required
                    >
                      <option value="">-- Pilih Perusahaan --</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estate */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Perkebunan / Estate
                    </label>
                    <select
                      value={selectedEstateId}
                      onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                      disabled={!selectedCompanyId || estates.length === 0}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-[var(--field)] disabled:text-[var(--ink-3)]"
                      required
                    >
                      <option value="">-- Pilih Estate --</option>
                      {estates.map((est) => (
                        <option key={est.id} value={est.id}>
                          {est.name} ({est.province || "Indonesia"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Divisi */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Divisi / Afdeling
                    </label>
                    <select
                      value={selectedDivisionId}
                      onChange={(e) => setSelectedDivisionId(Number(e.target.value) || "")}
                      disabled={!selectedEstateId || divisions.length === 0}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-[var(--field)] disabled:text-[var(--ink-3)]"
                      required
                    >
                      <option value="">-- Pilih Divisi --</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Plot Name & Agronomics */}
                <div className="space-y-[13px] pb-[16px] border-b border-black/[0.08]">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Nama Petak Lahan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Petak A1 - Blok Utara"
                      value={plotName}
                      onChange={(e) => setPlotName(e.target.value)}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      required
                    />
                  </div>

                  {/* Crop Type Selector */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1.5">
                      Komoditas Tanaman
                    </label>
                    <div className="grid grid-cols-2 gap-[8px]">
                      <button
                        type="button"
                        onClick={() => setCropType("padi")}
                        className={`flex items-center justify-center gap-2 h-[34px] px-[13px] rounded-[3px] text-[13px] font-medium transition-colors ${
                          cropType === "padi"
                            ? "bg-emerald-50 border border-[var(--accent)] text-[var(--accent-ink)]"
                            : "border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)]"
                        }`}
                      >
                        <Sprout className="w-4 h-4 text-[var(--accent)]" />
                        <span>Padi (Oryza)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropType("jagung")}
                        className={`flex items-center justify-center gap-2 h-[34px] px-[13px] rounded-[3px] text-[13px] font-medium transition-colors ${
                          cropType === "jagung"
                            ? "bg-amber-50 border border-amber-300 text-amber-900"
                            : "border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)]"
                        }`}
                      >
                        <Wheat className="w-4 h-4 text-amber-600" />
                        <span>Jagung (Zea Mays)</span>
                      </button>
                    </div>
                  </div>

                  {/* Variety Dropdown */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Varietas Benih
                    </label>
                    <select
                      value={selectedVarietyId}
                      onChange={(e) => setSelectedVarietyId(Number(e.target.value) || "")}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">-- Pilih Varietas ({cropType}) --</option>
                      {filteredVarieties.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (Siklus: {v.cycle_days} hari)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Planting Date & Calculated HST */}
                  <div className="grid grid-cols-2 gap-[8px]">
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                        Tanggal Tanam
                      </label>
                      <input
                        type="date"
                        value={plantingDate}
                        onChange={(e) => setPlantingDate(e.target.value)}
                        className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                        Hari Setelah Tanam
                      </label>
                      <div className="w-full h-[34px] px-[13px] bg-[var(--field)] border border-black/[0.08] rounded-[3px] text-[12px] font-mono tabular-nums font-semibold text-[var(--accent-ink)] flex items-center justify-center">
                        {currentHstPreview} HST
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Polygon Geometry Status */}
                <div className="space-y-[13px] pb-[16px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Status Poligon Peta</span>
                    </span>
                    <span
                      className={`text-[11px] font-medium px-[8px] py-[2px] rounded-[3px] border border-black/[0.08] ${
                        drawnCoords.length >= 3
                          ? "bg-emerald-50 text-[var(--accent-ink)]"
                          : "bg-[var(--field)] text-[var(--ink-2)]"
                      }`}
                    >
                      {drawnCoords.length} Titik Sudut
                    </span>
                  </div>

                  <div className="bg-white p-[13px] rounded-[3px] border border-black/[0.08] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-[var(--ink-2)] block">Luas Terhitung:</span>
                      <span className="text-[18px] font-bold text-[var(--accent)] font-mono tabular-nums">
                        {calculatedAreaHa.toFixed(2)}{" "}
                        <span className="text-[12px] font-medium text-[var(--ink-2)]">hektar</span>
                      </span>
                    </div>
                    <div className="text-right text-[12px] text-[var(--ink-2)] font-mono tabular-nums">
                      <span>{(calculatedAreaHa * 10000).toLocaleString("id-ID")} m²</span>
                    </div>
                  </div>

                  {/* Polygon Controls */}
                  <div className="flex items-center gap-[8px] pt-1">
                    <button
                      type="button"
                      onClick={handleClosePolygon}
                      disabled={drawnCoords.length < 3 || isPolygonClosed}
                      className="flex-1 h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] disabled:opacity-40 text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Tutup Poligon</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUndoPoint}
                      disabled={drawnCoords.length === 0}
                      className="h-[34px] px-[13px] rounded-[3px] border border-black/[0.08] bg-white text-[var(--ink-2)] hover:bg-[var(--hover)] disabled:opacity-40 text-[13px] transition-colors flex items-center justify-center"
                      title="Hapus titik terakhir"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPolygon}
                      disabled={drawnCoords.length === 0}
                      className="h-[34px] px-[13px] rounded-[3px] border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-[13px] transition-colors flex items-center justify-center"
                      title="Hapus semua titik"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || drawnCoords.length < 3}
                    className="w-full h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-[#047857] disabled:opacity-40 text-white font-medium text-[13px] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Menyimpan ke Database...</span>
                      </div>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Simpan & Daftarkan Petak</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Batch Import Wizard Mode Content */}
          {activeTab === "batch" && (
            <div className="p-[21px] space-y-[16px] flex-1">
              {/* Destination Hierarchy Selectors */}
              <div className="space-y-[13px] pb-[16px] border-b border-black/[0.08]">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">
                  <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Divisi Tujuan Pendaftaran Massal</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-[8px]">
                  {/* Perusahaan */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Perusahaan
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(Number(e.target.value) || "")}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[10px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">-- Pilih --</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estate */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Estate
                    </label>
                    <select
                      value={selectedEstateId}
                      onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                      disabled={!selectedCompanyId || estates.length === 0}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[10px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-[var(--field)] disabled:text-[var(--ink-3)]"
                    >
                      <option value="">-- Pilih --</option>
                      {estates.map((est) => (
                        <option key={est.id} value={est.id}>
                          {est.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Divisi */}
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-2)] mb-1">
                      Divisi <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedDivisionId}
                      onChange={(e) => setSelectedDivisionId(Number(e.target.value) || "")}
                      disabled={!selectedEstateId || divisions.length === 0}
                      className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[10px] text-[13px] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] disabled:bg-[var(--field)] disabled:text-[var(--ink-3)] font-medium"
                    >
                      <option value="">-- Pilih Divisi --</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Batch Upload Dropzone when no summary yet */}
              {!batchSummary ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-3)] font-semibold">
                      <UploadCloud className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Unggah Berkas Koleksi Multi-Petak</span>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--accent)] bg-emerald-50 border border-black/[0.08] px-2 py-0.5 rounded-[3px]">
                      KML / KMZ / GeoJSON
                    </span>
                  </div>
                  <SpatialDropzone
                    onFileUpload={handleBatchFileUpload}
                    loading={batchUploadLoading}
                    label="Tarik & lepas berkas KML / KMZ / GeoJSON multi-poligon"
                    sublabel="atau pilih dari komputer (Folder Placemarks)"
                    fileInfo={null}
                  />
                </div>
              ) : (
                <>
                  {/* Batch Summary Card (Task Rows & Quick Bulk) */}
                  <BatchSummaryCard
                    summary={batchSummary}
                    selectedCount={batchRows.filter((r) => r.selected).length}
                    onReset={handleResetBatchImport}
                    bulkCropType={batchBulkCropType}
                    onBulkCropTypeChange={setBatchBulkCropType}
                    bulkVarietyId={batchBulkVarietyId}
                    onBulkVarietyIdChange={setBatchBulkVarietyId}
                    bulkPlantingDate={batchBulkPlantingDate}
                    onBulkPlantingDateChange={setBatchBulkPlantingDate}
                    varieties={varieties}
                    onApplyBulk={handleApplyBatchSettings}
                  />

                  {/* Batch Review Records Table */}
                  {batchRows.length > 0 && (
                    <BatchRecordsTable
                      rows={batchRows}
                      varieties={varieties}
                      onToggleSelectAll={handleToggleSelectAll}
                      onToggleRowSelect={handleToggleRowSelect}
                      onUpdateField={handleUpdateRowField}
                      onFocusPlot={handleFocusBatchPlot}
                      onSubmit={handleSubmitBatchPlots}
                      loading={batchSubmitLoading}
                      disabled={!selectedDivisionId}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Interactive Mapbox Map */}
        <div className="flex-1 relative h-[500px] lg:h-[calc(100vh-68px)] w-full bg-[var(--canvas)] p-3">
          {/* Preview Map Container: flat with border border-black/[0.08] rounded-[3px] */}
          <div className="w-full h-full relative border border-black/[0.08] rounded-[3px] overflow-hidden bg-white">
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

            {/* Map Floating Top Toolbar */}
            <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
              {/* Drawing Instructions Badge */}
              <div className="px-[13px] py-[6px] bg-white/90 backdrop-blur-md rounded-[3px] border border-black/[0.08] text-[12px] font-medium text-[var(--ink)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                <span>
                  {activeTab === "batch"
                    ? batchRows.length === 0
                      ? "Unggah berkas KML/GeoJSON koleksi untuk melihat semua poligon di peta"
                      : `${batchRows.filter((r) => r.selected).length} dari ${batchRows.length} petak terpilih ditampilkan di peta.`
                    : drawnCoords.length === 0
                    ? "Unggah berkas KML/GeoJSON di panel kiri atau klik di peta untuk menggambar"
                    : isPolygonClosed
                    ? `Batas poligon terverifikasi (${drawnCoords.length} titik). Siap didaftarkan.`
                    : `Menambahkan titik ke-${drawnCoords.length + 1}. Minimal 3 titik.`}
                </span>
              </div>

              {/* Map Style Selector */}
              <div className="flex items-center bg-white/90 backdrop-blur-md rounded-[3px] border border-black/[0.08] p-[2px] gap-1">
                <button
                  type="button"
                  onClick={() => toggleMapStyle("satellite")}
                  className={`px-[10px] py-[4px] text-[12px] font-medium rounded-[2px] transition-colors ${
                    mapStyleType === "satellite"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)]"
                  }`}
                >
                  Satelit
                </button>
                <button
                  type="button"
                  onClick={() => toggleMapStyle("streets")}
                  className={`px-[10px] py-[4px] text-[12px] font-medium rounded-[2px] transition-colors ${
                    mapStyleType === "streets"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--hover)]"
                  }`}
                >
                  Peta
                </button>
              </div>
            </div>

            {/* Map Floating Bottom Helper */}
            <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-3 bg-white/90 backdrop-blur-md text-[var(--ink)] px-[13px] py-[6px] rounded-[3px] text-[11.5px] font-medium border border-black/[0.08]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                <span>Titik Sudut Batas Petak</span>
              </div>
              <span className="text-black/20">|</span>
              <span>Luas dihitung presisi geodesik WGS84</span>
            </div>
          </div>
        </div>
      </main>

      {/* Wave 9: Batch Completion Modal */}
      <BatchCompletionModal
        result={batchSuccessResult}
        onClose={() => setBatchSuccessResult(null)}
        onReset={handleResetBatchImport}
      />
    </div>
  );
}
