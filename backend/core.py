"""Shared database and request dependencies. Run as backend.* from the repository root."""
import hashlib
import hmac
import os
import threading
import time
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import (Boolean, CheckConstraint, Column, DateTime, ForeignKey,
                        Integer, MetaData, String, Table, Text, create_engine, select)
from sqlalchemy.engine import Connection

metadata = MetaData(naming_convention={"ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s", "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"})
database_url = os.getenv("DATABASE_URL", "postgresql+psycopg://neighbourlink@localhost/neighbourlink")
engine = create_engine(database_url, pool_pre_ping=True)
_rate_limits: dict[tuple[int, str, str], list[float]] = {}
_rate_limit_lock = threading.Lock()

def now():
    return datetime.now(timezone.utc)

users = Table("users", metadata,
    Column("id", Integer, primary_key=True),
    Column("email", String(254), nullable=False, unique=True),
    Column("password_hash", Text, nullable=False), Column("name", String(100), nullable=False),
    Column("area", String(120), nullable=False, default=""),
    Column("phone", String(30), nullable=False, default=""),
    Column("photo_id", Integer), Column("is_admin", Boolean, nullable=False, default=False),
    Column("policy_required", Boolean, nullable=False, default=False),
    Column("policy_version", String(40)), Column("policy_accepted_at", DateTime(timezone=True)),
    Column("state", String(20), nullable=False, default="active"),
    Column("created_at", DateTime(timezone=True), nullable=False, default=now),
    CheckConstraint("state in ('active','restricted','suspended')", name="valid_account_state"))

sessions = Table("sessions", metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("expires_at", DateTime(timezone=True), nullable=False, index=True))

uploads = Table("uploads", metadata, Column("id", Integer, primary_key=True),
    Column("owner_id", ForeignKey("users.id"), nullable=False),
    Column("public", Boolean, nullable=False), Column("booking_id", Integer, index=True),
    Column("storage_name", String(60), unique=True, nullable=False),
    Column("mime_type", String(40), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, default=now))

account_actions = Table("account_actions", metadata, Column("id", Integer, primary_key=True),
    Column("user_id", ForeignKey("users.id"), nullable=False),
    Column("actor_id", ForeignKey("users.id"), nullable=False),
    Column("old_state", String(20), nullable=False), Column("new_state", String(20), nullable=False),
    Column("reason", String(600), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, default=now))

def db():
    with engine.begin() as conn:
        yield conn

def allowed_origins():
    defaults = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000,http://127.0.0.1:8000"
    return {o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", defaults).split(",") if o.strip()}

def check_origin(request: Request):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in allowed_origins():
            raise HTTPException(403, "Untrusted request origin")

def rate_limit(request: Request, bucket: str, limit: int, window_seconds: int):
    """Apply a process-local request limit for development and single-instance use."""
    client = request.client.host if request.client else "unknown"
    key = (id(request.app), bucket, client)
    cutoff = time.monotonic() - window_seconds
    with _rate_limit_lock:
        timestamps = [stamp for stamp in _rate_limits.get(key, []) if stamp > cutoff]
        if len(timestamps) >= limit:
            retry_after = max(1, int(timestamps[0] + window_seconds - time.monotonic()))
            raise HTTPException(429, "Too many requests", headers={"Retry-After": str(retry_after)})
        timestamps.append(time.monotonic())
        _rate_limits[key] = timestamps

def token_hash(token):
    secret = os.getenv("SESSION_SECRET", "")
    if len(secret.encode()) < 32:
        raise HTTPException(503, "Configure a session secret of at least 32 bytes")
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()

def public_account(row):
    return {k: row[k] for k in ("id", "name", "area", "phone", "email", "state", "is_admin", "photo_id", "created_at", "policy_required", "policy_version", "policy_accepted_at")}

def optional_user(request: Request, conn: Connection = Depends(db)):
    check_origin(request)
    token = request.cookies.get("nl_session")
    if not token or len(token) > 128:
        return None
    account = conn.execute(select(users).join(sessions)
        .where(sessions.c.token_hash == token_hash(token), sessions.c.expires_at > now())).mappings().first()
    if account and account["state"] == "suspended":
        raise HTTPException(403, "Account suspended")
    return public_account(account) if account else None

def me(user: dict | None = Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "Please sign in")
    return user

def active(user: dict = Depends(me)):
    if user["state"] != "active":
        raise HTTPException(403, "Account restricted")
    return user

def admin(user: dict = Depends(active)):
    if not user["is_admin"]:
        raise HTTPException(403, "Administrator access required")
    return user

def require_public_uploads(conn, owner_id, ids):
    if not ids:
        return
    found = set(conn.scalars(select(uploads.c.id).where(uploads.c.owner_id == owner_id,
                    uploads.c.public.is_(True), uploads.c.id.in_(ids))))
    if found != set(ids):
        raise HTTPException(422, "Choose a public image uploaded by your account")

