from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class DivisionBase(BaseModel):
    """Base schema for Division."""
    name: str = Field(..., min_length=1, max_length=255, description="Nama divisi / afdeling")


class DivisionCreate(DivisionBase):
    """Schema for creating a new Division."""
    estate_id: Optional[int] = Field(default=None, description="ID Estate induk jika tidak melalui route nested")


class DivisionUpdate(BaseModel):
    """Schema for updating an existing Division."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="Nama divisi baru")
    estate_id: Optional[int] = Field(default=None, description="ID Estate induk jika dipindahkan")


class DivisionResponse(BaseModel):
    """Response schema for Division entity."""
    id: int
    estate_id: int
    name: str
    created_at: datetime
    petak_count: int = Field(default=0, description="Jumlah petak/blok dalam divisi")
    estate_name: Optional[str] = Field(default=None, description="Nama Estate induk")
    company_id: Optional[int] = Field(default=None, description="ID Perusahaan induk")
    company_name: Optional[str] = Field(default=None, description="Nama Perusahaan induk")

    model_config = ConfigDict(from_attributes=True)
