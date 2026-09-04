"""Pydantic schemas for Email Service and notification endpoints."""

from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailTestRequest(BaseModel):
    """Schema permohonan pengujian pengiriman email ringkasan alert."""

    target_email: Optional[EmailStr] = Field(
        None,
        description="Alamat email penerima pengujian. Jika kosong, akan dikirim ke email akun login.",
    )
    use_sample_data: bool = Field(
        False,
        description="Gunakan data anomali sampel simulasi jika database belum memiliki alert 24 jam terakhir.",
    )

    model_config = ConfigDict(from_attributes=True)


class EmailTestResponse(BaseModel):
    """Schema respons hasil uji pengiriman email ringkasan alert."""

    status: str = Field(..., description="Status hasil: 'success', 'mock', atau 'error'")
    message: str = Field(..., description="Pesan deskriptif hasil pengiriman email")
    recipient: str = Field(..., description="Alamat email tujuan pengiriman")
    alerts_count: int = Field(0, description="Jumlah alert yang disertakan dalam ringkasan")
    smtp_configured: bool = Field(..., description="Indikator apakah SMTP_HOST aktif terkonfigurasi")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Informasi teknis tambahan")

    model_config = ConfigDict(from_attributes=True)


class EmailDailyJobResponse(BaseModel):
    """Schema respons hasil eksekusi job harian ringkasan email alert."""

    status: str = Field(..., description="Status eksekusi: 'success', 'skipped', atau 'error'")
    message: str = Field(..., description="Pesan hasil eksekusi pengiriman email harian")
    emails_sent: int = Field(0, description="Jumlah email yang berhasil dikirim")
    alerts_count: int = Field(0, description="Jumlah total alert dalam 24 jam terakhir")
    users_total: int = Field(0, description="Jumlah total pengguna terdaftar yang diproses")

    model_config = ConfigDict(from_attributes=True)
