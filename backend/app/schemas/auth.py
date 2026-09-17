from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr


class UserResponse(BaseModel):
    """Pydantic schema for returning user data."""
    id: int
    email: EmailStr
    name: str
    role: str
    company_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    """Pydantic schema for user login payload."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Pydantic schema for successful login response."""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Pydantic schema for requesting access token renewal."""
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Pydantic schema for refreshed access token."""
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    """Pydantic schema for user registration."""
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "user"
    company_id: Optional[int] = None


class TokenPayload(BaseModel):
    """Pydantic schema for JWT payload structure."""
    sub: Optional[str] = None
    exp: Optional[int] = None
    role: Optional[str] = None
    company_id: Optional[int] = None

