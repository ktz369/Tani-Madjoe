from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr


class UserResponse(BaseModel):
    """Pydantic schema for returning user data."""
    id: int
    email: EmailStr
    name: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    """Pydantic schema for user login payload."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Pydantic schema for successful login response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterRequest(BaseModel):
    """Pydantic schema for user registration."""
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "user"


class TokenPayload(BaseModel):
    """Pydantic schema for JWT payload structure."""
    sub: Optional[str] = None
    exp: Optional[int] = None
