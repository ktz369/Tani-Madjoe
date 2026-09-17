from typing import TYPE_CHECKING, Optional

try:
    from fastapi import Depends, HTTPException, status
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str = "", headers=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail
            self.headers = headers

    class status:
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404

    class HTTPAuthorizationCredentials:
        def __init__(self, scheme: str = "Bearer", credentials: str = ""):
            self.scheme = scheme
            self.credentials = credentials

    class HTTPBearer:
        def __init__(self, auto_error: bool = True):
            self.auto_error = auto_error

    def Depends(dependency=None):
        return dependency

try:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import get_db
    from app.models.user import User
except ImportError:
    select = None
    AsyncSession = None
    get_db = None
    class User:  # type: ignore
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
from app.utils.security import decode_access_token

# HTTPBearer allows extracting tokens from 'Authorization: Bearer <token>' header
security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency that extracts and validates JWT from Authorization header,

    returning the authenticated User model.
    """
    if auth is None or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token autentikasi tidak valid atau telah kedaluwarsa.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_or_email: Optional[str] = payload.get("sub")
    if not user_id_or_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kredensial token tidak valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Find user by ID if numeric, otherwise by email
    if str(user_id_or_email).isdigit():
        stmt = select(User).where(User.id == int(user_id_or_email))
    else:
        stmt = select(User).where(User.email == str(user_id_or_email))

    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pengguna tidak ditemukan dalam sistem.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency ensuring current user has admin privileges (admin or superadmin)."""
    if (current_user.role or "").lower() not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Memerlukan hak akses administrator.",
        )
    return current_user


class RequireRole:
    """Dependency callable to enforce role-based access control (RBAC)."""

    def __init__(self, *allowed_roles: str):
        self.allowed_roles = {r.lower() for r in allowed_roles}

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        user_role = (current_user.role or "").lower()
        if user_role not in self.allowed_roles:
            sorted_roles = ", ".join(sorted(self.allowed_roles))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Akses ditolak: Peran '{current_user.role}' tidak memiliki izin. Diperlukan peran: {sorted_roles}.",
            )
        return current_user


# RBAC Role Requirement Shortcuts
require_superadmin = RequireRole("superadmin")
require_admin = RequireRole("superadmin", "admin")
require_estate_manager = RequireRole("superadmin", "admin", "estate_manager")
require_agronomist = RequireRole("superadmin", "admin", "estate_manager", "agronomist")
require_operator = RequireRole("superadmin", "admin", "estate_manager", "agronomist", "surveyor", "operator")
require_surveyor = RequireRole("superadmin", "admin", "estate_manager", "agronomist", "surveyor", "operator")


def verify_tenant_access(current_user: User, resource_company_id: Optional[int]) -> bool:
    """Verifikasi hak akses multi-tenant.

    - Superadmin memiliki akses global lintas tenant.
    - User/Manager/Agronomist/Surveyor/Operator hanya dapat mengakses sumber daya milik perusahaannya sendiri.
    - Mengembalikan True jika diizinkan, atau melempar HTTPException(403) jika melanggar isolasi tenant (IDOR).
    """
    user_role = (current_user.role or "").lower()
    if user_role == "superadmin":
        return True

    if resource_company_id is None:
        return True

    user_cid = getattr(current_user, "company_id", None)
    if user_cid is None:
        # Jika user tidak terikat company_id spesifik, admin diperbolehkan, user biasa ditolak
        if user_role in ["admin", "superadmin"]:
            return True
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Akun pengguna tidak terasosiasi dengan perusahaan mana pun.",
        )

    if user_cid != resource_company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Akses ditolak: Anda tidak memiliki izin mengakses data perusahaan ID {resource_company_id}.",
        )

    return True

