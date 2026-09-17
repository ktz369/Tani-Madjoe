import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from typing import Any, Dict, Optional, Union

try:
    from jose import JWTError, jwt
    HAS_JOSE = True
except ImportError:
    HAS_JOSE = False
    class JWTError(Exception):
        pass
    jwt = None

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    HAS_PASSLIB = True
except ImportError:
    HAS_PASSLIB = False
    pwd_context = None

try:
    from app.config import settings
except ImportError:
    class DummySettings:
        SECRET_KEY = "tani_super_secret_jwt_key_369_development"
        ALGORITHM = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
    settings = DummySettings()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (4 - (len(data) % 4)) if (len(data) % 4) else ""
    return base64.urlsafe_b64decode(data + padding)


def _stdlib_jwt_encode(payload: Dict[str, Any], key: str, algorithm: str = "HS256") -> str:
    header = {"alg": algorithm, "typ": "JWT"}
    header_json = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload_json = json.dumps(payload, default=str, separators=(",", ":")).encode("utf-8")
    h_b64 = _b64url_encode(header_json)
    p_b64 = _b64url_encode(payload_json)
    signing_input = f"{h_b64}.{p_b64}".encode("utf-8")
    sig = hmac.new(key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    s_b64 = _b64url_encode(sig)
    return f"{h_b64}.{p_b64}.{s_b64}"


def _stdlib_jwt_decode(token: str, key: str, algorithms: Optional[list] = None) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise JWTError("Invalid token format")
    h_b64, p_b64, s_b64 = parts
    signing_input = f"{h_b64}.{p_b64}".encode("utf-8")
    expected_sig = hmac.new(key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    try:
        actual_sig = _b64url_decode(s_b64)
    except Exception as exc:
        raise JWTError("Invalid base64 signature") from exc

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise JWTError("Signature verification failed")

    try:
        payload_raw = _b64url_decode(p_b64)
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception as exc:
        raise JWTError("Invalid token payload") from exc

    if "exp" in payload:
        now_ts = datetime.now(timezone.utc).timestamp()
        if now_ts > float(payload["exp"]):
            raise JWTError("Token has expired")

    return payload


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt or PBKDF2 hash."""
    if HAS_PASSLIB and pwd_context is not None:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            pass

    # Fallback PBKDF2 hash format: pbkdf2_sha256$iterations$salt$hash
    if hashed_password and hashed_password.startswith("pbkdf2_sha256$"):
        parts = hashed_password.split("$")
        if len(parts) == 4:
            try:
                iterations = int(parts[1])
                salt = parts[2].encode("utf-8")
                target_hash = parts[3]
                calculated = hashlib.pbkdf2_hmac(
                    "sha256", plain_password.encode("utf-8"), salt, iterations
                ).hex()
                return hmac.compare_digest(calculated, target_hash)
            except Exception:
                return False

    return False


def get_password_hash(password: str) -> str:
    """Generate a bcrypt or PBKDF2 hash from a plain-text password."""
    if HAS_PASSLIB and pwd_context is not None:
        return pwd_context.hash(password)

    # Standard library PBKDF2 fallback
    iterations = 100000
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${pw_hash}"


def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a signed JWT access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "type": "access",
    }

    if extra_claims:
        to_encode.update(extra_claims)

    if HAS_JOSE and jwt is not None:
        return jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
    return _stdlib_jwt_encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a signed JWT refresh token with longer expiration (default 30 days)."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=30)

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "type": "refresh",
    }

    if extra_claims:
        to_encode.update(extra_claims)

    if HAS_JOSE and jwt is not None:
        return jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
    return _stdlib_jwt_encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access or refresh token."""
    if HAS_JOSE and jwt is not None:
        try:
            return jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
            )
        except JWTError:
            return None

    try:
        return _stdlib_jwt_decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except Exception:
        return None

