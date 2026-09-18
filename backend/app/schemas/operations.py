"""Pydantic schemas for Precision Agriculture Operations (OPS-04).

Covers: HOK labor logs, irrigation/fuel logs, saprotan catalog & applications,
pest (OPT) scouting reports, and post-harvest closing.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LaborLogCreate(BaseModel):
    """Payload pencatatan tenaga kerja harian / borongan (HOK)."""

    activity_date: date
    task_type: str
    labor_count: int = Field(1, ge=1)
    hours_worked: float = Field(7.0, ge=0)
    wage_rate_per_day: float = Field(100000.0, ge=0)
    is_contract: bool = False
    total_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class IrrigationLogCreate(BaseModel):
    """Payload log pengairan / operasional pompa."""

    water_source: str
    water_volume_m3: Optional[float] = Field(None, ge=0)
    pump_duration_hours: float = Field(0.0, ge=0)
    fuel_liters: float = Field(0.0, ge=0)
    fuel_cost: float = Field(0.0, ge=0)
    started_at: datetime
    ended_at: datetime

    model_config = ConfigDict(extra="ignore")


class SaprotanItemCreate(BaseModel):
    """Payload katalog sarana produksi pertanian (saprotan)."""

    name: str
    category: str
    active_ingredient: str = ""
    phi_days: int = Field(0, ge=0, le=365)
    unit: str = "kg"
    unit_cost: float = Field(0.0, ge=0)
    stock_qty: float = Field(0.0, ge=0)

    model_config = ConfigDict(extra="ignore")


class SaprotanApplicationCreate(BaseModel):
    """Payload aplikasi saprotan pada petak (dengan guardrail PHI)."""

    item_id: int
    application_date: date
    target_harvest_date: Optional[date] = None
    quantity_used: float = Field(0.0, ge=0)
    total_cost: Optional[float] = Field(None, ge=0)

    model_config = ConfigDict(extra="ignore")


class PestScoutingCreate(BaseModel):
    """Payload laporan pengamatan hama & penyakit (OPT)."""

    observation_date: Optional[datetime] = None
    pest_type: str
    severity: str = "ringan"
    latitude: float
    longitude: float
    photo_url: Optional[str] = None
    action_taken: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class HarvestClosingCreate(BaseModel):
    """Payload penutupan musim tanam (standarisasi kadar air 14%)."""

    harvest_date: date
    gross_yield_kg: float = Field(..., gt=0)
    moisture_content_pct: float = Field(14.0, ge=0, le=100)
    dockage_pct: float = Field(0.0, ge=0, le=100)
    selling_price_per_kg: float = Field(..., ge=0)
    storage_location: Optional[str] = None

    model_config = ConfigDict(extra="ignore")
