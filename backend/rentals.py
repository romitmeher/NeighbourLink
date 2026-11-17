"""Rental inventory, availability and participant actions. All times stored as UTC."""
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from backend.core import db, me, metadata, users
from backend.bookings import bookings


router = APIRouter(prefix="/rentals", tags=["rentals"])
IST = timezone(timedelta(hours=5, minutes=30))
CATEGORIES = ("Basic tools", "Projectors/party equipment", "Camping equipment", "Household equipment")
HELD = ("awaiting_agreement", "awaiting_payment")
OCCUPIED = ("confirmed", "active", "return_proposed", "disputed")

listings = sa.Table(
    "rental_listings", metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("owner_id", sa.ForeignKey("users.id"), nullable=False, index=True),
    *[sa.Column(k, sa.Text, nullable=False) for k in ("title", "category", "description", "area", "condition", "defects", "accessories", "serial", "restrictions", "pickup_instructions", "return_instructions", "status")],
    sa.Column("daily_price", sa.Integer, nullable=False),
    sa.Column("photos", sa.JSON, nullable=False),
    sa.CheckConstraint("daily_price > 0"),
)
blackouts = sa.Table(
    "rental_blackouts", metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("listing_id", sa.ForeignKey("rental_listings.id"), nullable=False, index=True),
    sa.Column("start_at", sa.DateTime, nullable=False),
    sa.Column("end_at", sa.DateTime, nullable=False),
)
events = sa.Table(
    "rental_activity", metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("booking_id", sa.ForeignKey("bookings.id"), nullable=False, index=True),
    sa.Column("actor_id", sa.ForeignKey("users.id"), nullable=False),
    sa.Column("action", sa.String(40), nullable=False),
    sa.Column("note", sa.Text, nullable=False),
    sa.Column("photos", sa.JSON, nullable=False),
    sa.Column("accessories", sa.Text, nullable=False),
    sa.Column("created_at", sa.DateTime, nullable=False),
)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Listing(Input):
    title: str = Field(min_length=2, max_length=100)
    category: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=2, max_length=3000)
    area: str = Field(min_length=2, max_length=120)
    daily_price: int = Field(strict=True, gt=0, le=2_000_000)
    condition: str = Field(min_length=2, max_length=600)
    defects: str = Field(default="", max_length=1000)
    accessories: str = Field(default="", max_length=1000)
    serial: str = Field(default="", max_length=120)
    restrictions: str = Field(default="", max_length=1000)
    pickup_instructions: str = Field(min_length=2, max_length=1200)
    return_instructions: str = Field(min_length=2, max_length=1200)
    photos: list[int] = Field(default_factory=list, max_length=8)
    status: Literal["published", "paused", "archived"] = "published"


class Dates(Input):
    start: date
    end: date


class Action(Input):
    action: Literal["accept", "decline", "cancel", "pickup", "return", "receive", "issue"]
    note: str = Field(default="", max_length=2000)
    accessories: str = Field(default="", max_length=1000)
    photos: list[int] = Field(default_factory=list, max_length=8)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def local_day(value):
    return value.replace(tzinfo=timezone.utc).astimezone(IST).date()


def interval(start, end):
    if start < datetime.now(IST).date() or end <= start:
        raise HTTPException(422, "Choose a current or future start date and a later return date.")
    def midnight(d):
        return datetime.combine(d, time.min, IST).astimezone(timezone.utc).replace(tzinfo=None)
    return midnight(start), midnight(end)


def lock_listing(c, listing_id):
    row = c.execute(sa.select(listings).where(listings.c.id == listing_id).with_for_update()).mappings().first()
    if row is None:
        raise HTTPException(404, "Listing unavailable.")
    return dict(row)


def blocking():
    return sa.or_(bookings.c.status.in_(OCCUPIED),
                  sa.and_(bookings.c.status.in_(HELD), bookings.c.hold_until > now()))


def availability_conditions(resource_id, start, end, skip_id=None):
    taken = sa.select(bookings.c.id).where(
        bookings.c.kind == "rental", bookings.c.resource_id == resource_id,
        bookings.c.start_at < end, bookings.c.end_at > start, blocking(),
    )
    if skip_id is not None:
        taken = taken.where(bookings.c.id != skip_id)
    blocked = sa.select(blackouts.c.id).where(blackouts.c.listing_id == resource_id,
                                               blackouts.c.start_at < end, blackouts.c.end_at > start)
    return ~taken.exists(), ~blocked.exists()


