from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PhenologyPhaseBase(BaseModel):
    """Base schema for phenology phase data."""
    phase_code: str = Field(..., min_length=1, max_length=50, description="Kode fase (cth: P0, V1, R1, VE-V2)")
    phase_name: str = Field(..., min_length=1, max_length=255, description="Nama deskriptif fase fenologi")
    hst_start: int = Field(..., ge=0, description="Hari Setelah Tanam mulai")
    hst_end: int = Field(..., ge=0, description="Hari Setelah Tanam selesai")
    ndvi_expected_min: float = Field(..., ge=-1.0, le=1.0, description="Batas minimum ekspektasi NDVI")
    ndvi_expected_max: float = Field(..., ge=-1.0, le=1.0, description="Batas maksimum ekspektasi NDVI")
    ndre_threshold: float = Field(..., ge=-1.0, le=1.0, description="Ambang batas NDRE")
    kc_value: float = Field(..., gt=0, description="Koefisien tanaman (Kc > 0)")
    gdd_target: float = Field(..., ge=0, description="Target GDD (°C·hari)")

    @model_validator(mode="after")
    def validate_ranges(self) -> "PhenologyPhaseBase":
        if self.hst_start > self.hst_end:
            raise ValueError("hst_start tidak boleh lebih besar dari hst_end")
        if self.ndvi_expected_min > self.ndvi_expected_max:
            raise ValueError("ndvi_expected_min tidak boleh lebih besar dari ndvi_expected_max")
        return self


class PhenologyPhaseCreate(PhenologyPhaseBase):
    """Schema for creating a new phenology phase."""
    pass


class PhenologyPhaseUpdate(BaseModel):
    """Schema for updating an existing phenology phase."""
    phase_code: Optional[str] = Field(None, min_length=1, max_length=50)
    phase_name: Optional[str] = Field(None, min_length=1, max_length=255)
    hst_start: Optional[int] = Field(None, ge=0)
    hst_end: Optional[int] = Field(None, ge=0)
    ndvi_expected_min: Optional[float] = Field(None, ge=-1.0, le=1.0)
    ndvi_expected_max: Optional[float] = Field(None, ge=-1.0, le=1.0)
    ndre_threshold: Optional[float] = Field(None, ge=-1.0, le=1.0)
    kc_value: Optional[float] = Field(None, gt=0)
    gdd_target: Optional[float] = Field(None, ge=0)

    @model_validator(mode="after")
    def validate_update_ranges(self) -> "PhenologyPhaseUpdate":
        if self.hst_start is not None and self.hst_end is not None:
            if self.hst_start > self.hst_end:
                raise ValueError("hst_start tidak boleh lebih besar dari hst_end")
        if self.ndvi_expected_min is not None and self.ndvi_expected_max is not None:
            if self.ndvi_expected_min > self.ndvi_expected_max:
                raise ValueError("ndvi_expected_min tidak boleh lebih besar dari ndvi_expected_max")
        return self


class PhenologyPhaseResponse(PhenologyPhaseBase):
    """Schema for phenology phase response."""
    id: int
    variety_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CropVarietyBase(BaseModel):
    """Base schema for crop variety data."""
    crop_type: str = Field(..., description="Jenis tanaman: 'padi' atau 'jagung'")
    name: str = Field(..., min_length=1, max_length=255, description="Nama varietas (cth: Inpari 32, BISI 18)")
    cycle_days: int = Field(..., gt=0, description="Total durasi siklus panen dalam hari")
    t_base: float = Field(default=10.0, ge=0.0, description="Suhu dasar (Tbase) untuk kalkulasi GDD")

    @field_validator("crop_type")
    @classmethod
    def validate_crop_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ["padi", "jagung"]:
            raise ValueError("crop_type harus berupa 'padi' atau 'jagung'")
        return clean

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Nama varietas tidak boleh kosong")
        return clean


class CropVarietyCreate(CropVarietyBase):
    """Schema for creating a new crop variety with optional initial phases."""
    phases: Optional[List[PhenologyPhaseCreate]] = None


class CropVarietyUpdate(BaseModel):
    """Schema for updating an existing crop variety."""
    crop_type: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    cycle_days: Optional[int] = Field(None, gt=0)
    t_base: Optional[float] = Field(None, ge=0.0)

    @field_validator("crop_type")
    @classmethod
    def validate_crop_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip().lower()
            if clean not in ["padi", "jagung"]:
                raise ValueError("crop_type harus berupa 'padi' atau 'jagung'")
            return clean
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            clean = v.strip()
            if not clean:
                raise ValueError("Nama varietas tidak boleh kosong")
            return clean
        return v


class CropVarietyResponse(CropVarietyBase):
    """Schema for crop variety response with list of phenology phases."""
    id: int
    created_at: datetime
    phases: List[PhenologyPhaseResponse] = []

    model_config = ConfigDict(from_attributes=True)
