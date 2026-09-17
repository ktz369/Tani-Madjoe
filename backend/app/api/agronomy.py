"""
Digital Agronomy Engine API Router (DAG-07 & DAG-08).
Provides endpoints for SoilGrids & AWC Saxton-Rawls, FAO-56 forward planting window simulation,
cascading terraced hydrology water balance, 3D terrain-following drone mission KML,
and variable rate nutrition (VRN) Manual Bucket prescriptions.
"""

from datetime import date
from typing import Any, Dict, Optional
from fastapi import APIRouter, Response, Query
from pydantic import BaseModel

from app.services.soilgrids_service import get_soil_characteristics
from app.services.planting_window_service import simulate_planting_window
from app.services.hydrology_service import get_terrace_hydrology
from app.services.sar_service import get_sar_backscatter_telemetry
from app.services.vrn_service import calculate_vrn_prescription
from app.utils.drone_kml_generator import generate_drone_mission_kml

router = APIRouter(prefix="/agronomy", tags=["Digital Agronomy Engine"])


class PlantingWindowSimulateRequest(BaseModel):
    plot_id: int = 1
    start_date: Optional[str] = None
    candidate_window_days: int = 25


@router.get("/soil-characteristics/{plot_id}", summary="Get SoilGrids & Saxton-Rawls physical parameters")
def get_plot_soil(plot_id: int):
    return get_soil_characteristics(plot_id=plot_id)


@router.post("/planting-window/simulate", summary="Forward-simulate planting window FAO-56 (Padi vs Jagung)")
def simulate_planting(req: PlantingWindowSimulateRequest):
    return simulate_planting_window(
        plot_id=req.plot_id,
        start_date_str=req.start_date,
        candidate_window_days=req.candidate_window_days
    )


@router.get("/planting-window/simulate", summary="Forward-simulate planting window FAO-56 (GET convenience)")
def simulate_planting_get(
    plot_id: int = Query(1),
    start_date: Optional[str] = Query(None),
    candidate_window_days: int = Query(25)
):
    return simulate_planting_window(
        plot_id=plot_id,
        start_date_str=start_date,
        candidate_window_days=candidate_window_days
    )


@router.get("/plots/{plot_id}/water-balance", summary="Get cascading terrace hydrology & sluice gate schedule")
def get_plot_water_balance(
    plot_id: int,
    precipitation_mm: float = Query(28.5),
    etc_mm: float = Query(4.2)
):
    return get_terrace_hydrology(
        plot_id=plot_id,
        precipitation_mm=precipitation_mm,
        etc_mm=etc_mm
    )


@router.get("/plots/{plot_id}/drone-mission.kml", summary="Download 3D terrain-following drone mission KML")
def download_drone_kml(
    plot_id: int,
    plot_name: str = Query("Bengkok 1"),
    crop_variety: str = Query("Inpari 32 HDB"),
    spray_height_agl: float = Query(2.5)
):
    kml_str = generate_drone_mission_kml(
        plot_name=plot_name,
        crop_variety=crop_variety,
        spray_height_agl=spray_height_agl
    )
    headers = {
        "Content-Disposition": f'attachment; filename="Misi_Drone_3D_{plot_name.replace(" ", "_")}_Terrain_Following.kml"'
    }
    return Response(
        content=kml_str.encode("utf-8"),
        media_type="application/vnd.google-earth.kml+xml",
        headers=headers
    )


@router.get("/plots/{plot_id}/vrn", summary="Get Terrain-Adaptive Variable Rate Nutrition prescription")
def get_plot_vrn(
    plot_id: int,
    plot_name: str = Query("Petak Bengkok 1"),
    area_ha: float = Query(0.37),
    crop_variety: str = Query("Inpari 32 HDB"),
    target_yield_ton_ha: float = Query(7.5),
    current_hst: int = Query(0)
):
    return calculate_vrn_prescription(
        plot_id=plot_id,
        plot_name=plot_name,
        area_ha=area_ha,
        crop_variety=crop_variety,
        target_yield_ton_ha=target_yield_ton_ha,
        current_hst=current_hst
    )


@router.get("/plots/{plot_id}/sar", summary="Get cloud-penetrating Sentinel-1 SAR telemetry & unmixing")
def get_plot_sar(plot_id: int):
    return get_sar_backscatter_telemetry(plot_id=plot_id)
