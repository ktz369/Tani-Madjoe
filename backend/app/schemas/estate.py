from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.division import DivisionResponse


class EstateBase(BaseModel):
    """Base schema for Estate."""
    name: str = Field(..., min_length=1, max_length=255, description="Nama perkebunan / estate")
    province: Optional[str] = Field(default=None, max_length=100, description="Provinsi lokasi estate")
    kabupaten: Optional[str] = Field(default=None, max_length=100, description="Kabupaten/Kota lokasi estate")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Lintang koordinat titik pusat estate")
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Bujur koordinat titik pusat estate")


class EstateCreate(EstateBase):
    """Schema for creating a new Estate."""
    company_id: Optional[int] = Field(default=None, description="ID Perusahaan induk jika tidak melalui route nested")


class EstateUpdate(BaseModel):
    """Schema for updating an existing Estate."""
    company_id: Optional[int] = Field(default=None, description="ID Perusahaan induk baru jika dipindahkan")
    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="Nama estate")
    province: Optional[str] = Field(default=None, max_length=100, description="Provinsi lokasi estate")
    kabupaten: Optional[str] = Field(default=None, max_length=100, description="Kabupaten/Kota lokasi estate")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Lintang koordinat titik pusat estate")
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Bujur koordinat titik pusat estate")


class EstateResponse(BaseModel):
    """Response schema for Estate."""
    id: int
    company_id: int
    name: str
    province: Optional[str] = None
    kabupaten: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    division_count: int = Field(default=0, description="Jumlah divisi dalam estate")
    petak_count: int = Field(default=0, description="Jumlah petak/blok lahan dalam estate")
    company_name: Optional[str] = Field(default=None, description="Nama Perusahaan induk")

    model_config = ConfigDict(from_attributes=True)


class EstateDetailResponse(EstateResponse):
    """Detailed response schema for Estate with divisions list."""
    divisions: List[DivisionResponse] = Field(default_factory=list)


class EstateDashboardPlotItem(BaseModel):
    """Schema for individual plot data in estate dashboard summary."""
    id: int
    name: str
    crop_type: str
    variety_name: Optional[str] = None
    current_phase: Optional[str] = None
    current_hst: int
    area_hectares: float
    polygon: dict
    latest_ndvi: Optional[float] = None
    ndvi_status: str
    active_alert_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class EstateDashboardSummaryResponse(BaseModel):
    """Schema for estate dashboard summary with plots and NDVI health metrics."""
    estate_id: int
    estate_name: str
    total_plots: int
    total_area_ha: float
    avg_ndvi: Optional[float] = None
    plots_needing_attention: int = 0
    plots: List[EstateDashboardPlotItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class EstateIndicesTimelineResponse(BaseModel):
    """Schema for estate vegetation indices timeline."""

    estate_id: int = Field(..., description="ID perkebunan / estate")
    estate_name: str = Field(..., description="Nama perkebunan / estate")
    dates: List[str] = Field(default_factory=list, description="Daftar tanggal observasi satelit terurut kronologis (YYYY-MM-DD)")
    timeline: Dict[str, Dict[str, Optional[float]]] = Field(
        default_factory=dict,
        description="Peta tanggal ke dictionary nilai NDVI per ID petak: {'2026-08-01': {'1': 0.65, '2': 0.72}}",
    )

    model_config = ConfigDict(from_attributes=True)


