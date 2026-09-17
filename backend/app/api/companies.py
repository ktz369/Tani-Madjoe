from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.estate import Estate
from app.models.user import User
from app.schemas.company import (
    CompanyCreate,
    CompanyDetailResponse,
    CompanyResponse,
    CompanyUpdate,
)
from app.schemas.estate import EstateCreate, EstateResponse
from app.utils.geo import coordinates_from_point, point_from_coordinates

router = APIRouter(prefix="/companies", tags=["Perusahaan (Companies)"])


def _to_estate_response(estate: Estate) -> EstateResponse:
    """Helper to convert Estate ORM model to EstateResponse with parsed coordinates."""
    lat, lng = coordinates_from_point(estate.location_point)
    div_count = len(estate.divisions) if estate.divisions is not None else 0
    return EstateResponse(
        id=estate.id,
        company_id=estate.company_id,
        name=estate.name,
        province=estate.province,
        kabupaten=estate.kabupaten,
        latitude=lat,
        longitude=lng,
        created_at=estate.created_at,
        division_count=div_count,
        petak_count=0,
        company_name=estate.company.name if estate.company else None,
    )


def _to_company_response(company: Company) -> CompanyResponse:
    """Helper to compute aggregate metrics for CompanyResponse."""
    estates = company.estates or []
    estate_cnt = len(estates)
    division_cnt = sum(len(e.divisions or []) for e in estates)
    return CompanyResponse(
        id=company.id,
        name=company.name,
        address=company.address,
        created_at=company.created_at,
        estate_count=estate_cnt,
        division_count=division_cnt,
        petak_count=0,
    )


@router.get("", response_model=List[CompanyResponse])
async def list_companies(
    search: Optional[str] = Query(None, description="Cari berdasarkan nama perusahaan"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan seluruh daftar perusahaan perkebunan."""
    stmt = (
        select(Company)
        .options(selectinload(Company.estates).selectinload(Estate.divisions))
        .order_by(Company.name.asc())
    )

    if search:
        stmt = stmt.where(Company.name.ilike(f"%{search.strip()}%"))

    result = await db.execute(stmt)
    companies = result.scalars().all()

    return [_to_company_response(c) for c in companies]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Membuat entitas perusahaan perkebunan baru."""
    # Check if duplicate name already exists
    existing = await db.scalar(select(Company).where(Company.name.ilike(payload.name.strip())))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Perusahaan dengan nama '{payload.name}' sudah terdaftar.",
        )

    company = Company(
        name=payload.name.strip(),
        address=payload.address.strip() if payload.address else None,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    return CompanyResponse(
        id=company.id,
        name=company.name,
        address=company.address,
        created_at=company.created_at,
        estate_count=0,
        division_count=0,
        petak_count=0,
    )


@router.get("/{company_id}", response_model=CompanyDetailResponse)
async def get_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan detail spesifik perusahaan beserta daftar seluruh estatenya."""
    stmt = (
        select(Company)
        .where(Company.id == company_id)
        .options(
            selectinload(Company.estates).selectinload(Estate.divisions),
            selectinload(Company.estates).selectinload(Estate.company),
        )
    )
    result = await db.execute(stmt)
    company = result.scalar_one_or_none()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {company_id} tidak ditemukan.",
        )

    estates = company.estates or []
    estate_responses = [_to_estate_response(e) for e in estates]

    return CompanyDetailResponse(
        id=company.id,
        name=company.name,
        address=company.address,
        created_at=company.created_at,
        estate_count=len(estates),
        division_count=sum(e.division_count for e in estate_responses),
        petak_count=0,
        estates=estate_responses,
    )


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui informasi nama dan alamat perusahaan."""
    stmt = (
        select(Company)
        .where(Company.id == company_id)
        .options(selectinload(Company.estates).selectinload(Estate.divisions))
    )
    result = await db.execute(stmt)
    company = result.scalar_one_or_none()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {company_id} tidak ditemukan.",
        )

    if payload.name is not None:
        trimmed_name = payload.name.strip()
        # Check name uniqueness if changed
        if trimmed_name.lower() != company.name.lower():
            dup = await db.scalar(
                select(Company).where(
                    Company.name.ilike(trimmed_name),
                    Company.id != company_id,
                )
            )
            if dup:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Perusahaan dengan nama '{trimmed_name}' sudah terdaftar.",
                )
        company.name = trimmed_name

    if payload.address is not None:
        company.address = payload.address.strip() if payload.address else None

    await db.commit()
    await db.refresh(company)

    return _to_company_response(company)


@router.delete("/{company_id}", status_code=status.HTTP_200_OK)
async def delete_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghapus entitas perusahaan beserta seluruh hierarki estate dan divisinya."""
    if current_user.role not in ["superadmin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Hanya administrator yang berhak menghapus entitas perusahaan.",
        )

    stmt = select(Company).where(Company.id == company_id)
    result = await db.execute(stmt)
    company = result.scalar_one_or_none()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {company_id} tidak ditemukan.",
        )

    company_name = company.name
    await db.delete(company)
    await db.commit()

    return {
        "success": True,
        "message": f"Perusahaan '{company_name}' berhasil dihapus bersama seluruh cabangnya.",
        "id": company_id,
    }


@router.get("/{company_id}/estates", response_model=List[EstateResponse])
async def list_company_estates(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar estate untuk perusahaan tertentu beserta jumlah divisi dan petak."""
    # Ensure company exists
    company = await db.scalar(select(Company).where(Company.id == company_id))
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {company_id} tidak ditemukan.",
        )

    stmt = (
        select(Estate)
        .where(Estate.company_id == company_id)
        .options(selectinload(Estate.divisions), selectinload(Estate.company))
        .order_by(Estate.name.asc())
    )
    result = await db.execute(stmt)
    estates = result.scalars().all()

    return [_to_estate_response(e) for e in estates]


@router.post(
    "/{company_id}/estates",
    response_model=EstateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_company_estate(
    company_id: int,
    payload: EstateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Membuat estate baru di bawah naungan perusahaan tertentu."""
    company = await db.scalar(select(Company).where(Company.id == company_id))
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {company_id} tidak ditemukan.",
        )

    geom = point_from_coordinates(payload.latitude, payload.longitude)

    estate = Estate(
        company_id=company_id,
        name=payload.name.strip(),
        location_point=geom,
        province=payload.province.strip() if payload.province else None,
        kabupaten=payload.kabupaten.strip() if payload.kabupaten else None,
    )
    db.add(estate)
    await db.commit()
    await db.refresh(estate)

    return EstateResponse(
        id=estate.id,
        company_id=estate.company_id,
        name=estate.name,
        province=estate.province,
        kabupaten=estate.kabupaten,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=estate.created_at,
        division_count=0,
        petak_count=0,
        company_name=company.name,
    )
