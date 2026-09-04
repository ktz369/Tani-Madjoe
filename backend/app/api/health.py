from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", summary="Cek Kesehatan Sistem")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Endpoint untuk memeriksa status backend dan konektivitas PostgreSQL/PostGIS.
    Mengembalikan {"status": "ok", "database": "connected"}.
    """
    try:
        result = await db.execute(text("SELECT 1"))
        _ = result.scalar()
        db_status = "connected"
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "error",
                "database": "disconnected",
                "detail": str(exc),
            },
        )

    return {
        "status": "ok",
        "database": db_status,
    }
