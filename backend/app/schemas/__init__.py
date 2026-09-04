"""Pydantic schemas package."""
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    TokenPayload,
    UserResponse,
)
from app.schemas.company import (
    CompanyBase,
    CompanyCreate,
    CompanyUpdate,
    CompanyResponse,
    CompanyDetailResponse,
)
from app.schemas.estate import (
    EstateBase,
    EstateCreate,
    EstateUpdate,
    EstateResponse,
    EstateDetailResponse,
    EstateDashboardPlotItem,
    EstateDashboardSummaryResponse,
)
from app.schemas.division import (
    DivisionBase,
    DivisionCreate,
    DivisionUpdate,
    DivisionResponse,
)
from app.schemas.variety import (
    PhenologyPhaseBase,
    PhenologyPhaseCreate,
    PhenologyPhaseUpdate,
    PhenologyPhaseResponse,
    CropVarietyBase,
    CropVarietyCreate,
    CropVarietyUpdate,
    CropVarietyResponse,
)
from app.schemas.plot import (
    PlotBase,
    PlotCreate,
    PlotUpdate,
    PlotResponse,
    PlotDetailResponse,
    PlotGeoJSONFeature,
    PlotGeoJSONResponse,
    PlotSummaryResponse,
)
from app.schemas.weather import (
    WeatherDataBase,
    WeatherDataCreate,
    WeatherDataUpdate,
    WeatherDataResponse,
    WeatherCurrentResponse,
    WeatherForecastResponse,
    WeatherFetchJobRequest,
    WeatherFetchJobResponse,
)
from app.schemas.planting_season import (
    PlantingSeasonCreate,
    PlantingSeasonResponse,
    PlantingSeasonUpdate,
)
from app.schemas.satellite import (
    SatelliteJobResponse,
    SpectralIndexBase,
    SpectralIndexListResponse,
    SpectralIndexResponse,
)
from app.schemas.email import (
    EmailDailyJobResponse,
    EmailTestRequest,
    EmailTestResponse,
)


__all__ = [
    "LoginRequest",
    "LoginResponse",
    "RegisterRequest",
    "TokenPayload",
    "UserResponse",
    "CompanyBase",
    "CompanyCreate",
    "CompanyUpdate",
    "CompanyResponse",
    "CompanyDetailResponse",
    "EstateBase",
    "EstateCreate",
    "EstateUpdate",
    "EstateResponse",
    "EstateDetailResponse",
    "EstateDashboardPlotItem",
    "EstateDashboardSummaryResponse",
    "DivisionBase",
    "DivisionCreate",
    "DivisionUpdate",
    "DivisionResponse",
    "PhenologyPhaseBase",
    "PhenologyPhaseCreate",
    "PhenologyPhaseUpdate",
    "PhenologyPhaseResponse",
    "CropVarietyBase",
    "CropVarietyCreate",
    "CropVarietyUpdate",
    "CropVarietyResponse",
    "PlotBase",
    "PlotCreate",
    "PlotUpdate",
    "PlotResponse",
    "PlotDetailResponse",
    "PlotGeoJSONFeature",
    "PlotGeoJSONResponse",
    "PlotSummaryResponse",
    "WeatherDataBase",
    "WeatherDataCreate",
    "WeatherDataUpdate",
    "WeatherDataResponse",
    "WeatherCurrentResponse",
    "WeatherForecastResponse",
    "WeatherFetchJobRequest",
    "WeatherFetchJobResponse",
    "PlantingSeasonCreate",
    "PlantingSeasonUpdate",
    "PlantingSeasonResponse",
    "SpectralIndexBase",
    "SpectralIndexResponse",
    "SpectralIndexListResponse",
    "SatelliteJobResponse",
    "EmailDailyJobResponse",
    "EmailTestRequest",
    "EmailTestResponse",
]


