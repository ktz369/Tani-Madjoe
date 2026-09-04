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
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import {
  Company,
  CropVariety,
  Division,
  Estate,
  PlotCreateRequest,
  PlotImportPreviewResponse,
  PlotResponse,
} from "@/types";

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
    };

    map.on("load", setupLayers);
    map.on("style.load", setupLayers);

    // Map Click Listener to add polygon vertices
    map.on("click", (e) => {
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

  // 6. Update Map GeoJSON layers whenever drawnCoords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("drawn-polygon-source") as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (drawnCoords.length === 0) {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
      setCalculatedAreaHa(0);
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
        <div className="w-full lg:w-96 xl:w-[420px] bg-white border-r border-slate-200 flex flex-col h-auto lg:h-[calc(100vh-64px)] overflow-y-auto z-10 shadow-lg">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
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
              <span>Daftar Petak Baru</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Gambar batas poligon di peta lalu lengkapi informasi agronomis petak.
            </p>
          </div>

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

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmitPlot} className="p-6 space-y-5 flex-1">
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
                        atau <span className="text-emerald-700 font-semibold underline">pilih dari komputer</span> (contoh: Bengkoxxx1.kml)
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
                {drawnCoords.length === 0
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
