from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlotBase(BaseModel):
    """Base schema for agricultural plot / petak lahan."""

    name: str = Field(..., min_length=1, max_length=255, description="Nama atau kode petak lahan")
    crop_type: str = Field(
        default="padi",
        description="Komoditas tanaman ('padi' atau 'jagung')",
    )
    variety_id: Optional[int] = Field(
        default=None,
        description="ID varietas benih yang ditanam (opsional)",
    )
    planting_date: Optional[date] = Field(
        default=None,
        description="Tanggal tanam (YYYY-MM-DD)",
    )
    current_phase: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Fase pertumbuhan tanaman saat ini",
    )

    @field_validator("crop_type")
    @classmethod
    def validate_crop_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("padi", "jagung"):
            raise ValueError("Jenis tanaman (crop_type) harus 'padi' atau 'jagung'.")
        return clean


class PlotCreate(PlotBase):
    """Schema for registering a new plot."""

    division_id: Optional[int] = Field(
        default=None,
        description="ID divisi tempat petak berada (opsional jika disediakan via path parameter)",
    )
    polygon: Any = Field(
        ...,
        description="Geometri poligon GeoJSON (tipe Polygon atau daftar koordinat [[[lng, lat], ...]])",
    )


class PlotUpdate(BaseModel):
    """Schema for updating an existing plot."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    division_id: Optional[int] = Field(None, description="Pindah ke divisi lain")
    crop_type: Optional[str] = Field(None)
    variety_id: Optional[int] = Field(None)
    planting_date: Optional[date] = Field(None)
    current_phase: Optional[str] = Field(None, max_length=50)
    polygon: Optional[Any] = Field(
        None,
        description="Pembaruan geometri poligon GeoJSON jika batas petak berubah",
    )

    @field_validator("crop_type")
    @classmethod
    def validate_crop_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip().lower()
            if clean not in ("padi", "jagung"):
                raise ValueError("Jenis tanaman (crop_type) harus 'padi' atau 'jagung'.")
            return clean
        return v


class PlotResponse(BaseModel):
    """Response schema for plot detail."""

    id: int
    division_id: int
    variety_id: Optional[int] = None
    name: str
    polygon: Dict[str, Any] = Field(
        description="Geometri poligon GeoJSON: {'type': 'Polygon', 'coordinates': [[[lng, lat], ...]]}"
    )
    area_hectares: float = Field(
        description="Luas petak dalam satuan hektar (dihitung otomatis dari geometri poligon)"
    )
    planting_date: Optional[date] = None
    crop_type: str = Field(description="'padi' atau 'jagung'")
    current_phase: Optional[str] = None
    current_hst: int = Field(
        description="Hari Setelah Tanam (dihitung otomatis dari planting_date terhadap hari ini)"
    )
    created_at: datetime

    # Hierarchical context info
    division_name: Optional[str] = None
    estate_id: Optional[int] = None
    estate_name: Optional[str] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    variety_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PlotGeoJSONFeature(BaseModel):
    """GeoJSON Feature representation of a plot."""

    type: Literal["Feature"] = "Feature"
    id: int
    geometry: Dict[str, Any]
    properties: Dict[str, Any]


class PlotGeoJSONResponse(BaseModel):
    """GeoJSON FeatureCollection response for Mapbox GL JS map display."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[PlotGeoJSONFeature]


class PlotSummaryResponse(BaseModel):
    """Statistical summary response of plots in an estate or division."""

    total_plots: int
    total_area_hectares: float
    padi_plots: int
    padi_area_hectares: float
    jagung_plots: int
    jagung_area_hectares: float
    phases_summary: Dict[str, int]


class PlotDetailResponse(BaseModel):
    """Schema respons komprehensif detail petak lahan untuk dashboard monitoring dan fenologi."""

    # 1. Atribut Petak
    id: int
    name: str
    area_hectares: float
    crop_type: str
    planting_date: Optional[date] = None
    current_hst: int
    current_phase: Optional[str] = None
    division_id: int
    division_name: Optional[str] = None
    estate_id: Optional[int] = None
    estate_name: Optional[str] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    polygon: Optional[Dict[str, Any]] = None

    # 2. Varietas & Target GDD
    variety_id: Optional[int] = None
    variety_name: Optional[str] = None
    cycle_days: Optional[int] = None
    t_base: Optional[float] = None
    gdd_target_total: Optional[float] = None

    # 3. Data GDD & Prediksi Panen
    gdd_cumulative: float = 0.0
    gdd_progress_pct: float = 0.0
    remaining_gdd: float = 0.0
    predicted_harvest_date: Optional[date] = None
    estimated_days_to_harvest: Optional[int] = None
    etc_today: Optional[float] = None
    et0_today: Optional[float] = None
    kc_active: Optional[float] = None

    # 4. Timeline Fase Fenologi Lengkap
    phases_timeline: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Daftar timeline fase fenologi lengkap dengan status (completed, active, upcoming)",
    )

    # 5. Observasi Satelit Terbaru
    latest_ndvi: Optional[float] = None
    latest_ndre: Optional[float] = None
    latest_ndwi: Optional[float] = None
    latest_savi: Optional[float] = None
    latest_bsi: Optional[float] = None
    sar_vv_db: Optional[float] = None
    sar_vh_db: Optional[float] = None
    observation_date: Optional[date] = None
    is_flooded: Optional[bool] = None
    vegetation_health: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PlotImportPreviewRequest(BaseModel):
    """Schema for importing raw KML, KMZ, or GeoJSON text."""

    content: str = Field(..., description="Isi teks mentah KML, GeoJSON, atau string spasial")
    filename: Optional[str] = Field(default=None, description="Nama berkas asal (contoh: 'Bengkok 1.kml')")


