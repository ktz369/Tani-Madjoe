"""Pydantic schemas for agricultural anomaly detection alerts."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AlertResponse(BaseModel):
    """Schema respons data peringatan/alert petak lahan."""

    id: int = Field(..., description="ID unik alert")
    plot_id: int = Field(..., description="ID petak lahan terkait")
    alert_type: str = Field(
        ...,
        description="Tipe alert: 'nitrogen_stress', 'water_stress', 'pest_anomaly', atau 'harvest_ready'",
    )
    severity: str = Field(
        ...,
        description="Tingkat keparahan: 'kuning', 'oranye', 'merah', atau 'hijau_tua'",
    )
    title: str = Field(..., description="Judul notifikasi peringatan")
    description: str = Field(..., description="Deskripsi rinci anomali atau kondisi yang terdeteksi")
    recommendation: str = Field(..., description="Rekomendasi tindakan mitigasi agronomi")
    trigger_values: Optional[Dict[str, Any]] = Field(
        None,
        description="Data kuantitatif pemicu alert (NDVI, NDRE, NDWI, curah hujan, GDD, dsb.)",
    )
    is_read: bool = Field(False, description="Status apakah alert sudah dibaca")
    is_resolved: bool = Field(False, description="Status apakah alert sudah ditindaklanjuti/selesai")
    created_at: datetime = Field(..., description="Waktu terbentuknya alert")
    resolved_at: Optional[datetime] = Field(None, description="Waktu alert diselesaikan")

    # Extended context fields (populated if joined with Plot/Estate)
    plot_name: Optional[str] = Field(None, description="Nama petak lahan")
    crop_type: Optional[str] = Field(None, description="Komoditas tanaman ('padi' atau 'jagung')")
    estate_id: Optional[int] = Field(None, description="ID kebun/estate terkait")
    estate_name: Optional[str] = Field(None, description="Nama kebun/estate terkait")

    model_config = ConfigDict(from_attributes=True)


class AlertListResponse(BaseModel):
    """Schema respons daftar alerts dengan paginasi dan metadata."""

    total: int = Field(..., description="Jumlah total alert sesuai kriteria pencarian")
    unread_count: int = Field(0, description="Jumlah alert yang belum dibaca")
    page: int = Field(1, description="Nomor halaman saat ini")
    page_size: int = Field(20, description="Jumlah data per halaman")
    total_pages: int = Field(1, description="Total halaman yang tersedia")
    items: List[AlertResponse] = Field(default_factory=list, description="Daftar objek alert")


class AlertUpdate(BaseModel):
    """Schema untuk pembaruan status alert (dibaca / selesai)."""

    is_read: Optional[bool] = Field(None, description="Tandai sudah/belum dibaca")
    is_resolved: Optional[bool] = Field(None, description="Tandai sudah/belum diselesaikan")


class AlertUnreadCountResponse(BaseModel):
    """Schema respons statistik ringkasan alert yang belum dibaca."""

    total_unread: int = Field(..., description="Jumlah total alert belum dibaca")
    by_severity: Dict[str, int] = Field(
        default_factory=dict,
        description="Jumlah alert belum dibaca berdasarkan tingkat keparahan (kuning, oranye, merah, hijau_tua)",
    )
    by_type: Dict[str, int] = Field(
        default_factory=dict,
        description="Jumlah alert belum dibaca berdasarkan tipe anomali",
    )


class AlertEvaluationJobResponse(BaseModel):
    """Schema respons pemicuan manual evaluasi Alert Engine."""

    status: str = Field(..., description="Status hasil eksekusi: 'success', 'warning', atau 'error'")
    message: str = Field(..., description="Pesan deskriptif hasil eksekusi")
    plots_evaluated: int = Field(0, description="Jumlah petak lahan yang dievaluasi")
    alerts_created: int = Field(0, description="Jumlah alert baru yang berhasil dibangkitkan")
    errors: List[str] = Field(default_factory=list, description="Daftar catatan galat selama pemrosesan")
