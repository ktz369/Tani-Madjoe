from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    UserResponse,
)
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Autentikasi"])

VALID_ROLES = {
    "superadmin", "admin", "estate_manager", "agronomist", "surveyor", "operator", "user",
    "SUPER_ADMIN", "ADMIN", "ESTATE_MANAGER", "AGRONOMIST", "SURVEYOR", "OPERATOR", "USER"
}


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Masuk ke sistem",
    description="Validasi email dan password, mengembalikan JWT access token dan refresh token.",
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

    # Buat JWT access token & refresh token
    extra_claims = {
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "company_id": getattr(user, "company_id", None),
    }

    access_token = create_access_token(
        subject=str(user.id),
        extra_claims=extra_claims,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        extra_claims=extra_claims,
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    summary="Perbarui access token dengan refresh token",
    description="Memverifikasi keabsahan refresh token dan menerbitkan access token baru.",
)
async def refresh_token_endpoint(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> RefreshTokenResponse:
    decoded = decode_access_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid atau telah kedaluwarsa.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = decoded.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kredensial refresh token tidak valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if str(user_id_str).isdigit():
        stmt = select(User).where(User.id == int(user_id_str))
    else:
        stmt = select(User).where(User.email == str(user_id_str))

    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pengguna tidak ditemukan dalam sistem.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    new_access_token = create_access_token(
        subject=str(user.id),
        extra_claims={
            "email": user.email,
            "role": user.role,
            "name": user.name,
            "company_id": getattr(user, "company_id", None),
        },
    )

    return RefreshTokenResponse(
        access_token=new_access_token,
        token_type="bearer",
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

    # Validasi kata sandi tidak kosong dan panjang wajar
    if not payload.password or len(payload.password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi harus memiliki panjang minimal 6 karakter.",
        )

    if len(payload.password) > 4096:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi melebihi panjang batas maksimal yang diizinkan (4096 karakter).",
        )

    # Tentukan peran yang valid
    chosen_role = payload.role.lower() if payload.role and payload.role in VALID_ROLES else "user"

    # Hash kata sandi dan simpan pengguna baru
    password_hash = get_password_hash(payload.password)
    new_user = User(
        email=email_clean,
        password_hash=password_hash,
        name=payload.name.strip(),
        role=chosen_role,
        company_id=payload.company_id,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse.model_validate(new_user)