class PlotImportPreviewResponse(BaseModel):
    """Schema respons preview hasil parsing berkas geospasial (KML/KMZ/GeoJSON)."""

    name: str = Field(..., description="Nama petak yang diekstrak dari Placemark/dokumen")
    format: str = Field(..., description="Format berkas sumber ('KML', 'KMZ', atau 'GeoJSON')")
    geometry: Dict[str, Any] = Field(
        ...,
        description="Geometri GeoJSON Polygon standar {'type': 'Polygon', 'coordinates': [[[lng, lat], ...]]}",
    )
    area_hectares: float = Field(..., description="Luas permukaan geodesik dalam satuan hektar (Ha)")
    area_m2: float = Field(..., description="Luas permukaan geodesik dalam meter persegi (m²)")
    bounding_box: List[float] = Field(..., description="Batas koordinat [min_lng, min_lat, max_lng, max_lat]")
    centroid: List[float] = Field(..., description="Titik sentroid petak [lng, lat]")
    vertex_count: int = Field(..., description="Jumlah titik verteks cincin batas terluar poligon")
    warnings: List[str] = Field(default_factory=list, description="Peringatan non-fatal normalisasi topologi")


class PlotBatchItemPreview(BaseModel):
    """Schema untuk item petak individual dalam hasil preview impor massal."""

    name: str = Field(..., description="Nama petak yang diekstrak dari Placemark/dokumen")
    geometry: Dict[str, Any] = Field(
        ...,
        description="Geometri GeoJSON Polygon standar {'type': 'Polygon', 'coordinates': [[[lng, lat], ...]]}",
    )
    area_hectares: float = Field(..., description="Luas permukaan geodesik dalam satuan hektar (Ha)")
    area_m2: float = Field(..., description="Luas permukaan geodesik dalam meter persegi (m²)")
    vertex_count: int = Field(..., description="Jumlah titik verteks cincin batas terluar poligon")
    bounding_box: List[float] = Field(..., description="Batas koordinat [min_lng, min_lat, max_lng, max_lat]")
    centroid: List[float] = Field(..., description="Titik sentroid petak [lng, lat]")
    is_valid: bool = Field(default=True, description="Status validitas topologi poligon")
    warnings: List[str] = Field(default_factory=list, description="Peringatan non-fatal normalisasi topologi")


class PlotBatchImportPreviewResponse(BaseModel):
    """Schema respons preview hasil parsing impor berkas geospasial massal (multi-placemark)."""

    format: str = Field(..., description="Format berkas sumber ('KML', 'KMZ', atau 'GeoJSON')")
    total_plots: int = Field(..., description="Jumlah total petak lahan yang terdeteksi")
    total_area_hectares: float = Field(..., description="Total akumulasi luas seluruh petak dalam hektar")
    total_area_m2: float = Field(..., description="Total akumulasi luas seluruh petak dalam meter persegi")
    unified_bounding_box: List[float] = Field(
        ..., description="Batas koordinat gabungan (enclosing bounding box) seluruh petak [min_lng, min_lat, max_lng, max_lat]"
    )
    plots: List[PlotBatchItemPreview] = Field(
        default_factory=list, description="Daftar seluruh petak lahan yang berhasil diekstrak dan divalidasi"
    )


class PlotBatchCreateItem(BaseModel):
    """Schema untuk item petak individual dalam registrasi massal."""

    name: str = Field(..., min_length=1, max_length=255, description="Nama petak")
    variety_id: Optional[int] = Field(default=None, description="ID varietas tanaman")
    crop_type: str = Field(default="padi", description="'padi' atau 'jagung'")
    planting_date: Optional[date] = Field(default=None, description="Tanggal tanam (YYYY-MM-DD)")
    polygon: Dict[str, Any] = Field(
        ..., description="Geometri poligon GeoJSON: {'type': 'Polygon', 'coordinates': [[[lng, lat], ...]]}"
    )


class PlotBatchCreateRequest(BaseModel):
    """Schema payload untuk registrasi petak lahan massal (batch create)."""

    division_id: int = Field(..., description="ID Divisi target penempatan seluruh petak dalam batch")
    plots: List[PlotBatchCreateItem] = Field(..., min_length=1, description="Daftar petak yang akan didaftarkan")


class PlotBatchCreateResponse(BaseModel):
    """Schema respons setelah registrasi petak massal berhasil dieksekusi."""

    created_count: int = Field(..., description="Jumlah petak yang berhasil didaftarkan")
    failed_count: int = Field(default=0, description="Jumlah petak yang gagal didaftarkan")
    total_area_hectares: float = Field(..., description="Total luas akumulasi petak yang berhasil didaftarkan (Ha)")
    plot_ids: List[int] = Field(default_factory=list, description="Daftar ID petak yang baru terbentuk")
    errors: List[str] = Field(default_factory=list, description="Pesan error per petak jika ada kegagalan")




