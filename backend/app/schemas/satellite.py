"""Pydantic schemas for satellite remote sensing and spectral index data."""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.services.satellite_indices import classify_vegetation_health, detect_sar_flooding


class SpectralIndexBase(BaseModel):
    """Base schema for satellite observations."""

    observation_date: date = Field(..., description="Tanggal observasi satelit")
    satellite: str = Field(
        default="sentinel-2",
        description="Nama wahana satelit (sentinel-2 atau sentinel-1)",
    )
    ndvi: Optional[float] = Field(
        None,
        description="Normalized Difference Vegetation Index (-1.0 s/d 1.0)",
    )
    ndre: Optional[float] = Field(
        None,
        description="Normalized Difference Red Edge Index (Klorofil kanopi)",
    )
    ndwi: Optional[float] = Field(
        None,
        description="Normalized Difference Water Index (Kandungan air kanopi)",
    )
    savi: Optional[float] = Field(
        None,
        description="Soil Adjusted Vegetation Index (Koreksi tanah, L=0.5)",
    )
    bsi: Optional[float] = Field(
        None,
        description="Bare Soil Index (Keterbukaan tanah)",
    )
    sar_vv_db: Optional[float] = Field(
        None,
        description="Backscatter SAR Sentinel-1 polarisasi VV (dB)",
    )
    sar_vh_db: Optional[float] = Field(
        None,
        description="Backscatter SAR Sentinel-1 polarisasi VH (dB)",
    )
    cloud_cover_pct: Optional[float] = Field(
        default=0.0,
        description="Persentase tutupan awan pada petak (%)",
    )


class SpectralIndexResponse(SpectralIndexBase):
    """Response schema for a single spectral index record."""

    id: int = Field(..., description="ID record indeks satelit")
    plot_id: int = Field(..., description="ID petak lahan terkait")
    created_at: datetime = Field(..., description="Waktu data dibuat pada sistem")

    @computed_field
    @property
    def is_flooded(self) -> bool:
        """Deteksi apakah petak terindikasi tergenang air / banjir berdasarkan SAR."""
        return detect_sar_flooding(self.sar_vv_db, self.sar_vh_db)

    @computed_field
    @property
    def vegetation_health(self) -> str:
        """Klasifikasi status kesehatan vegetasi berdasarkan nilai NDVI."""
        return classify_vegetation_health(self.ndvi)

    model_config = ConfigDict(from_attributes=True)


class SpectralIndexListResponse(BaseModel):
    """Response schema for time-series list of spectral indices."""

    plot_id: int = Field(..., description="ID petak lahan")
    total: int = Field(..., description="Jumlah observasi satelit yang ditemukan")
    items: List[SpectralIndexResponse] = Field(
        default_factory=list,
        description="Daftar observasi time-series indeks spektral",
    )


class SatelliteJobResponse(BaseModel):
    """Response schema for satellite processing job status and trigger results."""

    status: str = Field(..., description="Status eksekusi: 'success', 'partial_success', atau 'error'")
    message: str = Field(..., description="Pesan deskriptif hasil pemrosesan")
    plots_processed: int = Field(0, description="Jumlah petak lahan yang diproses")
    records_created: int = Field(0, description="Jumlah observasi satelit yang disimpan / diperbarui")
    errors: List[str] = Field(
        default_factory=list,
        description="Daftar error atau kegagalan pemrosesan jika ada",
    )


class PlotSatelliteTileResponse(BaseModel):
    """Response schema for satellite map tile layer (GEE or fallback)."""

    plot_id: Optional[int] = Field(None, description="ID petak lahan jika tile spesifik untuk petak")
    tile_url: str = Field(..., description="Template URL XYZ tile raster satelit")
    vis_type: str = Field(..., description="Tipe visualisasi ('true_color' atau 'false_color')")
    observation_date: Optional[str] = Field(None, description="Tanggal observasi citra satelit (YYYY-MM-DD)")
    attribution: str = Field(..., description="Atribusi penyedia data citra satelit")
    bands: List[str] = Field(default_factory=list, description="Kombinasi band spektral satelit yang digunakan")
    min_val: float = Field(0.0, description="Nilai reflektansi minimum")
    max_val: float = Field(3000.0, description="Nilai reflektansi maksimum")
    label: Optional[str] = Field(None, description="Label deskriptif mode citra satelit")

    model_config = ConfigDict(from_attributes=True)

