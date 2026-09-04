from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.crop_variety import CropVariety
from app.models.phenology_phase import PhenologyPhase
from app.models.user import User
from app.schemas.variety import (
    CropVarietyCreate,
    CropVarietyResponse,
    CropVarietyUpdate,
    PhenologyPhaseCreate,
    PhenologyPhaseResponse,
    PhenologyPhaseUpdate,
)

router = APIRouter(prefix="/varieties", tags=["Varietas & Fase Fenologi"])


@router.get(
    "",
    response_model=List[CropVarietyResponse],
    summary="Daftar varietas tanaman",
    description="Mengambil daftar varietas tanaman (padi/jagung) beserta parameter fase fenologi lengkap.",
)
async def list_varieties(
    crop_type: Optional[str] = Query(
        None,
        description="Filter berdasarkan jenis tanaman: 'padi' atau 'jagung'",
    ),
    search: Optional[str] = Query(
        None,
        description="Pencarian nama varietas (case-insensitive)",
    ),
    db: AsyncSession = Depends(get_db),
) -> List[CropVarietyResponse]:
    query = select(CropVariety).options(selectinload(CropVariety.phases)).order_by(CropVariety.crop_type, CropVariety.name)

    if crop_type:
        clean_crop_type = crop_type.strip().lower()
        query = query.where(CropVariety.crop_type == clean_crop_type)

    if search:
        clean_search = f"%{search.strip()}%"
        query = query.where(CropVariety.name.ilike(clean_search))

    result = await db.execute(query)
    varieties = result.scalars().all()

    # Ensure phases are sorted by hst_start for each variety
    for v in varieties:
        if v.phases:
            v.phases.sort(key=lambda p: p.hst_start)

    return [CropVarietyResponse.model_validate(v) for v in varieties]


@router.post(
    "",
    response_model=CropVarietyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah varietas baru",
    description="Menambahkan varietas tanaman baru dengan opsional inisialisasi fase fenologi.",
)
async def create_variety(
    payload: CropVarietyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CropVarietyResponse:
    # Check if a variety with the same name & crop_type already exists
    existing_stmt = select(CropVariety).where(
        CropVariety.crop_type == payload.crop_type,
        CropVariety.name.ilike(payload.name.strip()),
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Varietas '{payload.name}' untuk jenis tanaman '{payload.crop_type}' sudah terdaftar.",
        )

    # Create new variety
    new_variety = CropVariety(
        crop_type=payload.crop_type,
        name=payload.name.strip(),
        cycle_days=payload.cycle_days,
        t_base=payload.t_base,
    )
    db.add(new_variety)
    await db.flush()

    # If initial phases are provided, validate phase codes and insert
    if payload.phases:
        seen_codes = set()
        for p in payload.phases:
            code_upper = p.phase_code.strip().upper()
            if code_upper in seen_codes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Kode fase '{p.phase_code}' duplikat dalam data inisialisasi fase.",
                )
            seen_codes.add(code_upper)

            new_phase = PhenologyPhase(
                variety_id=new_variety.id,
                phase_code=code_upper,
                phase_name=p.phase_name.strip(),
                hst_start=p.hst_start,
                hst_end=p.hst_end,
                ndvi_expected_min=p.ndvi_expected_min,
                ndvi_expected_max=p.ndvi_expected_max,
                ndre_threshold=p.ndre_threshold,
                kc_value=p.kc_value,
                gdd_target=p.gdd_target,
            )
            db.add(new_phase)

    await db.commit()

    # Re-fetch with phases loaded
    stmt = (
        select(CropVariety)
        .options(selectinload(CropVariety.phases))
        .where(CropVariety.id == new_variety.id)
    )
    res = await db.execute(stmt)
    created_variety = res.scalar_one()
    if created_variety.phases:
        created_variety.phases.sort(key=lambda p: p.hst_start)

    return CropVarietyResponse.model_validate(created_variety)


