import os
import re
import secrets
import hmac
import warnings
from datetime import timedelta
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend.core import (account_actions, active, admin, check_origin, db, engine, me, metadata,
    now, optional_user, public_account, rate_limit, require_public_uploads, sessions, token_hash,
    uploads, users)
from backend.credentials import hash_password, verify_password

router = APIRouter(dependencies=[Depends(check_origin)])
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
_dev_otps: dict[str, dict[str, object]] = {}

class FormModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

def normalize_indian_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        digits = "91" + digits
    elif digits.startswith("0") and len(digits) == 11:
        digits = "91" + digits[1:]
    if len(digits) != 12 or not digits.startswith("91") or digits[2] not in "6789":
        raise ValueError("Enter a valid Indian mobile number")
    return "+" + digits

class Login(FormModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value

class Register(Login):
    password: str = Field(min_length=10, max_length=256)
    name: str = Field(min_length=1, max_length=100)
    area: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=16)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return normalize_indian_phone(value) if value.strip() else ""

class Profile(FormModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    area: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    photo_id: int | None = Field(default=None, ge=1)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return normalize_indian_phone(value) if value and value.strip() else value

class PasswordChange(FormModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)

class OtpRequest(FormModel):
    phone: str = Field(min_length=10, max_length=16)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return normalize_indian_phone(value)

class OtpVerify(OtpRequest):
    code: str = Field(min_length=6, max_length=6)

class Restriction(FormModel):
    state: Literal["active","restricted","suspended"]
    reason: str = Field(min_length=3, max_length=600)

def set_session(conn, response, user_id):
    token = secrets.token_urlsafe(32)
    conn.execute(insert(sessions).values(user_id=user_id, token_hash=token_hash(token),
        expires_at=now() + timedelta(days=7)))
    response.set_cookie("nl_session", token, path="/", httponly=True, samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "true").lower() in ("1", "true"), max_age=604800)

@router.get("/health")
def health():
    return {"status":"ok"}

@router.get("/ready")
def ready():
    try:
        with engine.connect() as conn:
            revision = conn.scalar(text("SELECT version_num FROM alembic_version"))
            if not revision:
                raise HTTPException(503, "Database migration required")
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable or migrations missing") from None
    return {"status":"ready","revision":revision}

@router.post("/auth/register", status_code=201)
def register(data: Register, request: Request, response: Response, conn: Connection = Depends(db)):
    rate_limit(request, "register", 5, 60)
    try:
        record = conn.execute(insert(users).values(email=data.email, name=data.name,
            area=data.area.strip(), phone=data.phone, password_hash=hash_password(data.password)).returning(users)).mappings().one()
    except IntegrityError:
        raise HTTPException(409, "Email is already registered") from None
    set_session(conn, response, record["id"])
    return public_account(record)

@router.post("/auth/login")
def login(data: Login, response: Response, request: Request, conn: Connection = Depends(db)):
    rate_limit(request, "login", 10, 60)
    account = conn.execute(select(users).where(users.c.email == data.email)).mappings().first()
    ok = verify_password(data.password, account["password_hash"] if account else DUMMY_HASH)
    if not account or not ok:
        raise HTTPException(401, "Invalid email or password")
    if account["state"] == "suspended":
        raise HTTPException(403, "Account suspended")
    previous = request.cookies.get("nl_session")
    if previous and len(previous) <= 128:
        conn.execute(delete(sessions).where(sessions.c.token_hash == token_hash(previous)))
    set_session(conn, response, account["id"])
    return public_account(account)

