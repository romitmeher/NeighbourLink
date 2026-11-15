"""Participant communications, reputation, case handling and administration."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text,
    UniqueConstraint, and_, func, insert, or_, select, update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from backend.core import active, admin, db, me, metadata, uploads, users
from backend.bookings import bookings


router = APIRouter(prefix="/community", tags=["community"])
SERVICE_CATEGORIES = ("Packing", "Organising", "Event setup", "Furniture assembly", "Computer setup", "Cleaning")
RENTAL_CATEGORIES = ("Basic tools", "Projectors/party equipment", "Camping equipment", "Household equipment")


def timestamp():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def identity():
    return Column("id", Integer, primary_key=True)


def user_ref(name):
    return Column(name, Integer, ForeignKey("users.id"), nullable=False)


def created():
    return Column("created_at", DateTime, default=timestamp, nullable=False)


messages = Table("messages", metadata, identity(),
    Column("thread", String(100), nullable=False, index=True),
    user_ref("sender_id"), user_ref("recipient_id"), Column("body", Text, nullable=False),
    created(), Column("read_at", DateTime))
notifications = Table("notifications", metadata, identity(), user_ref("user_id"),
    Column("event_key", String(250), nullable=False), Column("message", Text, nullable=False),
    Column("booking_id", Integer, ForeignKey("bookings.id")), created(), Column("read_at", DateTime),
    UniqueConstraint("user_id", "event_key"))
reviews = Table("reviews", metadata, identity(),
    Column("booking_id", Integer, ForeignKey("bookings.id"), nullable=False),
    user_ref("reviewer_id"), user_ref("subject_id"), Column("kind", String(12), nullable=False),
    Column("stars", Integer, nullable=False), Column("comment", Text, nullable=False), created(),
    UniqueConstraint("booking_id", "reviewer_id"))
reports = Table("reports", metadata, identity(),
    Column("booking_id", Integer, ForeignKey("bookings.id"), nullable=False),
    user_ref("author_id"), Column("reason", String(120), nullable=False),
    Column("description", Text, nullable=False), Column("evidence", JSON, nullable=False),
    Column("status", String(20), nullable=False), created())
case_events = Table("case_events", metadata, identity(),
    Column("report_id", Integer, ForeignKey("reports.id"), nullable=False), user_ref("actor_id"),
    Column("action", String(30), nullable=False), Column("text", Text, nullable=False),
    Column("internal", Boolean, nullable=False), created())
audit = Table("moderation_audit", metadata, identity(), user_ref("actor_id"),
    Column("target", String(100), nullable=False), Column("action", String(80), nullable=False),
    Column("reason", Text, nullable=False), created())
categories = Table("category_settings", metadata, identity(),
    Column("kind", String(12), nullable=False), Column("name", String(80), nullable=False),
    Column("enabled", Boolean, nullable=False), UniqueConstraint("kind", "name"))


def require_text(value):
    if not value.strip():
        raise HTTPException(422, "Enter text before submitting.")
    return value.strip()


def rows(conn, stmt):
    return [dict(r) for r in conn.execute(stmt).mappings()]


def visible_categories(conn, kind, defaults=None):
    names = set(defaults if defaults is not None else (SERVICE_CATEGORIES if kind == "service" else RENTAL_CATEGORIES))
    for row in rows(conn, select(categories).where(categories.c.kind == kind)):
        if row["enabled"]:
            names.add(row["name"])
        else:
            names.discard(row["name"])
    return sorted(names)


def category_allowed(conn, kind, name, defaults=None):
    return name in visible_categories(conn, kind, defaults)


@router.get("/categories")
def category_list(kind: Literal["service", "rental"], conn=Depends(db)):
    return visible_categories(conn, kind)


def notify(conn, user_id, event_key, message, booking_id=None):
    """A deterministic event key makes concurrent delivery and retries idempotent."""
    dialect_insert = sqlite_insert if conn.dialect.name == "sqlite" else pg_insert
    stmt = dialect_insert(notifications).values(user_id=user_id, event_key=event_key, message=message, booking_id=booking_id)
    conn.execute(stmt.on_conflict_do_nothing(index_elements=["user_id", "event_key"]))


def booking_access(conn, booking_id, user, allow_admin=False, lock=False):
    stmt = select(bookings).where(bookings.c.id == booking_id)
    if lock:
        stmt = stmt.with_for_update()
    b = conn.execute(stmt).mappings().first()
    if not b or (user["id"] not in (b["customer_id"], b["provider_id"]) and not (allow_admin and user["is_admin"])):
        raise HTTPException(404, "Booking not found.")
    return b


def counterparty(b, uid):
    return b["provider_id"] if b["customer_id"] == uid else b["customer_id"]


def conversation(conn, thread, uid):
    return rows(conn, select(messages.c.id, messages.c.sender_id, users.c.name.label("sender"),
        messages.c.body, messages.c.created_at, messages.c.read_at)
        .join(users, users.c.id == messages.c.sender_id)
        .where(messages.c.thread == thread).order_by(messages.c.id))


class Body(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def send(conn, thread, recipient, user, text, booking_id=None):
    mid = conn.execute(insert(messages).values(thread=thread, sender_id=user["id"], recipient_id=recipient,
        body=require_text(text))).inserted_primary_key[0]
    notify(conn, recipient, f"message:{mid}", f"New message from {user['name']}", booking_id)
    return {"id": mid}


def mark_thread(conn, thread, uid):
    conn.execute(update(messages).where(messages.c.thread == thread,
        messages.c.recipient_id == uid, messages.c.read_at.is_(None)).values(read_at=timestamp()))
    return {"read": True}


@router.get("/bookings/{bid}/messages")
def booking_messages(bid: int, conn=Depends(db), user=Depends(me)):
    booking_access(conn, bid, user, allow_admin=True)
    return conversation(conn, f"b:{bid}", user["id"])


@router.post("/bookings/{bid}/messages")
def booking_send(bid: int, data: Body, conn=Depends(db), user=Depends(active)):
    b = booking_access(conn, bid, user)
    return send(conn, f"b:{bid}", counterparty(b, user["id"]), user, data.body, bid)


@router.post("/bookings/{bid}/messages/read")
def booking_read(bid: int, conn=Depends(db), user=Depends(me)):
    booking_access(conn, bid, user)
    return mark_thread(conn, f"b:{bid}", user["id"])


def request_access(conn, rid, pid, user):
    from backend.services import task_requests, provider_offers
    req = conn.execute(select(task_requests).where(task_requests.c.id == rid)).mappings().first()
    if not req or req["customer_id"] == pid or user["id"] not in (req["customer_id"], pid):
        raise HTTPException(404, "Conversation not found.")
    has_offer = conn.scalar(select(provider_offers.c.id).where(provider_offers.c.request_id == rid,
        provider_offers.c.provider_id == pid).limit(1))
    if req["target_provider_id"] != pid and (req["target_provider_id"] is not None or not has_offer):
        raise HTTPException(404, "Conversation not found.")
    return pid if user["id"] == req["customer_id"] else req["customer_id"]


@router.get("/requests/{rid}/providers/{pid}/messages")
def request_messages(rid: int, pid: int, conn=Depends(db), user=Depends(me)):
    request_access(conn, rid, pid, user)
    return conversation(conn, f"r:{rid}:{pid}", user["id"])


@router.post("/requests/{rid}/providers/{pid}/messages")
def request_send(rid: int, pid: int, data: Body, conn=Depends(db), user=Depends(active)):
    recipient = request_access(conn, rid, pid, user)
    return send(conn, f"r:{rid}:{pid}", recipient, user, data.body)


@router.post("/requests/{rid}/providers/{pid}/messages/read")
def request_read(rid: int, pid: int, conn=Depends(db), user=Depends(me)):
    request_access(conn, rid, pid, user)
    return mark_thread(conn, f"r:{rid}:{pid}", user["id"])


@router.get("/inbox")
def inbox(conn=Depends(db), user=Depends(me)):
    uid = user["id"]
    return {"notifications": rows(conn, select(notifications).where(notifications.c.user_id == uid)
        .order_by(notifications.c.id.desc()).limit(200)),
        "unread_messages": conn.scalar(select(func.count()).select_from(messages)
            .where(messages.c.recipient_id == uid, messages.c.read_at.is_(None))),
        "unread_notifications": conn.scalar(select(func.count()).select_from(notifications)
            .where(notifications.c.user_id == uid, notifications.c.read_at.is_(None)))}


@router.post("/notifications/{nid}/read")
def notification_read(nid: int, conn=Depends(db), user=Depends(me)):
    result = conn.execute(update(notifications).where(notifications.c.id == nid,
        notifications.c.user_id == user["id"]).values(read_at=func.coalesce(notifications.c.read_at, timestamp())))
    if not result.rowcount:
        raise HTTPException(404, "Notification not found.")
    return {"read": True}


class Review(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


@router.post("/bookings/{bid}/reviews")
def review(bid: int, data: Review, conn=Depends(db), user=Depends(active)):
    b = booking_access(conn, bid, user, lock=True)
    subject = counterparty(b, user["id"])
    if b["status"] != "completed" or subject == user["id"]:
        raise HTTPException(409, "Only completed bookings between different users can be reviewed.")
    dialect_insert = sqlite_insert if conn.dialect.name == "sqlite" else pg_insert
    result = conn.execute(dialect_insert(reviews).values(booking_id=bid, reviewer_id=user["id"], subject_id=subject,
        kind=b["kind"], stars=data.stars, comment=data.comment.strip()).on_conflict_do_nothing(
            index_elements=["booking_id", "reviewer_id"]))
    if not result.rowcount:
        raise HTTPException(409, "You already reviewed this booking.")
    notify(conn, subject, f"review:{bid}:{user['id']}", "Your booking received a review.", bid)
    return {"submitted": True}


@router.get("/ratings/{uid}")
def ratings(uid: int, conn=Depends(db)):
    result = {k: {"count": 0, "average": None} for k in ("service", "rental")}
    summary = conn.execute(select(reviews.c.kind, func.count(), func.avg(reviews.c.stars))
        .where(reviews.c.subject_id == uid).group_by(reviews.c.kind))
    for kind, count, average in summary:
        result[kind] = {"count": count, "average": round(float(average), 2)}
    return result


class NewReport(BaseModel):
    reason: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=4000)
    evidence: list[int] = Field(default_factory=list, max_length=10)


def add_case_event(conn, rid, actor, action, text, internal=False):
    return conn.execute(insert(case_events).values(report_id=rid, actor_id=actor,
        action=action, text=text, internal=internal)).inserted_primary_key[0]


@router.post("/bookings/{bid}/reports")
def report(bid: int, data: NewReport, conn=Depends(db), user=Depends(active)):
    b = booking_access(conn, bid, user)
    evidence = set(data.evidence)
    if evidence:
        found = set(conn.scalars(select(uploads.c.id).where(uploads.c.id.in_(evidence),
            uploads.c.owner_id == user["id"], uploads.c.booking_id == bid, uploads.c.public.is_(False))))
        if found != evidence:
            raise HTTPException(422, "Attach private evidence uploaded by you for this booking.")
    rid = conn.execute(insert(reports).values(booking_id=bid, author_id=user["id"], reason=require_text(data.reason),
        description=require_text(data.description), evidence=sorted(evidence), status="open")).inserted_primary_key[0]
    add_case_event(conn, rid, user["id"], "opened", "Report opened")
    notify(conn, counterparty(b, user["id"]), f"case:{rid}:opened", f"Report #{rid} opened. You may respond.", bid)
    return {"id": rid}


class CaseAction(BaseModel):
    action: Literal["response", "note", "investigating", "resolved", "reopened"]
    text: str = Field(min_length=1, max_length=4000)


@router.post("/reports/{rid}/actions")
def case_action(rid: int, data: CaseAction, conn=Depends(db), user=Depends(me)):
    r = conn.execute(select(reports).where(reports.c.id == rid).with_for_update()).mappings().first()
    if not r:
        raise HTTPException(404, "Report not found.")
    b = booking_access(conn, r["booking_id"], user, allow_admin=True)
    if data.action == "response":
        if user["id"] != counterparty(b, r["author_id"]):
            raise HTTPException(403, "Only the other participant may submit a response.")
        if r["status"] == "resolved":
            raise HTTPException(409, "The report is resolved.")
    elif not user["is_admin"]:
        raise HTTPException(403, "Admin access required.")
    if data.action in ("investigating", "resolved", "reopened"):
        allowed = {"investigating": ("open",), "resolved": ("open", "investigating"), "reopened": ("resolved",)}
        if r["status"] not in allowed[data.action]:
            raise HTTPException(409, "This report status has already changed.")
        conn.execute(update(reports).where(reports.c.id == rid).values(status="open" if data.action == "reopened" else data.action))
    note = require_text(data.text)
    eid = add_case_event(conn, rid, user["id"], data.action, note, data.action == "note")
    if data.action != "response":
        record_admin(conn, user, f"report:{rid}", data.action, note)
    if data.action != "note":
        for uid in (b["customer_id"], b["provider_id"]):
            if uid != user["id"]:
                notify(conn, uid, f"case-event:{eid}", f"Report #{rid} updated.", b["id"])
    return {"id": eid}


def read_reports(conn, stmt, user):
    rr = rows(conn, stmt.order_by(reports.c.id.desc()))
    if rr:
        by_id = {r["id"]: r for r in rr}
        for r in rr:
            r["history"] = []
        events = select(case_events).where(case_events.c.report_id.in_(by_id))
        if not user["is_admin"]:
            events = events.where(case_events.c.internal.is_(False))
        for event in rows(conn, events.order_by(case_events.c.id)):
            by_id[event["report_id"]]["history"].append(event)
    return rr


@router.get("/bookings/{bid}/activity")
def activity(bid: int, conn=Depends(db), user=Depends(me)):
    b = booking_access(conn, bid, user, allow_admin=True)
    return {"status": b["status"], "participant": user['id'] in (b['customer_id'], b['provider_id']), "reviews": rows(conn, select(reviews).where(reviews.c.booking_id == bid)),
        "reports": read_reports(conn, select(reports).where(reports.c.booking_id == bid), user)}


def record_admin(conn, user, target, action, reason):
    conn.execute(insert(audit).values(actor_id=user["id"], target=target, action=action, reason=require_text(reason)))


class CategoryChange(BaseModel):
    kind: Literal["service", "rental"]
    name: str = Field(min_length=1, max_length=80)
    enabled: bool
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/admin/categories")
def category_change(data: CategoryChange, conn=Depends(db), user=Depends(admin)):
    name = require_text(data.name)
    dialect_insert = sqlite_insert if conn.dialect.name == "sqlite" else pg_insert
    conn.execute(dialect_insert(categories).values(kind=data.kind, name=name, enabled=data.enabled)
        .on_conflict_do_update(index_elements=["kind", "name"], set_={"enabled": data.enabled}))
    record_admin(conn, user, f"{data.kind}:{name}", "enabled category" if data.enabled else "disabled category", data.reason)
    return visible_categories(conn, data.kind)


@router.get("/dashboard")
def dashboard(conn=Depends(db), user=Depends(me)):
    from backend.payments import finance_summary
    uid = user["id"]
    mine = select(bookings.c.id, bookings.c.kind, bookings.c.status, bookings.c.customer_id, bookings.c.provider_id,
        bookings.c.start_at, bookings.c.end_at, bookings.c.amount).where(or_(bookings.c.customer_id == uid, bookings.c.provider_id == uid))
    report_stmt = select(reports).join(bookings, reports.c.booking_id == bookings.c.id).where(
        or_(bookings.c.customer_id == uid, bookings.c.provider_id == uid))
    return {"bookings": rows(conn, mine.order_by(bookings.c.id.desc())), "reports": read_reports(conn, report_stmt, user),
        "finances": finance_summary(conn, provider_id=uid)}


class ListingRestriction(BaseModel):
    restricted: bool
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/admin/listings/{lid}/restriction")
def restrict_listing(lid: int, data: ListingRestriction, conn=Depends(db), user=Depends(admin)):
    from backend.rentals import listings
    item = conn.execute(select(listings).where(listings.c.id == lid).with_for_update()).mappings().first()
    if not item:
        raise HTTPException(404, "Listing not found.")
    if item["status"] == "archived" or (item["status"] == "restricted") == data.restricted:
        raise HTTPException(409, "This listing cannot make that transition.")
    status = "restricted" if data.restricted else "paused"
    conn.execute(update(listings).where(listings.c.id == lid).values(status=status))
    record_admin(conn, user, f"listing:{lid}", status, data.reason)
    notify(conn, item["owner_id"], f"moderation:{lid}:{timestamp().isoformat()}",
        f"Listing {item['title']} is now {status}. Reason: {data.reason}")
    return {"id": lid, "status": status}


@router.get("/admin/dashboard")
def admin_dashboard(conn=Depends(db), user=Depends(admin)):
    from backend.core import account_actions
    from backend.payments import exceptions, finance_summary
    from backend.rentals import listings
    inventory = rows(conn, select(listings.c.id, listings.c.title, listings.c.category, listings.c.status,
        listings.c.owner_id).order_by(listings.c.id.desc()))
    cases = read_reports(conn, select(reports), user)
    accounts = rows(conn, select(users.c.id, users.c.name, users.c.email, users.c.state, users.c.is_admin).order_by(users.c.id))
    reservations = rows(conn, select(bookings.c.id, bookings.c.kind, bookings.c.customer_id, bookings.c.provider_id,
        bookings.c.status, bookings.c.amount).order_by(bookings.c.id.desc()))
    actions = rows(conn, select(audit).order_by(audit.c.id.desc()).limit(200))
    for row in rows(conn, select(account_actions).order_by(account_actions.c.id.desc()).limit(200)):
        actions.append({"actor_id": row["actor_id"], "target": f"user:{row['user_id']}", "action": row["new_state"],
            "reason": row["reason"], "created_at": row["created_at"]})
    actions.sort(key=lambda a: a["created_at"].isoformat(), reverse=True)
    return {"counts": {"accounts": len(accounts), "listings": len(inventory), "bookings": len(reservations),
        "open_reports": sum(c["status"] != "resolved" for c in cases)}, "accounts": accounts, "listings": inventory,
        "bookings": reservations, "reports": cases, "audit": actions, "finances": finance_summary(conn),
        "exceptions": exceptions(conn), "categories": {k: visible_categories(conn, k) for k in ("rental", "service")}}


def run_jobs(conn, at=None):
    """Row locks serialize expiry against payment capture. Event keys protect retries."""
    at = at or timestamp()
    expired = rows(conn, select(bookings).where(bookings.c.hold_until <= at,
        bookings.c.status.in_(("awaiting_agreement", "awaiting_payment"))).order_by(bookings.c.id)
        .limit(200).with_for_update(skip_locked=True))
    for b in expired:
        conn.execute(update(bookings).where(bookings.c.id == b["id"]).values(status="expired"))
        for uid in (b["customer_id"], b["provider_id"]):
            notify(conn, uid, f"expired:{b['id']}", "Your unpaid reservation hold expired.", b["id"])
    due = select(bookings).where(bookings.c.kind == "rental", or_(
        and_(bookings.c.status == "confirmed", bookings.c.start_at <= at + timedelta(days=1), bookings.c.end_at > at),
        and_(bookings.c.status.in_(("active", "return_proposed")), bookings.c.end_at <= at + timedelta(days=1))))
    for b in conn.execute(due).mappings():
        if b["status"] == "confirmed":
            key, message = "pickup", "Your pickup date is approaching or has arrived."
        elif b["end_at"] <= at:
            key, message = "overdue", "The return deadline has passed. Check the return status."
        else:
            key, message = "return", "Your rental return is due within one day."
        for uid in (b["customer_id"], b["provider_id"]):
            notify(conn, uid, f"reminder:{key}:{b['id']}", message, b["id"])
    return len(expired)
