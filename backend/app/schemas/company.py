from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.estate import EstateResponse


class CompanyBase(BaseModel):
    """Base schema for Company."""
    name: str = Field(..., min_length=1, max_length=255, description="Nama perusahaan")
    address: Optional[str] = Field(default=None, description="Alamat kantor perusahaan")


class CompanyCreate(CompanyBase):
    """Schema for creating a new Company."""
    pass


class CompanyUpdate(BaseModel):
    """Schema for updating an existing Company."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="Nama perusahaan")
    address: Optional[str] = Field(default=None, description="Alamat kantor perusahaan")


class CompanyResponse(BaseModel):
    """Response schema for Company."""
    id: int
    name: str
    address: Optional[str] = None
    created_at: datetime
    estate_count: int = Field(default=0, description="Jumlah estate dalam perusahaan")
    division_count: int = Field(default=0, description="Jumlah total divisi dalam perusahaan")
    petak_count: int = Field(default=0, description="Jumlah total petak dalam perusahaan")

    model_config = ConfigDict(from_attributes=True)


class CompanyDetailResponse(CompanyResponse):
    """Detailed response schema for Company including its estates list."""
    estates: List[EstateResponse] = Field(default_factory=list)
