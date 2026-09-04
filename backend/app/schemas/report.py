"""Pydantic schemas for reports and season comparison."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class GeneratedReportResponse(BaseModel):
    """Schema response for generated report archive metadata."""

    id: int
    estate_id: int
    estate_name: Optional[str] = None
    report_type: str
    title: str
    file_name: str
    file_size_bytes: int
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    created_at: datetime
    download_url: Optional[str] = None

    class Config:
        from_attributes = True


class SeasonComparisonMetric(BaseModel):
    """Metrics for one planting season of a plot."""

    season_id: int
    plot_id: int
    plot_name: str
    variety_name: Optional[str] = None
    crop_type: str
    status: str
    planting_date: date
    harvest_date: Optional[date] = None
    duration_days: int
    yield_ton_per_ha: Optional[float] = None
    avg_ndvi: Optional[float] = None
    peak_ndvi: Optional[float] = None
    avg_ndre: Optional[float] = None
    avg_ndwi: Optional[float] = None
    total_rainfall_mm: Optional[float] = None
    total_gdd: Optional[float] = None
    total_alerts: int = 0
    notes: Optional[str] = None


class SeasonComparisonResponse(BaseModel):
    """Comparative analysis response between current and previous planting seasons."""

    plot_id: int
    plot_name: str
    crop_type: str
    area_hectares: float
    current_season: Optional[SeasonComparisonMetric] = None
    historical_seasons: List[SeasonComparisonMetric] = Field(default_factory=list)
    comparison_insights: List[str] = Field(default_factory=list)
