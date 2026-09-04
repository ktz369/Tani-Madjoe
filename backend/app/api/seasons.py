from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.crop_variety import CropVariety
from app.models.planting_season import PlantingSeason
from app.models.plot import Plot
from app.models.user import User
from app.schemas.planting_season import (
    PlantingSeasonCreate,
    PlantingSeasonResponse,
    PlantingSeasonUpdate,
)

router = APIRouter(tags=["Musim Tanam (Planting Seasons)"])


def _to_season_response(season: PlantingSeason) -> PlantingSeasonResponse:
    """Helper to convert PlantingSeason model to PlantingSeasonResponse."""
    variety_name = season.variety.name if season.variety else None
    crop_type = (
        season.variety.crop_type
        if season.variety
        else (season.plot.crop_type if season.plot else None)
    )
    return PlantingSeasonResponse(
        id=season.id,
        plot_id=season.plot_id,
        variety_id=season.variety_id,
        variety_name=variety_name,
        crop_type=crop_type,
        planting_date=season.planting_date,
        harvest_date=season.harvest_date,
        status=season.status,
        yield_estimate_ton_per_ha=season.yield_estimate_ton_per_ha,
        notes=season.notes,
        created_at=season.created_at,
    )


@router.post(
    "/plots/{plot_id}/seasons",
    response_model=PlantingSeasonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mencatat musim tanam baru pada petak",
)
async def create_season(
    plot_id: int,
    payload: PlantingSeasonCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mencatat musim tanam baru.

    Hanya 1 musim tanam berstatus 'active' yang diperbolehkan per petak.
    Secara otomatis memperbarui planting_date, variety_id, dan crop_type pada petak.
    """
    # 1. Pastikan Petak (Plot) ada
    plot_stmt = select(Plot).where(Plot.id == plot_id)
    plot_res = await db.execute(plot_stmt)
    plot = plot_res.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    # 2. Pastikan Varietas ada
    var_stmt = select(CropVariety).where(CropVariety.id == payload.variety_id)
    var_res = await db.execute(var_stmt)
    variety = var_res.scalar_one_or_none()
    if not variety:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas tanaman dengan ID {payload.variety_id} tidak ditemukan.",
        )

    # 3. Validasi: Hanya 1 season dengan status 'active' per plot
    active_stmt = select(PlantingSeason).where(
        PlantingSeason.plot_id == plot_id,
        PlantingSeason.status == "active",
    )
    active_res = await db.execute(active_stmt)
    existing_active = active_res.scalar_one_or_none()
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Petak ini masih memiliki musim tanam yang aktif. Harap selesaikan atau tandai musim tanam sebelumnya terlebih dahulu.",
        )

    # 4. Buat musim tanam baru
    season = PlantingSeason(
        plot_id=plot_id,
        variety_id=payload.variety_id,
        planting_date=payload.planting_date,
        status="active",
        yield_estimate_ton_per_ha=payload.yield_estimate_ton_per_ha,
        notes=payload.notes,
    )
    db.add(season)

    # 5. Otomatis update Plot
    plot.planting_date = season.planting_date
    plot.variety_id = season.variety_id
    plot.crop_type = variety.crop_type

    await db.commit()
    await db.refresh(season)

    # Load variety and plot for response
    stmt = (
        select(PlantingSeason)
        .options(selectinload(PlantingSeason.variety), selectinload(PlantingSeason.plot))
        .where(PlantingSeason.id == season.id)
    )
    res = await db.execute(stmt)
    loaded_season = res.scalar_one()

    return _to_season_response(loaded_season)


@router.get(
    "/plots/{plot_id}/seasons",
    response_model=List[PlantingSeasonResponse],
    summary="Mendapatkan daftar riwayat musim tanam pada petak",
)
async def list_plot_seasons(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil daftar seluruh riwayat musim tanam untuk petak tertentu diurutkan dari yang terbaru."""
    # Pastikan plot ada
    plot_stmt = select(Plot).where(Plot.id == plot_id)
    plot_res = await db.execute(plot_stmt)
    if not plot_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    stmt = (
        select(PlantingSeason)
        .options(selectinload(PlantingSeason.variety), selectinload(PlantingSeason.plot))
        .where(PlantingSeason.plot_id == plot_id)
        .order_by(desc(PlantingSeason.planting_date), desc(PlantingSeason.id))
    )
    res = await db.execute(stmt)
    seasons = res.scalars().all()
    return [_to_season_response(s) for s in seasons]


@router.get(
    "/seasons/{season_id}",
    response_model=PlantingSeasonResponse,
    summary="Mendapatkan detail musim tanam",
)
async def get_season(
    season_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan detail musim tanam berdasarkan ID."""
    stmt = (
        select(PlantingSeason)
        .options(selectinload(PlantingSeason.variety), selectinload(PlantingSeason.plot))
        .where(PlantingSeason.id == season_id)
    )
    res = await db.execute(stmt)
    season = res.scalar_one_or_none()
    if not season:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Musim tanam dengan ID {season_id} tidak ditemukan.",
        )
    return _to_season_response(season)


@router.put(
    "/seasons/{season_id}",
    response_model=PlantingSeasonResponse,
    summary="Memperbarui musim tanam",
)
async def update_season(
    season_id: int,
    payload: PlantingSeasonUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui status, harvest_date, yield_estimate_ton_per_ha, dan catatan musim tanam.

    Jika status diubah menjadi 'harvested' dan harvest_date tidak diberikan, default ke tanggal hari ini.
    """
    stmt = (
        select(PlantingSeason)
        .options(selectinload(PlantingSeason.variety), selectinload(PlantingSeason.plot))
        .where(PlantingSeason.id == season_id)
    )
    res = await db.execute(stmt)
    season = res.scalar_one_or_none()
    if not season:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Musim tanam dengan ID {season_id} tidak ditemukan.",
        )

    # Validasi jika diubah kembali menjadi 'active'
    if payload.status == "active" and season.status != "active":
        active_stmt = select(PlantingSeason).where(
            PlantingSeason.plot_id == season.plot_id,
            PlantingSeason.status == "active",
            PlantingSeason.id != season.id,
        )
        active_res = await db.execute(active_stmt)
        if active_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Petak ini sudah memiliki musim tanam lain yang berstatus aktif.",
            )
        season.status = "active"
    elif payload.status == "harvested":
        season.status = "harvested"
        season.harvest_date = (
            payload.harvest_date
            if payload.harvest_date is not None
            else (season.harvest_date or date.today())
        )
    elif payload.status == "failed":
        season.status = "failed"
        if payload.harvest_date is not None:
            season.harvest_date = payload.harvest_date
    elif payload.status is not None:
        season.status = payload.status

    if payload.harvest_date is not None and payload.status != "harvested":
        season.harvest_date = payload.harvest_date

    if payload.yield_estimate_ton_per_ha is not None:
        season.yield_estimate_ton_per_ha = payload.yield_estimate_ton_per_ha

    if payload.notes is not None:
        season.notes = payload.notes

    await db.commit()
    await db.refresh(season)

    # Reload relations
    reload_stmt = (
        select(PlantingSeason)
        .options(selectinload(PlantingSeason.variety), selectinload(PlantingSeason.plot))
        .where(PlantingSeason.id == season.id)
    )
    reload_res = await db.execute(reload_stmt)
    return _to_season_response(reload_res.scalar_one())
