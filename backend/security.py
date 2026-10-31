from pwdlib import PasswordHash
import hashlib
import jwt
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.database import engine
from backend.models.user import User

password_hash = PasswordHash.recommended()

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set")

ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)

def create_access_token(username: str, role: str = "user", token_version: int | None = None) -> str:
    if token_version is None:
        try:
            with Session(engine) as session:
                user = session.query(User).filter(User.username == username).first()
                if user and user.token_version is not None:
                    token_version = user.token_version
                else:
                    token_version = 1
        except Exception:
            token_version = 1

    payload = {
        "sub": username,
        "role": role,
        "tv": int(token_version),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60)
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return token

def get_password_fingerprint(password_hash: str) -> str:
    """Full 64-character SHA-256 fingerprint of the user password hash."""
    if not password_hash:
        return ""
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()


def create_password_reset_token(username: str, password_hash: str | None = None) -> str:
    """Generates a 15-minute signed JWT bound to username and password fingerprint."""
    if password_hash is None:
        with Session(engine) as session:
            user = session.query(User).filter(User.username == username).first()
            if user:
                password_hash = user.password

    fp = get_password_fingerprint(password_hash) if password_hash else ""
    payload = {
        "sub": username,
        "fp": fp,
        "type": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_password_reset_token(token: str) -> dict:
    """Decodes reset JWT and validates token type, expiration, and payload structure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid token type")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=400, detail="Invalid token payload")
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")


def verify_password_reset_token(token: str, current_password_hash: str | None = None) -> str:
    """Validates the reset token and optionally asserts that the password fingerprint matches."""
    payload = decode_password_reset_token(token)
    username = payload["sub"]

    if current_password_hash is not None:
        token_fp = payload.get("fp", "")
        current_fp = get_password_fingerprint(current_password_hash)
        if not token_fp or token_fp != current_fp:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired reset token: password has already been changed or token is invalid",
            )

    return username

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")
        token_version = payload.get("tv")

        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        if token_version is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing token version claim"
            )

        with Session(engine) as session:
            user = session.query(User).filter(User.username == username).first()
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User no longer exists"
                )

            current_tv = user.token_version if user.token_version is not None else 1
            if current_tv != token_version:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session invalidated due to password change or logout. Please sign in again."
                )

            return user

    except HTTPException:
        raise
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

def require_role(allowed_roles: list[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: insufficient privileges"
            )
        return current_user
    return role_checker