def rental_available(c, listing_id, start_at, end_at, skip_id=None):
    return bool(c.scalar(sa.select(sa.and_(*availability_conditions(listing_id, start_at, end_at, skip_id)))))


def can_fulfil(c, booking):
    item = lock_listing(c, booking["resource_id"])
    return (item["status"] == "published" and local_day(booking["start_at"]) >= datetime.now(IST).date()
            and rental_available(c, item["id"], booking["start_at"], booking["end_at"], booking["id"]))


def valid_category(c, name):
    from backend.community import category_allowed
    if not category_allowed(c, "rental", name, CATEGORIES):
        raise HTTPException(422, "Choose an active rental category.")


def active(user):
    if user["state"] != "active":
        raise HTTPException(403, "Your account cannot create or accept bookings.")


def record(c, booking_id, actor_id, action, note="", photos=None, accessories=""):
    event_id = c.scalar(events.insert().values(booking_id=booking_id, actor_id=actor_id, action=action,
                                      note=note, photos=photos or [], accessories=accessories, created_at=now()).returning(events.c.id))
    from backend.community import notify
    roles = c.execute(sa.select(bookings.c.customer_id, bookings.c.provider_id)
                      .where(bookings.c.id == booking_id)).one()
    recipient = roles.provider_id if actor_id == roles.customer_id else roles.customer_id
    notify(c, recipient, f"rental-event-{event_id}", f"Rental #{booking_id}: {action}.", booking_id)


def check_photos(c, photos, user, booking_id=None):
    if not photos:
        return
    from backend.core import uploads
    if booking_id is None:
        from backend.core import require_public_uploads
        return require_public_uploads(c, user["id"], photos)
    query = sa.select(uploads.c.id, uploads.c.public, uploads.c.booking_id).where(
        uploads.c.id.in_(photos), uploads.c.owner_id == user["id"])
    items = list(c.execute(query).mappings())
    if len(items) != len(set(photos)) or any(
        item["public"] or
        (booking_id is not None and item.get("booking_id") != booking_id) for item in items
    ):
        raise HTTPException(422, "Select your own uploaded photos for this listing or booking.")


@router.get("/listings")
def discover(q: str = "", category: str = "", area: str = "", max_price: int | None = Query(None, gt=0),
             start: date | None = None, end: date | None = None, c=Depends(db)):
    private = {"serial", "pickup_instructions", "return_instructions"}
    fields = [col for col in listings.c if col.name not in private]
    query = sa.select(*fields).join(users, users.c.id == listings.c.owner_id).where(
        listings.c.status == "published", users.c.state == "active")
    if q.strip():
        query = query.where(sa.or_(listings.c.title.icontains(q.strip(), autoescape=True),
                                   listings.c.description.icontains(q.strip(), autoescape=True)))
    if area.strip():
        query = query.where(listings.c.area.icontains(area.strip(), autoescape=True))
    if category:
        query = query.where(listings.c.category == category)
    if max_price is not None:
        query = query.where(listings.c.daily_price <= max_price)
    if start is not None or end is not None:
        if start is None or end is None:
            raise HTTPException(422, "Supply both rental dates.")
        query = query.where(*availability_conditions(listings.c.id, *interval(start, end)))
    return [dict(row) for row in c.execute(query.order_by(listings.c.id.desc())).mappings()]


@router.get("/mine")
def mine(c=Depends(db), user=Depends(me)):
    return [dict(r) for r in c.execute(sa.select(listings).where(
        listings.c.owner_id == user["id"]).order_by(listings.c.id.desc())).mappings()]


@router.post("/listings", status_code=201)
def publish(data: Listing, c=Depends(db), user=Depends(me)):
    active(user)
    valid_category(c, data.category)
    check_photos(c, data.photos, user)
    return dict(c.execute(listings.insert().values(owner_id=user["id"], **data.model_dump())
                          .returning(*listings.c)).mappings().one())


