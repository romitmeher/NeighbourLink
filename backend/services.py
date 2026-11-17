"""Local Help requests, provider offers and accepted service delivery."""
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import (
    JSON, Column, DateTime, ForeignKey, Integer, String, Table, UniqueConstraint,
    and_, or_, select,
)

from backend.bookings import bookings
from backend.core import active, db, me, metadata, require_public_uploads, uploads, users

router = APIRouter(prefix="/help", tags=["Local Help"])
provider_profiles = Table(
    "provider_profiles", metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("details", JSON, nullable=False),
)
task_requests = Table(
    "task_requests", metadata,
    Column("id", Integer, primary_key=True),
    Column("customer_id", ForeignKey("users.id"), nullable=False),
    Column("target_provider_id", ForeignKey("users.id")),
    Column("parent_booking_id", ForeignKey("bookings.id"), unique=True),
    Column("selected_offer_id", Integer),
    Column("booking_id", ForeignKey("bookings.id"), unique=True),
    Column("status", String(32), nullable=False),
    Column("details", JSON, nullable=False),
    Column("created_at", DateTime, nullable=False),
)
provider_offers = Table(
    "provider_offers", metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", ForeignKey("task_requests.id"), nullable=False),
    Column("provider_id", ForeignKey("users.id"), nullable=False),
    Column("terms", JSON, nullable=False),
    Column("status", String(32), nullable=False),
    Column("expires_at", DateTime, nullable=False),
    UniqueConstraint("request_id", "provider_id"),
)
service_delivery = Table(
    "service_delivery", metadata,
    Column("booking_id", ForeignKey("bookings.id"), primary_key=True),
    Column("minutes", Integer),
    Column("completion_note", String(2000)),
    Column("dispute", String(2000)),
    Column("proposed_at", DateTime),
    Column("confirmed_at", DateTime),
)


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Form(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Basis = Literal["fixed", "hourly", "inspection"]
CUSTOM_CATEGORY = "Custom request"


class Provider(Form):
    adult_declared: Literal[True]
    bio: str = Field(min_length=3, max_length=2000)
    categories: list[str] = Field(min_length=1, max_length=12)
    offerings: list[Literal["everyday", "professional"]] = Field(min_length=1, max_length=2)
    experience: str = Field(max_length=1200)
    qualifications: str = Field(default="", max_length=1200)
    sample_ids: list[int] = Field(default_factory=list, max_length=8)
    photo_id: int | None = Field(default=None, ge=1)
    area: str = Field(min_length=2, max_length=150)
    availability: str = Field(min_length=2, max_length=500)
    basis: Basis
    rate: int = Field(gt=0, le=100000000)


class Task(Form):
    title: str = Field(min_length=3, max_length=150)
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=4, max_length=2000)
    area: str = Field(min_length=2, max_length=150)
    preferred_schedule: str = Field(min_length=2, max_length=500)
    materials: str = Field(min_length=2, max_length=800)
    budget: int | None = Field(default=None, gt=0, le=100000000)
    photo_ids: list[int] = Field(default_factory=list, max_length=8)
    target_provider_id: int | None = Field(default=None, gt=0)