@router.post("/auth/dev-otp/request")
def request_dev_otp(data: OtpRequest, request: Request, conn: Connection = Depends(db)):
    rate_limit(request, "otp-request", 3, 300)
    if os.getenv("APP_ENV", "development") != "development":
        raise HTTPException(404, "Development OTP is unavailable")
    account = conn.execute(select(users).where(users.c.phone == data.phone)).mappings().first()
    if not account:
        raise HTTPException(404, "No account uses this phone number")
    previous = _dev_otps.get(data.phone)
    if previous and now().timestamp() - float(previous["requested_at"]) < 30:
        raise HTTPException(429, "Wait before requesting another code")
    code = f"{secrets.randbelow(1_000_000):06d}"
    _dev_otps[data.phone] = {"hash": token_hash(code), "requested_at": now().timestamp(),
                             "expires_at": (now() + timedelta(minutes=5)).timestamp(),
                             "attempts": 0, "user_id": account["id"]}
    return {"message": "Development OTP generated.", "development_code": code}

@router.post("/auth/dev-otp/verify")
def verify_dev_otp(data: OtpVerify, request: Request, response: Response, conn: Connection = Depends(db)):
    rate_limit(request, "otp-verify", 10, 300)
    if os.getenv("APP_ENV", "development") != "development":
        raise HTTPException(404, "Development OTP is unavailable")
    challenge = _dev_otps.get(data.phone)
    if not challenge or now().timestamp() >= float(challenge["expires_at"]):
        _dev_otps.pop(data.phone, None)
        raise HTTPException(400, "OTP expired or not requested")
    challenge["attempts"] = int(challenge["attempts"]) + 1
    if int(challenge["attempts"]) > 5:
        _dev_otps.pop(data.phone, None)
        raise HTTPException(429, "Too many OTP attempts")
    if not hmac.compare_digest(str(challenge["hash"]), token_hash(data.code)):
        raise HTTPException(401, "Incorrect OTP")
    account = conn.execute(select(users).where(users.c.id == int(challenge["user_id"]))).mappings().one()
    _dev_otps.pop(data.phone, None)
    set_session(conn, response, account["id"])
    return public_account(account)

@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, conn: Connection = Depends(db)):
    token = request.cookies.get("nl_session")
    if token and len(token) <= 128:
        conn.execute(delete(sessions).where(sessions.c.token_hash == token_hash(token)))
    response.delete_cookie("nl_session", path="/", httponly=True, samesite="lax")
    response.status_code = 204
    return response

@router.get("/auth/me")
def current(user: dict = Depends(me)):
    return user

@router.patch("/profile")
def edit_profile(body: Profile, user: dict = Depends(active), conn: Connection = Depends(db)):
    fields = body.model_dump(exclude_unset=True)
    for key in ("name","area","phone"):
        if key in fields:
            if fields[key] is None or (key == "name" and not fields[key].strip()):
                raise HTTPException(422, "Invalid profile field")
            fields[key] = fields[key].strip()
    if fields.get("photo_id"):
        require_public_uploads(conn, user["id"], [fields["photo_id"]])
    if not fields:
        return user
    return public_account(conn.execute(update(users).where(users.c.id == user["id"])
        .values(**fields).returning(users)).mappings().one())

@router.post("/auth/password")
def change_password(data: PasswordChange, response: Response, user: dict = Depends(active),
                    conn: Connection = Depends(db)):
    account = conn.execute(select(users).where(users.c.id == user["id"])).mappings().one()
    if not verify_password(data.current_password, account["password_hash"]):
        raise HTTPException(401, "Current password is incorrect")
    if verify_password(data.new_password, account["password_hash"]):
        raise HTTPException(422, "New password must be different")
    conn.execute(update(users).where(users.c.id == user["id"])
        .values(password_hash=hash_password(data.new_password)))
    conn.execute(delete(sessions).where(sessions.c.user_id == user["id"]))
    set_session(conn, response, user["id"])
    return public_account(conn.execute(select(users).where(users.c.id == user["id"])).mappings().one())

def booking_participant(conn, booking_id, user_id):
    bookings = metadata.tables.get("bookings")
    if bookings is None:
        return False
    return bool(conn.scalar(select(bookings.c.id).where(bookings.c.id == booking_id,
        (bookings.c.customer_id == user_id) | (bookings.c.provider_id == user_id))))