@router.patch("/listings/{listing_id}")
def edit(listing_id: int, data: Listing, c=Depends(db), user=Depends(me)):
    item = lock_listing(c, listing_id)
    if item["owner_id"] != user["id"]:
        raise HTTPException(403, "Only the owner can edit this listing.")
    active(user)
    if item["status"] == "restricted":
        raise HTTPException(403, "This listing has been restricted.")
    valid_category(c, data.category)
    check_photos(c, data.photos, user)
    return dict(c.execute(listings.update().where(listings.c.id == listing_id)
                          .values(**data.model_dump()).returning(*listings.c)).mappings().one())


@router.post("/listings/{listing_id}/blackouts", status_code=201)
def blackout(listing_id: int, dates: Dates, c=Depends(db), user=Depends(me)):
    active(user)
    item = lock_listing(c, listing_id)
    if user["id"] != item["owner_id"]:
        raise HTTPException(403, "Only the owner can block dates.")
    start, end = interval(dates.start, dates.end)
    if not rental_available(c, listing_id, start, end):
        raise HTTPException(409, "The interval is already blocked or reserved.")
    return dict(c.execute(blackouts.insert().values(listing_id=listing_id, start_at=start, end_at=end)
                          .returning(*blackouts.c)).mappings().one())


@router.get("/listings/{listing_id}/blackouts")
def list_blackouts(listing_id: int, c=Depends(db), user=Depends(me)):
    item = lock_listing(c, listing_id)
    if user['id'] != item['owner_id']:
        raise HTTPException(403, 'Only the owner can manage blocked dates.')
    return [dict(row) for row in c.execute(sa.select(blackouts).where(
        blackouts.c.listing_id == listing_id).order_by(blackouts.c.start_at)).mappings()]


@router.delete("/listings/{listing_id}/blackouts/{block_id}")
def remove_blackout(listing_id: int, block_id: int, c=Depends(db), user=Depends(me)):
    active(user)
    item = lock_listing(c, listing_id)
    if user['id'] != item['owner_id']:
        raise HTTPException(403, 'Only the owner can manage blocked dates.')
    result = c.execute(blackouts.delete().where(blackouts.c.listing_id == listing_id, blackouts.c.id == block_id))
    if not result.rowcount:
        raise HTTPException(404, 'Blocked dates unavailable.')
    return {'removed': True}


@router.post("/listings/{listing_id}/requests", status_code=201)
def request(listing_id: int, dates: Dates, c=Depends(db), user=Depends(me)):
    active(user)
    item = lock_listing(c, listing_id)
    owner = c.execute(sa.select(users).where(users.c.id == item["owner_id"])).mappings().one()
    if item["status"] != "published" or owner["state"] != "active":
        raise HTTPException(404, "Listing unavailable.")
    if item["owner_id"] == user["id"]:
        raise HTTPException(422, "Choose an item owned by another person.")
    start, end = interval(dates.start, dates.end)
    if not rental_available(c, listing_id, start, end):
        raise HTTPException(409, "The item is unavailable for those dates.")
    days = (dates.end - dates.start).days
    amount = days * item["daily_price"]
    if amount > 2_000_000_000:
        raise HTTPException(422, "Rental value exceeds the supported booking amount.")
    terms = {k: item[k] for k in ("title", "condition", "defects", "accessories", "restrictions", "daily_price")}
    terms.update(days=days, start_date=str(dates.start), return_date=str(dates.end), owner=owner["name"],
                 renter=user["name"], no_security_deposit=True,
                 cancellation="Before pickup, either party may cancel for a full refund. After pickup, request review.",
                 responsibilities="Use only as permitted and return all listed accessories. Record issues in the booking.")
    booking_id = c.scalar(bookings.insert().values(kind="rental", customer_id=user["id"], provider_id=item["owner_id"],
        resource_id=listing_id, start_at=start, end_at=end, status="requested", amount=amount,
        commission_bps=int(os.getenv("COMMISSION_BPS", "1000")), terms=terms, created_at=now()).returning(bookings.c.id))
    record(c, booking_id, user["id"], "requested")
    return {"id": booking_id, "status": "requested", "amount": amount, "days": days}


def private_booking(c, booking_id, user, lock=False):
    query = sa.select(bookings).where(bookings.c.id == booking_id, bookings.c.kind == "rental")
    row = c.execute(query.with_for_update() if lock else query).mappings().first()
    if row is None or (not user["is_admin"] and user["id"] not in (row["customer_id"], row["provider_id"])):
        raise HTTPException(404, "Rental booking unavailable.")
    return dict(row)