@router.get(
    "/{id}",
    response_model=CropVarietyResponse,
    summary="Detail varietas tanaman",
    description="Mengambil detail informasi varietas berdasarkan ID beserta seluruh fase fenologinya.",
)
async def get_variety(
    id: int,
    db: AsyncSession = Depends(get_db),
) -> CropVarietyResponse:
    stmt = (
        select(CropVariety)
        .options(selectinload(CropVariety.phases))
        .where(CropVariety.id == id)
    )
    res = await db.execute(stmt)
    variety = res.scalar_one_or_none()

    if variety is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas dengan ID {id} tidak ditemukan.",
        )

    if variety.phases:
        variety.phases.sort(key=lambda p: p.hst_start)

    return CropVarietyResponse.model_validate(variety)


@router.put(
    "/{id}",
    response_model=CropVarietyResponse,
    summary="Perbarui varietas tanaman",
    description="Memperbarui data varietas tanaman berdasarkan ID.",
)
async def update_variety(
    id: int,
    payload: CropVarietyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CropVarietyResponse:
    stmt = (
        select(CropVariety)
        .options(selectinload(CropVariety.phases))
        .where(CropVariety.id == id)
    )
    res = await db.execute(stmt)
    variety = res.scalar_one_or_none()

    if variety is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas dengan ID {id} tidak ditemukan.",
        )

    new_crop_type = payload.crop_type if payload.crop_type is not None else variety.crop_type
    new_name = payload.name.strip() if payload.name is not None else variety.name

    # Check uniqueness if name or crop_type changed
    if new_crop_type != variety.crop_type or new_name.lower() != variety.name.lower():
        existing_stmt = select(CropVariety).where(
            CropVariety.crop_type == new_crop_type,
            CropVariety.name.ilike(new_name),
            CropVariety.id != id,
        )
        existing_res = await db.execute(existing_stmt)
        if existing_res.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Varietas '{new_name}' untuk jenis tanaman '{new_crop_type}' sudah terdaftar.",
            )

    if payload.crop_type is not None:
        variety.crop_type = payload.crop_type
    if payload.name is not None:
        variety.name = payload.name.strip()
    if payload.cycle_days is not None:
        variety.cycle_days = payload.cycle_days
    if payload.t_base is not None:
        variety.t_base = payload.t_base

    await db.commit()
    await db.refresh(variety)

    if variety.phases:
        variety.phases.sort(key=lambda p: p.hst_start)

    return CropVarietyResponse.model_validate(variety)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hapus varietas tanaman",
    description="Menghapus varietas tanaman dan seluruh fase fenologinya secara permanen.",
)
async def delete_variety(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    stmt = select(CropVariety).where(CropVariety.id == id)
    res = await db.execute(stmt)
    variety = res.scalar_one_or_none()

    if variety is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas dengan ID {id} tidak ditemukan.",
        )

    await db.delete(variety)
    await db.commit()


@router.get(
    "/{id}/phases",
    response_model=List[PhenologyPhaseResponse],
    summary="Daftar fase fenologi varietas",
    description="Mengambil seluruh fase fenologi untuk varietas yang ditentukan berdasarkan urutan HST mulai.",
)
async def list_variety_phases(
    id: int,
    db: AsyncSession = Depends(get_db),
) -> List[PhenologyPhaseResponse]:
    # Check variety exists
    variety_stmt = select(CropVariety).where(CropVariety.id == id)
    variety_res = await db.execute(variety_stmt)
    if variety_res.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas dengan ID {id} tidak ditemukan.",
        )

    stmt = (
        select(PhenologyPhase)
        .where(PhenologyPhase.variety_id == id)
        .order_by(PhenologyPhase.hst_start, PhenologyPhase.id)
    )
    res = await db.execute(stmt)
    phases = res.scalars().all()

    return [PhenologyPhaseResponse.model_validate(p) for p in phases]


