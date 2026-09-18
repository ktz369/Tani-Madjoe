try:
    from fastapi import APIRouter
    from app.api.auth import router as auth_router
    from app.api.companies import router as companies_router
    from app.api.divisions import router as divisions_router
    from app.api.estates import router as estates_router
    from app.api.health import router as health_router
    from app.api.plots import router as plots_router
    from app.api.seasons import router as seasons_router
    from app.api.varieties import router as varieties_router
    from app.api.weather import router as weather_router
    from app.api.satellite import router as satellite_router
    from app.api.gdd import router as gdd_router
    from app.api.alerts import router as alerts_router
    from app.api.email import router as email_router
    from app.api.reports import router as reports_router
    from app.api.agronomy import router as agronomy_router
    from app.api.operations import router as operations_router

    api_router = APIRouter()
    api_router.include_router(health_router)
    api_router.include_router(auth_router)
    api_router.include_router(companies_router)
    api_router.include_router(estates_router)
    api_router.include_router(divisions_router)
    api_router.include_router(varieties_router)
    api_router.include_router(plots_router)
    api_router.include_router(seasons_router)
    api_router.include_router(weather_router)
    api_router.include_router(satellite_router)
    api_router.include_router(gdd_router)
    api_router.include_router(alerts_router)
    api_router.include_router(email_router)
    api_router.include_router(reports_router)
    api_router.include_router(agronomy_router)
    api_router.include_router(operations_router)
except ImportError:
    api_router = None

__all__ = ["api_router"]