@router.get("/bookings/{booking_id}")
def details(booking_id: int, c=Depends(db), user=Depends(me)):
    booking = private_booking(c, booking_id, user)
    history = [dict(r) for r in c.execute(sa.select(events).where(events.c.booking_id == booking_id)
                                          .order_by(events.c.id)).mappings()]
    today = datetime.now(IST).date()
    if booking["status"] in HELD and booking["hold_until"] and booking["hold_until"] <= now():
        booking["status"] = "expired"
    if booking["status"] in ("declined", "requested", "expired") and user["id"] == booking["customer_id"]:
        booking["terms"] = {k:v for k,v in booking["terms"].items() if k not in ("serial","pickup_instructions","return_instructions")}
    return {**booking, "activity": history,
            "overdue": booking["status"] == "active" and today >= local_day(booking["end_at"]),
            "upcoming": booking["status"] == "confirmed" and today < local_day(booking["start_at"])}


@router.post("/bookings/{booking_id}/actions")
def act(booking_id: int, data: Action, c=Depends(db), user=Depends(me)):
    b = private_booking(c, booking_id, user, lock=True)
    role = "owner" if user["id"] == b["provider_id"] else "renter" if user["id"] == b["customer_id"] else None
    if role is None:
        raise HTTPException(403, "Participant action required.")
    state = b["status"]
    if state in HELD and b["hold_until"] and b["hold_until"] <= now():
        raise HTTPException(409, "This reservation has expired.")
    action = data.action
    confirmation = c.scalar(sa.select(sa.func.count()).select_from(events).where(
        events.c.booking_id == booking_id, events.c.action == "pickup"))
    changes = {}
    if action == "accept" and role == "owner" and state == "requested":
        active(user)
        item = lock_listing(c, b["resource_id"])
        if item["status"] != "published" or local_day(b["start_at"]) < datetime.now(IST).date() or not rental_available(c,item["id"],b["start_at"],b["end_at"],booking_id):
            raise HTTPException(409, "This rental is no longer available for those dates.")
        private_terms = {k: item[k] for k in ("serial", "pickup_instructions", "return_instructions")}
        changes.update(status="awaiting_agreement", hold_until=now()+timedelta(minutes=30),
                       terms={**b["terms"], **private_terms})
    elif action == "decline" and role == "owner" and state == "requested":
        changes["status"] = "declined"
    elif action == "cancel" and state in ("requested", *HELD):
        changes.update(status="cancelled", hold_until=None)
    elif action == "cancel" and state == "confirmed" and not confirmation:
        from backend.payments import request_refund
        request_refund(c, booking_id, b["amount"], "Cancellation before pickup", f"cancel-rental-{booking_id}")
        changes["status"] = "cancelled"
    elif action == "pickup" and state == "confirmed":
        today = datetime.now(IST).date()
        if not (local_day(b["start_at"]) <= today < local_day(b["end_at"])):
            raise HTTPException(409, "Pickup is available during the agreed rental period.")
        seen = c.scalar(sa.select(events.c.id).where(events.c.booking_id == booking_id, events.c.action == "pickup",
                                                      events.c.actor_id == user["id"]))
        if seen:
            return details(booking_id, c, user)
        if confirmation:
            changes["status"] = "active"
    elif action == "return" and role == "renter" and state == "active":
        changes["status"] = "return_proposed"
    elif action == "receive" and role == "owner" and state == "return_proposed":
        changes["status"] = "completed"
    elif action in ("issue", "cancel") and state in ("confirmed", "active", "return_proposed") and data.note:
        changes["status"] = "disputed"
    else:
        raise HTTPException(409, "This action is unavailable for your role or booking status.")
    check_photos(c, data.photos, user, booking_id)
    if changes:
        c.execute(bookings.update().where(bookings.c.id == booking_id).values(**changes))
    if changes.get('status') == 'disputed':
        from backend.community import NewReport, report
        report(booking_id, NewReport(reason='Rental handover or cancellation issue',
            description=data.note, evidence=data.photos), c, user)
    record(c, booking_id, user["id"], action, data.note, data.photos, data.accessories)
    return details(booking_id, c, user)