class Offer(Form):
    basis: Basis
    rate: int = Field(gt=0, le=100000000)
    max_minutes: int = Field(gt=0, le=24 * 60)
    travel: int = Field(ge=0, le=10000000)
    start_at: datetime
    end_at: datetime
    expires_at: datetime
    scope: str = Field(min_length=3, max_length=2000)
    exclusions: str = Field(min_length=2, max_length=1200)
    materials: str = Field(min_length=2, max_length=1200)

    @field_validator("start_at", "end_at", "expires_at")
    @classmethod
    def normalize_time(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Send an ISO timestamp including its time zone.")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    @model_validator(mode="after")
    def check_schedule(self):
        if not utcnow() < self.expires_at <= self.start_at < self.end_at:
            raise ValueError("Quote expiry must be in the future and at or before the appointment.")
        if self.max_minutes * 60 > (self.end_at - self.start_at).total_seconds():
            raise ValueError("Estimated work must fit the appointment window.")
        if offer_amount(self.rate, self.max_minutes, self.travel, self.basis) > 100000000:
            raise ValueError("Total exceeds the booking limit.")
        return self


def offer_amount(rate, minutes, travel, basis):
    labour = (rate * minutes + 30) // 60 if basis == "hourly" else rate
    return labour + travel


def allowed_category(conn, name):
    from backend.community import SERVICE_CATEGORIES, category_allowed
    if name == CUSTOM_CATEGORY:
        return
    if not category_allowed(conn, "service", name, SERVICE_CATEGORIES):
        raise HTTPException(422, "Choose an available Local Help category.")


def provider(conn, uid):
    row = conn.execute(select(provider_profiles.c.details, users.c.name, users.c.photo_id)
        .select_from(provider_profiles.join(users, users.c.id == provider_profiles.c.user_id))
        .where(provider_profiles.c.user_id == uid, users.c.state == "active")).mappings().first()
    if not row:
        raise HTTPException(404, "Provider unavailable.")
    return {"user_id": uid, "name": row["name"], **row["details"], "photo_id": row["photo_id"]}


@router.put("/profile")
def save_provider(form: Provider, conn=Depends(db), user=Depends(active)):
    uid = user["id"]
    conn.execute(select(users.c.id).where(users.c.id == uid).with_for_update()).one()
    for category in form.categories:
        allowed_category(conn, category)
    require_public_uploads(conn, uid, form.sample_ids)
    if form.photo_id is not None:
        require_public_uploads(conn, uid, [form.photo_id])
        conn.execute(users.update().where(users.c.id == uid).values(photo_id=form.photo_id))
    exists = conn.execute(select(provider_profiles.c.user_id).where(provider_profiles.c.user_id == uid)).first()
    statement = (provider_profiles.update().where(provider_profiles.c.user_id == uid) if exists
                 else provider_profiles.insert().values(user_id=uid))
    conn.execute(statement.values(details=form.model_dump(exclude={"photo_id"})))
    return provider(conn, uid)


@router.get("/providers")
def find_providers(category: str = "", area: str = "", conn=Depends(db)):
    rows = conn.execute(select(provider_profiles, users.c.name, users.c.photo_id).select_from(provider_profiles.join(users))
                        .where(users.c.state == "active").order_by(provider_profiles.c.user_id)).mappings()
    return [{"user_id": r["user_id"], "name": r["name"], **r["details"], "photo_id": r["photo_id"]} for r in rows
            if (not category or category in r["details"]["categories"])
            and area.casefold() in r["details"]["area"].casefold()]


def new_request(conn, form, customer, parent=None):
    allowed_category(conn, form.category)
    if form.target_provider_id is None:
        require_public_uploads(conn, customer, form.photo_ids)
    elif form.photo_ids:
        found = conn.scalars(select(uploads.c.id).where(uploads.c.owner_id == customer,
            uploads.c.id.in_(form.photo_ids), uploads.c.public.is_(False), uploads.c.booking_id.is_(None)))
        if set(found) != set(form.photo_ids):
            raise HTTPException(422, "Choose private request photos uploaded by your account.")
    if form.target_provider_id is not None:
        if form.target_provider_id == customer:
            raise HTTPException(422, "Choose a different provider.")
        if form.category != CUSTOM_CATEGORY and form.category not in provider(conn, form.target_provider_id)["categories"]:
            raise HTTPException(422, "Choose a category offered by this provider.")
    return conn.execute(task_requests.insert().values(
        customer_id=customer, target_provider_id=form.target_provider_id, parent_booking_id=parent,
        status="open", details=form.model_dump(exclude={"target_provider_id"}), created_at=utcnow()
    ).returning(task_requests.c.id)).scalar_one()


@router.post("/requests", status_code=201)
def post_request(form: Task, conn=Depends(db), user=Depends(active)):
    rid = new_request(conn, form, user["id"])
    if form.target_provider_id:
        ping(conn, form.target_provider_id, "quote-request", rid, "You received a request for a quote.")
    return {"id": rid}


def ping(conn, uid, event, rid, message):
    from backend.community import notify
    notify(conn, uid, f"help:{event}:{rid}", message)


def request_row(conn, rid, lock=False):
    query = select(task_requests).where(task_requests.c.id == rid)
    row = conn.execute(query.with_for_update() if lock else query).mappings().first()
    if not row:
        raise HTTPException(404, "Request unavailable.")
    return row


@router.get("/requests")
def tasks(conn=Depends(db), user=Depends(me)):
    uid = user["id"]
    involved = select(provider_offers.c.request_id).where(provider_offers.c.provider_id == uid)
    rows = conn.execute(select(task_requests).where(or_(
        task_requests.c.customer_id == uid, task_requests.c.target_provider_id == uid,
        task_requests.c.id.in_(involved),
        and_(task_requests.c.target_provider_id.is_(None), task_requests.c.status == "open")
    )).order_by(task_requests.c.id.desc())).mappings().all()
    return [dict(r) for r in rows]


@router.get("/requests/{rid}/photos/{photo_id}")
def request_photo(rid: int, photo_id: int, conn=Depends(db), user=Depends(me)):
    from fastapi import Response
    from fastapi.responses import FileResponse
    from backend.auth import upload_dir
    row = request_row(conn, rid)
    if row["target_provider_id"] is not None and user["id"] not in (row["customer_id"], row["target_provider_id"]):
        raise HTTPException(404, "Photo unavailable.")
    if photo_id not in row["details"].get("photo_ids", []):
        raise HTTPException(404, "Photo unavailable.")
    photo = conn.execute(select(uploads).where(uploads.c.id == photo_id,
                         uploads.c.owner_id == row["customer_id"])).mappings().first()
    if not photo:
        raise HTTPException(404, "Photo unavailable.")
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    if photo["content"] is not None:
        return Response(content=photo["content"], media_type=photo["mime_type"], headers=headers)
    path = upload_dir() / photo["storage_name"]
    if path.is_file():
        return FileResponse(path, media_type=photo["mime_type"], headers=headers)
    raise HTTPException(404, "Photo unavailable.")


def available_request(conn, rid, uid):
    row = request_row(conn, rid, True)
    if row["target_provider_id"] not in (None, uid):
        raise HTTPException(404, "Request unavailable.")
    if row["customer_id"] == uid or row["status"] != "open":
        raise HTTPException(409, "This request cannot receive your quote.")
    if (row["details"]["category"] != CUSTOM_CATEGORY
            and row["details"]["category"] not in provider(conn, uid)["categories"]):
        raise HTTPException(422, "Your profile must offer this category.")
    return row


def save_offer(conn, rid, uid, form):
    row = available_request(conn, rid, uid)
    if row["parent_booking_id"] and form.basis == "inspection":
        raise HTTPException(422, "A follow-up work quote must use fixed or hourly pricing.")
    query = select(provider_offers).where(provider_offers.c.provider_id == uid, provider_offers.c.request_id == rid)
    old = conn.execute(query).mappings().first()
    statement = (provider_offers.update().where(provider_offers.c.id == old["id"]) if old
                 else provider_offers.insert().values(request_id=rid, provider_id=uid))
    terms = form.model_dump(mode="json")
    for key in ("start_at", "end_at", "expires_at"):
        terms[key] += "Z"
    oid = conn.execute(statement.values(terms=terms, status="offered", expires_at=form.expires_at)
                       .returning(provider_offers.c.id)).scalar_one()
    ping(conn, row["customer_id"], "offer", oid, "A provider submitted a quote.")
    return {"id": oid, "request_id": rid}


@router.post("/requests/{rid}/offers", status_code=201)
def quote(rid: int, form: Offer, conn=Depends(db), user=Depends(active)):
    return save_offer(conn, rid, user["id"], form)


@router.get("/requests/{rid}/offers")
def offers(rid: int, conn=Depends(db), user=Depends(me)):
    row = request_row(conn, rid)
    query = select(provider_offers, users.c.name.label("provider_name")).select_from(provider_offers.join(users))
    query = query.where(provider_offers.c.request_id == rid)
    if row["customer_id"] != user["id"]:
        if row["target_provider_id"] not in (None, user["id"]):
            raise HTTPException(404, "Request unavailable.")
        query = query.where(provider_offers.c.provider_id == user["id"])
    return [dict(r) for r in conn.execute(query).mappings()]


def can_fulfil(conn, b):
    """Serialize schedule decisions on the provider row across different tasks."""
    uid = b["provider_id"]
    state = conn.execute(select(users.c.state).where(users.c.id == uid).with_for_update()).scalar_one()
    if state != "active" or b["start_at"] <= utcnow():
        return False
    blocking = or_(bookings.c.status.in_(("confirmed", "in_progress", "completion_proposed", "disputed")),
                   and_(bookings.c.status.in_(("awaiting_agreement", "awaiting_payment")),
                        bookings.c.hold_until > utcnow()))
    query = select(bookings.c.id).where(bookings.c.kind == "service", bookings.c.provider_id == uid,
        bookings.c.start_at < b["end_at"], bookings.c.end_at > b["start_at"], blocking)
    if b.get("id"):
        query = query.where(bookings.c.id != b["id"])
    return conn.execute(query.limit(1)).first() is None


@router.post("/requests/{rid}/offers/{oid}/accept")
def accept_offer(rid: int, oid: int, conn=Depends(db), user=Depends(active)):
    row = request_row(conn, rid, True)
    if row["customer_id"] != user["id"]:
        raise HTTPException(403, "Only the requesting customer can select a quote.")
    if row["status"] != "open":
        if row["selected_offer_id"] == oid and row["booking_id"]:
            return {"booking_id": row["booking_id"]}
        raise HTTPException(409, "A quote has already been selected or the request is closed.")
    offer = conn.execute(select(provider_offers).where(provider_offers.c.id == oid,
                         provider_offers.c.request_id == rid)).mappings().first()
    if not offer or offer["status"] != "offered" or offer["expires_at"] <= utcnow():
        raise HTTPException(409, "This quote is unavailable or expired.")
    terms = dict(offer["terms"])
    start = datetime.fromisoformat(terms["start_at"]).replace(tzinfo=None)
    end = datetime.fromisoformat(terms["end_at"]).replace(tzinfo=None)
    draft = dict(provider_id=offer["provider_id"], start_at=start, end_at=end)
    if not can_fulfil(conn, draft):
        raise HTTPException(409, "The provider is unavailable at that time.")
    terms.update(title=row["details"]["title"], category=row["details"]["category"], area=row["details"]["area"],
                 request_id=rid, offer_id=oid, parent_booking_id=row["parent_booking_id"],
                 completion="Provider proposes completion. Customer confirms or reports a problem.",
                 cancellation="Before work begins, request a full refund. Once work starts, request review.")
    amount = offer_amount(terms["rate"], terms["max_minutes"], terms["travel"], terms["basis"])
    bid = conn.execute(bookings.insert().values(**draft, kind="service", resource_id=rid,
        customer_id=user["id"], status="awaiting_agreement", amount=amount,
        commission_bps=int(os.getenv("COMMISSION_BPS","1000")), terms=terms,
        hold_until=min(start, utcnow()+timedelta(minutes=30)), created_at=utcnow())
        .returning(bookings.c.id)).scalar_one()
    conn.execute(task_requests.update().where(task_requests.c.id == rid).values(
        selected_offer_id=oid, booking_id=bid, status="selected"))
    conn.execute(provider_offers.update().where(provider_offers.c.request_id == rid).values(status="closed"))
    conn.execute(provider_offers.update().where(provider_offers.c.id == oid).values(status="selected"))
    conn.execute(service_delivery.insert().values(booking_id=bid))
    ping(conn, offer["provider_id"], "selected", bid, "Your quote was selected. Review the service agreement.")
    return {"booking_id": bid}


@router.post("/requests/{rid}/decline")
def decline(rid: int, conn=Depends(db), user=Depends(active)):
    row = request_row(conn, rid, True)
    if user["id"] not in (row["customer_id"], row["target_provider_id"]):
        raise HTTPException(403, "Only the customer or invited provider can decline.")
    if row["status"] != "open":
        raise HTTPException(409, "Only an open request can be declined.")
    conn.execute(task_requests.update().where(task_requests.c.id == rid).values(status="declined"))
    conn.execute(provider_offers.update().where(provider_offers.c.request_id == rid).values(status="closed"))
    other = row["customer_id"] if user["id"] != row["customer_id"] else row["target_provider_id"]
    if other:
        ping(conn, other, "declined", rid, "The service request was declined.")
    return {"status": "declined"}


def service_booking(conn, bid, uid, side=None, status=None):
    row = conn.execute(select(bookings).where(bookings.c.id == bid, bookings.c.kind == "service")
                       .with_for_update()).mappings().first()
    if not row or uid not in (row["customer_id"], row["provider_id"]):
        raise HTTPException(404, "Booking unavailable.")
    if side and row[side] != uid:
        raise HTTPException(403, "The other participant must perform this step.")
    if status and row["status"] != status:
        raise HTTPException(409, "This action is unavailable at the current booking stage.")
    return row


def transition(conn, row, status, recipient, message):
    conn.execute(bookings.update().where(bookings.c.id == row["id"]).values(status=status))
    ping(conn, recipient, status, row["id"], message)
    return {"id": row["id"], "status": status}


@router.post("/bookings/{bid}/start")
def start_work(bid: int, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user["id"], "provider_id", "confirmed")
    if utcnow() < row["start_at"]:
        raise HTTPException(409, "Work can start at the agreed appointment time.")
    return transition(conn, row, "in_progress", row["customer_id"], "The provider started work.")


class Completion(Form):
    note: str = Field(min_length=2, max_length=2000)
    minutes: int | None = Field(default=None, gt=0, le=1440)


@router.post("/bookings/{bid}/propose")
def propose(bid: int, form: Completion, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user["id"], "provider_id", "in_progress")
    terms = row["terms"]
    if terms["basis"] == "hourly" and (form.minutes is None or form.minutes > terms["max_minutes"]):
        raise HTTPException(422, "Submit actual minutes within the approved cap.")
    if terms["basis"] != "hourly" and form.minutes is not None:
        raise HTTPException(422, "Actual minutes apply only to hourly work.")
    conn.execute(service_delivery.update().where(service_delivery.c.booking_id == bid).values(
        minutes=form.minutes, completion_note=form.note, proposed_at=utcnow()))
    return transition(conn, row, "completion_proposed", row["customer_id"], "Review the proposed completion.")


@router.get("/bookings/{bid}/delivery")
def delivery(bid: int, conn=Depends(db), user=Depends(me)):
    from backend.bookings import authorized_booking
    row = authorized_booking(conn, bid, user)
    if row['kind'] != 'service':
        raise HTTPException(404, 'Service booking unavailable.')
    detail = conn.execute(select(service_delivery).where(service_delivery.c.booking_id == bid)).mappings().one()
    return dict(detail)


@router.post("/bookings/{bid}/confirm")
def confirm(bid: int, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user["id"], "customer_id", "completion_proposed")
    terms = row["terms"]
    if terms["basis"] == "hourly":
        minutes = conn.execute(select(service_delivery.c.minutes).where(service_delivery.c.booking_id == bid)).scalar_one()
        unused = row["amount"] - offer_amount(terms["rate"], minutes, terms["travel"], "hourly")
        if unused:
            from backend.payments import request_refund
            request_refund(conn, bid, unused, "Unused hourly prepayment", f"hourly:{bid}")
    conn.execute(service_delivery.update().where(service_delivery.c.booking_id == bid).values(confirmed_at=utcnow()))
    return transition(conn, row, "completed", row["provider_id"], "The customer confirmed completion.")


class Dispute(Form):
    reason: str = Field(min_length=4, max_length=2000)


@router.post('/bookings/{bid}/cancel')
def cancel_service(bid: int, form: Dispute, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user['id'])
    if row['status'] == 'cancelled':
        return {'id': bid, 'status': 'cancelled'}
    if row['status'] in ('awaiting_agreement', 'awaiting_payment', 'confirmed'):
        if row['status'] == 'confirmed':
            from backend.payments import request_refund
            request_refund(conn, bid, row['amount'], 'Cancellation before work: ' + form.reason,
                           f'cancel-service-{bid}')
        conn.execute(bookings.update().where(bookings.c.id == bid).values(hold_until=None))
        status = 'cancelled'
    elif row['status'] in ('in_progress', 'completion_proposed'):
        from backend.community import NewReport, report
        report(bid, NewReport(reason='Service cancellation review', description=form.reason), conn, user)
        status = 'disputed'
    else:
        raise HTTPException(409, 'This booking cannot be cancelled at its current stage.')
    conn.execute(service_delivery.update().where(service_delivery.c.booking_id == bid).values(dispute=form.reason))
    other = row['customer_id'] if user['id'] == row['provider_id'] else row['provider_id']
    return transition(conn, row, status, other, 'Service cancellation: ' + form.reason)


@router.post("/bookings/{bid}/dispute")
def dispute(bid: int, form: Dispute, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user["id"], "customer_id", "completion_proposed")
    conn.execute(service_delivery.update().where(service_delivery.c.booking_id == bid).values(dispute=form.reason))
    from backend.community import NewReport, report
    report(bid, NewReport(reason='Service completion disputed', description=form.reason), conn, user)
    return transition(conn, row, "disputed", row["provider_id"], "The customer disputed completion.")


@router.post("/bookings/{bid}/follow-up", status_code=201)
def follow_up(bid: int, form: Offer, conn=Depends(db), user=Depends(active)):
    row = service_booking(conn, bid, user["id"], "provider_id", "completed")
    if row["terms"]["basis"] != "inspection" or form.basis == "inspection":
        raise HTTPException(422, "Only completed inspections support a separate work quote.")
    existing = conn.execute(select(task_requests.c.id).where(task_requests.c.parent_booking_id == bid)).scalar()
    if existing:
        raise HTTPException(409, "A follow-up request already exists.")
    terms = row["terms"]
    follow = Task(title=f"Work after inspection #{bid}", category=terms["category"], area=terms["area"],
                  description=form.scope, materials=form.materials, preferred_schedule=form.start_at.isoformat()+"Z",
                  target_provider_id=row["provider_id"])
    rid = new_request(conn, follow, row["customer_id"], bid)
    return save_offer(conn, rid, row["provider_id"], form)

