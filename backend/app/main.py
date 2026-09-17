from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import api_router
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    start_scheduler()
    yield
    # Shutdown tasks
    stop_scheduler()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Include API Router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Selamat datang di API TANDUR - Platform SaaS Monitoring Pertanian",
        "docs": "/api/docs",
        "health": "/api/health",
        "version": settings.VERSION,
    }
