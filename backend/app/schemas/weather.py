"""Pydantic schemas for weather observations and ET₀ forecast."""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class WeatherDataBase(BaseModel):
    """Base schema for daily weather data."""

    observation_date: date = Field(..., description="Tanggal observasi cuaca")
    temp_max_c: Optional[float] = Field(None, description="Suhu maksimum harian (°C)")
    temp_min_c: Optional[float] = Field(None, description="Suhu minimum harian (°C)")
    humidity_pct: Optional[float] = Field(None, description="Kelembaban relatif rata-rata (%)")
    wind_speed_ms: Optional[float] = Field(None, description="Kecepatan angin (m/s)")
    solar_radiation_mjm2: Optional[float] = Field(None, description="Radiasi matahari harian (MJ/m²)")
    rainfall_mm: Optional[float] = Field(None, description="Curah hujan harian (mm)")
    et0_mm: Optional[float] = Field(None, description="Evapotranspirasi referensi ET₀ harian (mm)")
    is_forecast: bool = Field(False, description="Apakah data merupakan ramalan / prediksi cuaca")


class WeatherDataCreate(WeatherDataBase):
    """Schema for inserting new weather data."""

    estate_id: int = Field(..., description="ID kebun/estate terkait")


class WeatherDataUpdate(BaseModel):
    """Schema for updating existing weather data."""

    temp_max_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    wind_speed_ms: Optional[float] = None
    solar_radiation_mjm2: Optional[float] = None
    rainfall_mm: Optional[float] = None
    et0_mm: Optional[float] = None
    is_forecast: Optional[bool] = None


class WeatherDataResponse(WeatherDataBase):
    """Response schema for a single weather data record."""

    id: int
    estate_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WeatherCurrentResponse(BaseModel):
    """Response schema for today's / current weather and ET₀."""

    estate_id: int
    estate_name: Optional[str] = None
    observation_date: date
    is_forecast: bool = False
    temp_max_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_mean_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    wind_speed_ms: Optional[float] = None
    solar_radiation_mjm2: Optional[float] = None
    rainfall_mm: Optional[float] = None
    et0_mm: Optional[float] = None
    condition_text: Optional[str] = None
    weather_record: Optional[WeatherDataResponse] = None

    model_config = ConfigDict(from_attributes=True)


class WeatherForecastResponse(BaseModel):
    """Response schema for 16-day estate forecast."""

    estate_id: int
    estate_name: Optional[str] = None
    total_days: int
    items: List[WeatherDataResponse]

    model_config = ConfigDict(from_attributes=True)


class WeatherFetchJobRequest(BaseModel):
    """Request payload for manual weather sync job trigger."""

    estate_id: Optional[int] = Field(
        None,
        description="ID estate spesifik (jika kosong, semua estate dengan koordinat akan diproses)",
    )


class WeatherFetchJobResponse(BaseModel):
    """Response summary for weather fetch job execution."""

    status: str
    message: str
    estates_processed: int
    records_synced: int
    errors: List[str] = []
