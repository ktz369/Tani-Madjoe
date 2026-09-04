from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlantingSeasonCreate(BaseModel):
    """Schema for recording a new planting season on a plot."""

    variety_id: int = Field(..., description="ID varietas benih tanaman")
    planting_date: date = Field(..., description="Tanggal tanam (YYYY-MM-DD)")
    yield_estimate_ton_per_ha: Optional[float] = Field(
        None,
        ge=0,
        description="Estimasi hasil panen dalam ton per hektar (ton/ha)",
    )
    notes: Optional[str] = Field(None, description="Catatan tambahan untuk musim tanam")


class PlantingSeasonUpdate(BaseModel):
    """Schema for updating an existing planting season."""

    status: Optional[str] = Field(
        None,
        description="Status musim tanam: 'active', 'harvested', atau 'failed'",
    )
    harvest_date: Optional[date] = Field(
        None,
        description="Tanggal panen (YYYY-MM-DD)",
    )
    yield_estimate_ton_per_ha: Optional[float] = Field(
        None,
        ge=0,
        description="Estimasi atau realisasi hasil panen (ton/ha)",
    )
    notes: Optional[str] = Field(None, description="Catatan pembaruan musim tanam")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip().lower()
            if clean not in ("active", "harvested", "failed"):
                raise ValueError("Status musim tanam harus 'active', 'harvested', atau 'failed'.")
            return clean
        return v


class PlantingSeasonResponse(BaseModel):
    """Schema for returning planting season details."""

    id: int
    plot_id: int
    variety_id: Optional[int] = None
    variety_name: Optional[str] = None
    crop_type: Optional[str] = None
    planting_date: date
    harvest_date: Optional[date] = None
    status: str
    yield_estimate_ton_per_ha: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