@router.post(
    "/{id}/phases",
    response_model=PhenologyPhaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah fase fenologi pada varietas",
    description="Menambahkan fase fenologi baru ke dalam varietas yang ditentukan.",
)
async def create_variety_phase(
    id: int,
    payload: PhenologyPhaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhenologyPhaseResponse:
    # Check variety exists
    variety_stmt = select(CropVariety).where(CropVariety.id == id)
    variety_res = await db.execute(variety_stmt)
    variety = variety_res.scalar_one_or_none()
    if variety is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Varietas dengan ID {id} tidak ditemukan.",
        )

    clean_code = payload.phase_code.strip().upper()

    # Check phase_code uniqueness for this variety
    existing_phase_stmt = select(PhenologyPhase).where(
        PhenologyPhase.variety_id == id,
        PhenologyPhase.phase_code == clean_code,
    )
    existing_res = await db.execute(existing_phase_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Kode fase '{clean_code}' sudah terdaftar untuk varietas '{variety.name}'.",
        )

    new_phase = PhenologyPhase(
        variety_id=id,
        phase_code=clean_code,
        phase_name=payload.phase_name.strip(),
        hst_start=payload.hst_start,
        hst_end=payload.hst_end,
        ndvi_expected_min=payload.ndvi_expected_min,
        ndvi_expected_max=payload.ndvi_expected_max,
        ndre_threshold=payload.ndre_threshold,
        kc_value=payload.kc_value,
        gdd_target=payload.gdd_target,
    )
    db.add(new_phase)
    await db.commit()
    await db.refresh(new_phase)

    return PhenologyPhaseResponse.model_validate(new_phase)


@router.put(
    "/{variety_id}/phases/{phase_id}",
    response_model=PhenologyPhaseResponse,
    summary="Perbarui fase fenologi",
    description="Memperbarui parameter fase fenologi tertentu.",
)
async def update_variety_phase(
    variety_id: int,
    phase_id: int,
    payload: PhenologyPhaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhenologyPhaseResponse:
    stmt = select(PhenologyPhase).where(
        PhenologyPhase.id == phase_id,
        PhenologyPhase.variety_id == variety_id,
    )
    res = await db.execute(stmt)
    phase = res.scalar_one_or_none()

    if phase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fase fenologi dengan ID {phase_id} pada varietas {variety_id} tidak ditemukan.",
        )

    # If phase_code is being changed, check uniqueness
    if payload.phase_code is not None:
        clean_code = payload.phase_code.strip().upper()
        if clean_code != phase.phase_code:
            existing_stmt = select(PhenologyPhase).where(
                PhenologyPhase.variety_id == variety_id,
                PhenologyPhase.phase_code == clean_code,
                PhenologyPhase.id != phase_id,
            )
            existing_res = await db.execute(existing_stmt)
            if existing_res.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Kode fase '{clean_code}' sudah terdaftar untuk varietas ini.",
                )
            phase.phase_code = clean_code

    if payload.phase_name is not None:
        phase.phase_name = payload.phase_name.strip()
    if payload.hst_start is not None:
        phase.hst_start = payload.hst_start
    if payload.hst_end is not None:
        phase.hst_end = payload.hst_end
    if payload.ndvi_expected_min is not None:
        phase.ndvi_expected_min = payload.ndvi_expected_min
    if payload.ndvi_expected_max is not None:
        phase.ndvi_expected_max = payload.ndvi_expected_max
    if payload.ndre_threshold is not None:
        phase.ndre_threshold = payload.ndre_threshold
    if payload.kc_value is not None:
        phase.kc_value = payload.kc_value
    if payload.gdd_target is not None:
        phase.gdd_target = payload.gdd_target

    # Re-validate relationship between hst_start & hst_end
    if phase.hst_start > phase.hst_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="hst_start tidak boleh lebih besar dari hst_end.",
        )

    if phase.ndvi_expected_min > phase.ndvi_expected_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ndvi_expected_min tidak boleh lebih besar dari ndvi_expected_max.",
        )

    await db.commit()
    await db.refresh(phase)

    return PhenologyPhaseResponse.model_validate(phase)


@router.delete(
    "/{variety_id}/phases/{phase_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hapus fase fenologi",
    description="Menghapus fase fenologi tertentu dari varietas.",
)
async def delete_variety_phase(
    variety_id: int,
    phase_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    stmt = select(PhenologyPhase).where(
        PhenologyPhase.id == phase_id,
        PhenologyPhase.variety_id == variety_id,
    )
    res = await db.execute(stmt)
    phase = res.scalar_one_or_none()

    if phase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fase fenologi dengan ID {phase_id} pada varietas {variety_id} tidak ditemukan.",
        )

    await db.delete(phase)
    await db.commit()
