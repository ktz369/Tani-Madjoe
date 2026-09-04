"""Pydantic schemas for Growing Degree Days (GDD), crop evapotranspiration (ETc), and phenology prediction."""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class GddRecordResponse(BaseModel):
    """Schema respons untuk satu rekaman data akumulasi GDD harian petak."""

    id: int = Field(..., description="ID rekaman GDD")
    plot_id: int = Field(..., description="ID petak lahan terkait")
    observation_date: date = Field(..., description="Tanggal observasi GDD")
    gdd_daily: float = Field(..., description="GDD harian (°C-hari)")
    gdd_cumulative: float = Field(..., description="Akumulasi GDD kumulatif sejak tanam (°C-hari)")
    etc_mm: Optional[float] = Field(None, description="Kebutuhan air tanaman aktual ETc (mm/hari)")
    predicted_phase: Optional[str] = Field(None, description="Fase pertumbuhan yang diprediksi")
    predicted_harvest_date: Optional[date] = Field(None, description="Estimasi tanggal panen yang diprediksi")
    created_at: datetime = Field(..., description="Waktu rekaman dibuat di database")

    model_config = ConfigDict(from_attributes=True)


class GddListResponse(BaseModel):
    """Schema respons untuk daftar time-series GDD petak lahan."""

    plot_id: int = Field(..., description="ID petak lahan")
    total: int = Field(..., description="Jumlah total data rekaman GDD")
    items: List[GddRecordResponse] = Field(default_factory=list, description="Daftar observasi time-series GDD")


class PhaseProgressItem(BaseModel):
    """Item perkembangan per fase fenologi tanaman."""

    phase_code: str = Field(..., description="Kode fase (misal: V1, R2)")
    phase_name: str = Field(..., description="Nama lengkap fase fenologi")
    hst_start: int = Field(..., description="Awal HST fase")
    hst_end: int = Field(..., description="Akhir HST fase")
    gdd_target: float = Field(..., description="Target GDD kumulatif untuk mencapai fase ini")
    kc_value: float = Field(..., description="Koefisien tanaman Kc pada fase ini")
    status: str = Field(..., description="Status fase: 'completed', 'active', atau 'upcoming'")


class PlotPredictionResponse(BaseModel):
    """Schema respons terperinci untuk prediksi fase dan panen petak lahan."""

    plot_id: int = Field(..., description="ID petak lahan")
    plot_name: str = Field(..., description="Nama petak lahan")
    crop_type: str = Field(..., description="Jenis tanaman: 'padi' atau 'jagung'")
    variety_id: Optional[int] = Field(None, description="ID varietas bibit yang ditanam")
    variety_name: Optional[str] = Field(None, description="Nama varietas bibit")
    planting_date: Optional[date] = Field(None, description="Tanggal penanaman petak")
    current_hst: int = Field(0, description="Hari Setelah Tanam (HST) saat ini")
    current_phase: Optional[str] = Field(None, description="Fase pertumbuhan aktif saat ini")
    gdd_cumulative: float = Field(0.0, description="Total akumulasi GDD yang telah tercapai (°C-hari)")
    gdd_target_total: float = Field(0.0, description="Target total GDD kumulatif untuk siklus lengkap varietas")
    gdd_progress_pct: float = Field(0.0, description="Persentase pencapaian GDD menuju kematangan panen (0-100%)")
    remaining_gdd: float = Field(0.0, description="Sisa GDD yang masih dibutuhkan hingga panen")
    predicted_harvest_date: Optional[date] = Field(None, description="Estimasi tanggal panen fisiologis")
    estimated_days_to_harvest: Optional[int] = Field(None, description="Estimasi sisa hari menuju panen")
    latest_etc_mm: Optional[float] = Field(None, description="Estimasi kebutuhan air harian terakhir ETc (mm)")
    phases_timeline: List[PhaseProgressItem] = Field(
        default_factory=list,
        description="Rincian tahapan timeline fase fenologi varietas",
    )


class GddJobResponse(BaseModel):
    """Schema respons untuk trigger pekerjaan pemrosesan kalkulasi GDD."""

    status: str = Field(..., description="Status proses: 'success', 'partial_success', atau 'error'")
    message: str = Field(..., description="Keterangan hasil eksekusi pekerjaan")
    plots_processed: int = Field(0, description="Jumlah petak lahan yang berhasil diproses")
    records_created: int = Field(0, description="Jumlah rekaman GDD harian yang dibuat/diperbarui")
    errors: List[str] = Field(default_factory=list, description="Daftar error jika ada kendala saat pemrosesan")
