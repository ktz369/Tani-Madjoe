from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserResponse,
)
from app.utils.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Autentikasi"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Masuk ke sistem",
    description="Validasi email dan password, mengembalikan JWT access token dengan masa berlaku 7 hari.",
)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    # Cari pengguna berdasarkan email
    stmt = select(User).where(User.email == payload.email.lower().strip())
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Validasi keberadaan user dan kecocokan password
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau kata sandi tidak valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Buat JWT access token
    access_token = create_access_token(
        subject=str(user.id),
        extra_claims={
            "email": user.email,
            "role": user.role,
            "name": user.name,
        },
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Informasi akun pengguna saat ini",
    description="Mengembalikan data profil pengguna berdasarkan access token yang dikirimkan.",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Daftar akun pengguna baru",
    description="Mendaftarkan pengguna baru (maksimal kuota 3 pengguna pada sistem).",
)
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    # Periksa batas maksimal pengguna (maks 3)
    count_stmt = select(func.count()).select_from(User)
    count_res = await db.execute(count_stmt)
    total_users = count_res.scalar_one()

    if total_users >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batas kuota maksimal registrasi (3 pengguna) telah tercapai.",
        )

    # Periksa apakah email sudah terdaftar
    email_clean = payload.email.lower().strip()
    existing_stmt = select(User).where(User.email == email_clean)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email tersebut sudah terdaftar dalam sistem.",
        )

    # Validasi kata sandi tidak kosong
    if not payload.password or len(payload.password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi harus memiliki panjang minimal 6 karakter.",
        )

    # Hash kata sandi dan simpan pengguna baru
    password_hash = get_password_hash(payload.password)
    new_user = User(
        email=email_clean,
        password_hash=password_hash,
        name=payload.name.strip(),
        role=payload.role if payload.role in ["admin", "user"] else "user",
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse.model_validate(new_user)
