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
import { api } from "@/lib/api";
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

// Mapbox Satellite / OSM fallback style configuration
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example";

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

  // 5. Initialize Mapbox Map
  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [101.8524, 0.5532], // Default Riau / Pelalawan
      zoom: 14,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

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
    };

    map.on("load", setupLayers);
    map.on("style.load", setupLayers);

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Track activeTab in ref for event handlers
  const activeTabRef = useRef<"single" | "batch">("single");
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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
      prev.map((r, i) => (i === index ? { ...r, [field]: val } : r))
    );
  };

  // Wave 8: Focus Map on specific batch row
  const handleFocusBatchPlot = (row: BatchPlotRow) => {
    if (!mapRef.current) return;
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
    if (!mapRef.current) return;
    setMapStyleType(style);
    const styleUrl =
      style === "satellite"
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/outdoors-v12";
    mapRef.current.setStyle(styleUrl);
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Main Workspace Layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: Form Panel */}
        <div
          className={`${
            activeTab === "batch"
              ? "w-full lg:w-[480px] xl:w-[560px]"
              : "w-full lg:w-96 xl:w-[420px]"
          } bg-white border-r border-slate-200 flex flex-col h-auto lg:h-[calc(100vh-64px)] overflow-y-auto z-10 shadow-lg transition-all duration-200`}
        >
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <Link
                href="/peta"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Peta Lahan</span>
              </Link>
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                SaaS Pertanian
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-600" />
              <span>{activeTab === "batch" ? "Impor Massal Petak (Batch)" : "Daftar Petak Baru"}</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {activeTab === "batch"
                ? "Unggah berkas KML / KMZ / GeoJSON multi-poligon untuk mendaftarkan banyak petak sekaligus."
                : "Gambar batas poligon di peta lalu lengkapi informasi agronomis petak."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl mx-5 mt-4 border border-slate-200 gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab("single");
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "single"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Petak Tunggal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("batch");
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "batch"
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Impor Massal (Batch KML)</span>
            </button>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Single Plot Mode Content */}
          {activeTab === "single" && (
            <>
              {/* Success Notification Banner */}
              {successPlot && (
                <div className="p-4 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-emerald-900">
                        Petak &quot;{successPlot.name}&quot; Berhasil Didaftarkan!
                      </p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Luas: <span className="font-bold">{successPlot.area_hectares} ha</span> | Tanaman:{" "}
                        <span className="capitalize font-semibold">{successPlot.crop_type}</span>
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Link
                          href={`/petak/${successPlot.id}`}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                        >
                          Buka Detail Petak &rarr;
                        </Link>
                        <Link
                          href="/peta"
                          className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded text-xs font-medium transition-colors"
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
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                        >
                          Tambah Lain
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Registration Form */}
              <form onSubmit={handleSubmitPlot} className="p-5 space-y-4 flex-1">
                {/* Wave 7: KML / KMZ / GeoJSON File Dropzone */}
                <div className="space-y-2 p-3.5 bg-emerald-50/40 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      <UploadCloud className="w-4 h-4 text-emerald-600" />
                      <span>Impor Berkas Geospasial</span>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      KML / KMZ / GeoJSON
                    </span>
                  </div>

                  {!importedFileInfo ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                        isDragging
                          ? "border-emerald-500 bg-emerald-100/50 scale-[0.99]"
                          : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50 bg-white"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".kml,.kmz,.geojson,.json"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                      {uploadLoading ? (
                        <div className="flex flex-col items-center justify-center py-2 space-y-2">
                          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                          <p className="text-xs font-semibold text-emerald-900">
                            Memvalidasi & mengekstrak koordinat poligon...
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center space-y-1.5">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                            <FileCode className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-semibold text-slate-800">
                            Tarik & lepas berkas KML / KMZ / GeoJSON
                          </p>
                          <p className="text-[11px] text-slate-500">
                            atau <span className="text-emerald-700 font-semibold underline">pilih dari komputer</span>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-lg border border-emerald-300 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <FileCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-slate-900 line-clamp-1">
                              {importedFileInfo.fileName}
                            </p>
                            <p className="text-[11px] text-emerald-700">
                              Format: <span className="font-semibold">{importedFileInfo.format}</span> • {importedFileInfo.vertexCount} titik batas • {importedFileInfo.areaHa.toFixed(4)} Ha
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetImport}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Reset berkas"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {importedFileInfo.warnings && importedFileInfo.warnings.length > 0 && (
                        <div className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
                          {importedFileInfo.warnings.join(", ")}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-[10px] text-slate-500">Kamera peta dipusatkan otomatis</span>
                        <button
                          type="button"
                          onClick={handleResetImport}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                        >
                          Reset Berkas
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 1. Hierarchy Selectors */}
                <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Hierarki Lokasi Petak</span>
                  </div>

                  {/* Perusahaan */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Perusahaan
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(Number(e.target.value) || "")}
                      className="w-full text-xs rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white"
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Perkebunan / Estate
                    </label>
                    <select
                      value={selectedEstateId}
                      onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                      disabled={!selectedCompanyId || estates.length === 0}
                      className="w-full text-xs rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white disabled:bg-slate-100"
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Divisi / Afdeling
                    </label>
                    <select
                      value={selectedDivisionId}
                      onChange={(e) => setSelectedDivisionId(Number(e.target.value) || "")}
                      disabled={!selectedEstateId || divisions.length === 0}
                      className="w-full text-xs rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white disabled:bg-slate-100"
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Petak Lahan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Petak A1 - Blok Utara"
                      value={plotName}
                      onChange={(e) => setPlotName(e.target.value)}
                      className="w-full text-sm rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  {/* Crop Type Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Komoditas Tanaman
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCropType("padi")}
                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                          cropType === "padi"
                            ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-semibold shadow-xs"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Sprout className="w-4 h-4 text-emerald-600" />
                        <span>Padi (Oryza)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropType("jagung")}
                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                          cropType === "jagung"
                            ? "bg-amber-50 border-amber-600 text-amber-900 font-semibold shadow-xs"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Wheat className="w-4 h-4 text-amber-600" />
                        <span>Jagung (Zea Mays)</span>
                      </button>
                    </div>
                  </div>

                  {/* Variety Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Varietas Benih
                    </label>
                    <select
                      value={selectedVarietyId}
                      onChange={(e) => setSelectedVarietyId(Number(e.target.value) || "")}
                      className="w-full text-xs rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white"
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tanggal Tanam
                      </label>
                      <input
                        type="date"
                        value={plantingDate}
                        onChange={(e) => setPlantingDate(e.target.value)}
                        className="w-full text-xs rounded-lg border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hari Setelah Tanam (HST)
                      </label>
                      <div className="w-full py-2 px-3 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-emerald-800 text-center">
                        {currentHstPreview} HST
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Polygon Geometry Status Card */}
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Status Poligon Peta</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        drawnCoords.length >= 3
                          ? "bg-emerald-200 text-emerald-900"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {drawnCoords.length} Titik Sudut
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Luas Terhitung:</span>
                      <span className="text-lg font-extrabold text-emerald-700">
                        {calculatedAreaHa.toFixed(2)}{" "}
                        <span className="text-xs font-medium text-slate-500">hektar</span>
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <span>{(calculatedAreaHa * 10000).toLocaleString("id-ID")} m²</span>
                    </div>
                  </div>

                  {/* Polygon Controls */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={handleClosePolygon}
                      disabled={drawnCoords.length < 3 || isPolygonClosed}
                      className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Tutup Poligon</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUndoPoint}
                      disabled={drawnCoords.length === 0}
                      className="py-1.5 px-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 text-slate-700 rounded-md text-xs font-medium transition-colors flex items-center justify-center"
                      title="Hapus titik terakhir"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPolygon}
                      disabled={drawnCoords.length === 0}
                      className="py-1.5 px-2 bg-white border border-rose-200 hover:bg-rose-50 disabled:opacity-50 text-rose-700 rounded-md text-xs font-medium transition-colors flex items-center justify-center"
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
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span>Menyimpan ke Database...</span>
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
            <div className="p-5 space-y-4 flex-1">
              {/* Batch Success Result Banner */}
              {batchSuccessResult ? (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm space-y-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-base text-emerald-950">
                        Pendaftaran Massal Berhasil!
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">
                        <span className="font-bold">{batchSuccessResult.created_count}</span> petak lahan berhasil didaftarkan dan disimpan secara transaksional ke PostGIS.
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-emerald-200">
                        <div>
                          <span className="text-slate-500 block">Total Luas:</span>
                          <span className="font-bold text-emerald-900">
                            {batchSuccessResult.total_area_hectares.toFixed(2)} Ha
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Telemetri Satelit:</span>
                          <span className="font-bold text-emerald-900">
                            {batchSuccessResult.satellite_telemetry_backfilled} data (30 hari)
                          </span>
                        </div>
                        <div className="col-span-2 text-[11px] text-emerald-700 flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span>Cuaca harian Open-Meteo & akumulasi GDD terpropagasi otomatis.</span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <Link
                          href="/peta"
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <Map className="w-3.5 h-3.5" />
                          <span>Buka di Peta Lahan</span>
                        </Link>
                        <button
                          type="button"
                          onClick={handleResetBatchImport}
                          className="px-3 py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
                        >
                          Impor Berkas Lain
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Destination Hierarchy Selectors */}
                  <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Divisi Tujuan Pendaftaran Massal</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* Perusahaan */}
                      <div>
                        <label className="block text-[10px] font-medium text-slate-600 mb-1">
                          Perusahaan
                        </label>
                        <select
                          value={selectedCompanyId}
                          onChange={(e) => setSelectedCompanyId(Number(e.target.value) || "")}
                          className="w-full text-xs rounded-lg border-slate-300 bg-white"
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
                        <label className="block text-[10px] font-medium text-slate-600 mb-1">
                          Estate
                        </label>
                        <select
                          value={selectedEstateId}
                          onChange={(e) => setSelectedEstateId(Number(e.target.value) || "")}
                          disabled={!selectedCompanyId || estates.length === 0}
                          className="w-full text-xs rounded-lg border-slate-300 bg-white disabled:bg-slate-100"
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
                        <label className="block text-[10px] font-medium text-slate-600 mb-1">
                          Divisi / Afdeling <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={selectedDivisionId}
                          onChange={(e) => setSelectedDivisionId(Number(e.target.value) || "")}
                          disabled={!selectedEstateId || divisions.length === 0}
                          className="w-full text-xs rounded-lg border-slate-300 bg-white disabled:bg-slate-100 font-semibold text-emerald-900"
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

                  {/* Batch Upload Dropzone */}
                  <div className="space-y-2 p-3.5 bg-emerald-50/40 rounded-xl border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 uppercase tracking-wider">
                        <UploadCloud className="w-4 h-4 text-emerald-600" />
                        <span>Unggah Berkas Koleksi Multi-Petak</span>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        KML / KMZ / GeoJSON
                      </span>
                    </div>

                    {!batchSummary ? (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setBatchIsDragging(true);
                        }}
                        onDragLeave={() => setBatchIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setBatchIsDragging(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleBatchFileUpload(e.dataTransfer.files[0]);
                          }
                        }}
                        onClick={() => batchFileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                          batchIsDragging
                            ? "border-emerald-500 bg-emerald-100/50 scale-[0.99]"
                            : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50 bg-white"
                        }`}
                      >
                        <input
                          ref={batchFileInputRef}
                          type="file"
                          accept=".kml,.kmz,.geojson,.json"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleBatchFileUpload(e.target.files[0]);
                            }
                          }}
                        />
                        {batchUploadLoading ? (
                          <div className="flex flex-col items-center justify-center py-4 space-y-2">
                            <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
                            <p className="text-xs font-semibold text-emerald-900">
                              Mengekstrak poligon & menghitung topologi spasial...
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                              <UploadCloud className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                Tarik & lepas berkas KML / KMZ / GeoJSON multi-poligon
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                atau <span className="text-emerald-700 font-semibold underline">pilih dari komputer</span> (Folder Placemarks)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Batch Summary Header Box */
                      <div className="p-3.5 bg-white rounded-xl border border-emerald-300 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <FileCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-slate-900 line-clamp-1">
                                {batchSummary.fileName}
                              </p>
                              <p className="text-[11px] text-emerald-700">
                                Format: <span className="font-semibold">{batchSummary.format}</span> • {batchSummary.totalPlots} Petak Terdeteksi • Total {batchSummary.totalAreaHa.toFixed(2)} Ha
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleResetBatchImport}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Ganti berkas"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-500 block">Total Petak</span>
                            <span className="text-xs font-bold text-slate-800">{batchSummary.totalPlots}</span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-500 block">Total Luas</span>
                            <span className="text-xs font-bold text-emerald-700">{batchSummary.totalAreaHa.toFixed(2)} Ha</span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-500 block">Terpilih</span>
                            <span className="text-xs font-bold text-indigo-700">
                              {batchRows.filter((r) => r.selected).length} Petak
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Bulk Settings & Review Table when batchSummary exists */}
                  {batchSummary && batchRows.length > 0 && (
                    <>
                      {/* Quick Bulk Controls Card */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Pengaturan Massal Terpilih</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleApplyBatchSettings}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors shadow-2xs"
                          >
                            Terapkan ke Terpilih
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {/* Bulk Crop */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">
                              Komoditas
                            </label>
                            <select
                              value={batchBulkCropType}
                              onChange={(e) => setBatchBulkCropType(e.target.value as "padi" | "jagung")}
                              className="w-full text-xs rounded-lg border-slate-300 py-1.5 px-2 bg-white"
                            >
                              <option value="padi">Padi</option>
                              <option value="jagung">Jagung</option>
                            </select>
                          </div>

                          {/* Bulk Variety */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">
                              Varietas
                            </label>
                            <select
                              value={batchBulkVarietyId}
                              onChange={(e) => setBatchBulkVarietyId(Number(e.target.value) || "")}
                              className="w-full text-xs rounded-lg border-slate-300 py-1.5 px-2 bg-white"
                            >
                              <option value="">-- Standar --</option>
                              {varieties
                                .filter((v) => v.crop_type === batchBulkCropType)
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                            </select>
                          </div>

                          {/* Bulk Planting Date */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">
                              Tanggal Tanam
                            </label>
                            <input
                              type="date"
                              value={batchBulkPlantingDate}
                              onChange={(e) => setBatchBulkPlantingDate(e.target.value)}
                              className="w-full text-xs rounded-lg border-slate-300 py-1 px-2 bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Batch Review Table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = batchRows.every((r) => r.selected);
                                handleToggleSelectAll(!allSelected);
                              }}
                              className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-emerald-700 cursor-pointer"
                            >
                              {batchRows.every((r) => r.selected) ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                              <span>Pilih Semua ({batchRows.length})</span>
                            </button>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {batchRows.filter((r) => r.selected).length} dari {batchRows.length} aktif
                          </span>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto bg-white shadow-2xs">
                          {batchRows.map((row, idx) => (
                            <div
                              key={row.id}
                              className={`p-3 transition-colors flex items-center gap-3 ${
                                row.selected ? "bg-emerald-50/20" : "bg-slate-50/60 opacity-60"
                              }`}
                            >
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRowSelect(idx)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />

                              {/* Row Details */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={row.name}
                                    onChange={(e) => handleUpdateRowField(idx, "name", e.target.value)}
                                    className="text-xs font-semibold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-hidden py-0.5 px-1 rounded flex-1 min-w-0 bg-transparent"
                                    placeholder="Nama Petak"
                                  />
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    {row.area_hectares.toFixed(2)} Ha
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                  <select
                                    value={row.crop_type}
                                    onChange={(e) =>
                                      handleUpdateRowField(idx, "crop_type", e.target.value)
                                    }
                                    className="text-[11px] py-0.5 px-1.5 rounded border-slate-200 bg-white"
                                  >
                                    <option value="padi">Padi</option>
                                    <option value="jagung">Jagung</option>
                                  </select>

                                  <select
                                    value={row.variety_id || ""}
                                    onChange={(e) =>
                                      handleUpdateRowField(
                                        idx,
                                        "variety_id",
                                        Number(e.target.value) || ""
                                      )
                                    }
                                    className="text-[11px] py-0.5 px-1.5 rounded border-slate-200 bg-white max-w-[130px] truncate"
                                  >
                                    <option value="">Varietas Bawaan</option>
                                    {varieties
                                      .filter((v) => v.crop_type === row.crop_type)
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.name}
                                        </option>
                                      ))}
                                  </select>

                                  {row.warnings && row.warnings.length > 0 && (
                                    <span
                                      className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200"
                                      title={row.warnings.join(", ")}
                                    >
                                      Peringatan
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Focus Map Button */}
                              <button
                                type="button"
                                onClick={() => handleFocusBatchPlot(row)}
                                className="p-1.5 hover:bg-emerald-100 text-slate-400 hover:text-emerald-700 rounded-md transition-colors"
                                title="Fokuskan peta ke petak ini"
                              >
                                <MapPin className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Batch Submit Action */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleSubmitBatchPlots}
                          disabled={
                            batchSubmitLoading ||
                            !selectedDivisionId ||
                            batchRows.filter((r) => r.selected).length === 0
                          }
                          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {batchSubmitLoading ? (
                            <div className="flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Mendaftarkan & Mengaktifkan Telemetri...</span>
                            </div>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>
                                Daftarkan {batchRows.filter((r) => r.selected).length} Petak & Aktifkan Telemetri
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Interactive Mapbox Map */}
        <div className="flex-1 relative h-[500px] lg:h-[calc(100vh-64px)] w-full bg-slate-900">
          {/* Map Container */}
          <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

          {/* Map Floating Top Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
            {/* Drawing Instructions Badge */}
            <div className="px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 text-xs font-medium text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
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
            <div className="flex items-center bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => toggleMapStyle("satellite")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mapStyleType === "satellite"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Satelit
              </button>
              <button
                type="button"
                onClick={() => toggleMapStyle("streets")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mapStyleType === "streets"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Vektor
              </button>
            </div>
          </div>

          {/* Map Floating Bottom Helper */}
          <div className="absolute bottom-6 left-6 z-10 hidden sm:flex items-center gap-3 bg-slate-900/80 backdrop-blur-md text-white px-3 py-2 rounded-lg text-xs shadow-lg border border-slate-700/50">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
              <span>Titik Sudut Batas Petak</span>
            </div>
            <span className="text-slate-500">|</span>
            <span>Luas dihitung presisi geodesik WGS84</span>
          </div>
        </div>
      </main>
    </div>
  );
}
