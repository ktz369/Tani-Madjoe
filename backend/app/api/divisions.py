from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.division import Division
from app.models.estate import Estate
from app.models.user import User
from app.schemas.division import (
    DivisionCreate,
    DivisionResponse,
    DivisionUpdate,
)

router = APIRouter(prefix="/divisions", tags=["Divisi / Afdeling (Divisions)"])


def _to_division_response(division: Division) -> DivisionResponse:
    """Helper to convert Division ORM model to DivisionResponse."""
    est = division.estate
    plot_cnt = len(division.plots) if hasattr(division, "plots") and division.plots is not None else 0
    return DivisionResponse(
        id=division.id,
        estate_id=division.estate_id,
        name=division.name,
        created_at=division.created_at,
        petak_count=plot_cnt,
        estate_name=est.name if est else None,
        company_id=est.company_id if est else None,
        company_name=est.company.name if est and est.company else None,
    )



@router.get("", response_model=List[DivisionResponse])
async def list_divisions(
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID perkebunan/estate"),
    search: Optional[str] = Query(None, description="Cari berdasarkan nama divisi"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar seluruh divisi/afdeling."""
    stmt = (
        select(Division)
        .options(selectinload(Division.estate).selectinload(Estate.company))
        .order_by(Division.name.asc())
    )

    if estate_id:
        stmt = stmt.where(Division.estate_id == estate_id)

    if search:
        stmt = stmt.where(Division.name.ilike(f"%{search.strip()}%"))

    result = await db.execute(stmt)
    divisions = result.scalars().all()

    return [_to_division_response(d) for d in divisions]


@router.post("", response_model=DivisionResponse, status_code=status.HTTP_201_CREATED)
async def create_division(
    payload: DivisionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Membuat entitas divisi baru."""
    if not payload.estate_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID Estate (estate_id) wajib disertakan.",
        )

    estate = await db.scalar(
        select(Estate)
        .where(Estate.id == payload.estate_id)
        .options(selectinload(Estate.company))
    )
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {payload.estate_id} tidak ditemukan.",
        )

    division = Division(
        estate_id=payload.estate_id,
        name=payload.name.strip(),
    )
    db.add(division)
    await db.commit()
    await db.refresh(division)

    # Attach loaded relationship
    division.estate = estate

    return _to_division_response(division)


@router.get("/{division_id}", response_model=DivisionResponse)
async def get_division(
    division_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan detail spesifik divisi beserta info estate dan perusahaannya."""
    stmt = (
        select(Division)
        .where(Division.id == division_id)
        .options(selectinload(Division.estate).selectinload(Estate.company))
    )
    result = await db.execute(stmt)
    division = result.scalar_one_or_none()

    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {division_id} tidak ditemukan.",
        )

    return _to_division_response(division)


@router.put("/{division_id}", response_model=DivisionResponse)
async def update_division(
    division_id: int,
    payload: DivisionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui informasi nama divisi atau memindahkan divisi ke estate lain."""
    stmt = (
        select(Division)
        .where(Division.id == division_id)
        .options(selectinload(Division.estate).selectinload(Estate.company))
    )
    result = await db.execute(stmt)
    division = result.scalar_one_or_none()

    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {division_id} tidak ditemukan.",
        )

    if payload.estate_id is not None:
        estate = await db.scalar(
            select(Estate)
            .where(Estate.id == payload.estate_id)
            .options(selectinload(Estate.company))
        )
        if not estate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Estate tujuan dengan ID {payload.estate_id} tidak ditemukan.",
            )
        division.estate_id = payload.estate_id
        division.estate = estate

    if payload.name is not None:
        division.name = payload.name.strip()

    await db.commit()
    await db.refresh(division)

    # Ensure estate relationship is reloaded
    if division.estate is None:
        stmt = (
            select(Division)
            .where(Division.id == division_id)
            .options(selectinload(Division.estate).selectinload(Estate.company))
        )
        res = await db.execute(stmt)
        division = res.scalar_one()

    return _to_division_response(division)


@router.delete("/{division_id}", status_code=status.HTTP_200_OK)
async def delete_division(
    division_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghapus entitas divisi."""
    stmt = select(Division).where(Division.id == division_id)
    result = await db.execute(stmt)
    division = result.scalar_one_or_none()

    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {division_id} tidak ditemukan.",
        )

    division_name = division.name
    await db.delete(division)
    await db.commit()

    return {
        "success": True,
        "message": f"Divisi '{division_name}' berhasil dihapus.",
        "id": division_id,
    }