def upload_dir():
    return Path(os.getenv("UPLOAD_DIR", "var/uploads")).resolve()

@router.post("/uploads", status_code=201)
def upload(file: UploadFile = File(...), public: bool = Form(False), booking_id: int | None = Form(None),
           user: dict = Depends(active), conn: Connection = Depends(db)):
    if booking_id is not None:
        if public:
            raise HTTPException(422, "Booking evidence must be private")
        if not booking_participant(conn, booking_id, user["id"]):
            raise HTTPException(403, "Booking participant access required")
    if file.size is None or file.size == 0 or file.size > 5 * 1024**2:
        raise HTTPException(413, "Choose an image up to 5 MiB")
    try:
        with warnings.catch_warnings(), Image.open(file.file) as img:
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            expected_mime = {"JPEG":"image/jpeg", "PNG":"image/png", "WEBP":"image/webp"}.get(img.format)
            if not expected_mime or expected_mime != file.content_type or img.width * img.height > 12_000_000:
                raise HTTPException(422, "Choose a JPEG, PNG or WebP image under 12 megapixels")
            img.load()
            img.thumbnail((2400,2400))
            cleaned = img.convert("RGB")
            cleaned.info.clear()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning, ValueError):
        raise HTTPException(422, "Unreadable or oversized image") from None
    folder = upload_dir()
    folder.mkdir(parents=True, exist_ok=True)
    storage_name = uuid4().hex + ".jpg"
    path = folder / storage_name
    try:
        cleaned.save(path, "JPEG", quality=88)
        file_id = conn.scalar(insert(uploads).values(owner_id=user["id"], booking_id=booking_id,
            public=public, storage_name=storage_name, mime_type="image/jpeg").returning(uploads.c.id))
    except (OSError, SQLAlchemyError):
        path.unlink(missing_ok=True)
        raise
    return {"id":file_id, "url":f"/api/uploads/{file_id}", "public":public,"booking_id":booking_id}

@router.get("/uploads/{file_id}")
def read_upload(file_id: int, user: dict | None = Depends(optional_user), conn: Connection = Depends(db)):
    file = conn.execute(select(uploads).where(uploads.c.id == file_id)).mappings().first()
    if not file or (not file["public"] and (not user or not (
        user["id"] == file["owner_id"] or user["is_admin"] or
        (file["booking_id"] and booking_participant(conn, file["booking_id"], user["id"]))))):
        raise HTTPException(404, "Image unavailable")
    path = upload_dir() / file["storage_name"]
    if not path.is_file():
        raise HTTPException(404, "Image unavailable")
    return FileResponse(path, media_type=file["mime_type"],
        headers={"Cache-Control":"private, no-store" if not file["public"] else "public, max-age=86400",
                 "X-Content-Type-Options":"nosniff"})

@router.get("/admin/users")
def admin_users(user: dict = Depends(admin), conn: Connection = Depends(db)):
    return [public_account(row) for row in conn.execute(select(users).order_by(users.c.id)).mappings()]

@router.post("/admin/users/{user_id}/state")
def change_state(user_id: int, body: Restriction, actor: dict = Depends(admin), conn: Connection = Depends(db)):
    target = conn.execute(select(users).where(users.c.id == user_id).with_for_update()).mappings().first()
    if not target:
        raise HTTPException(404, "Unknown account")
    if target["is_admin"]:
        raise HTTPException(403, "Manage administrator access through the management command")
    if len(body.reason.strip()) < 3:
        raise HTTPException(422, "Provide a reason")
    if body.state != target["state"]:
        conn.execute(insert(account_actions).values(user_id=user_id, actor_id=actor["id"],
            old_state=target["state"], new_state=body.state, reason=body.reason.strip()))
        conn.execute(update(users).where(users.c.id == user_id).values(state=body.state))
        if body.state == "suspended":
            conn.execute(delete(sessions).where(sessions.c.user_id == user_id))
    return {"id":user_id,"state":body.state}

