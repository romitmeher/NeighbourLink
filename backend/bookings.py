"""Shared reservations and immutable, participant-specific agreements."""
import hashlib
import io
import json
import os
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import (JSON, Column, DateTime, ForeignKey, Integer, String, Table,
                        UniqueConstraint, and_, or_, select)

from backend.core import active, db, me, metadata

router = APIRouter(tags=["Bookings and agreements"])

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)
bookings = Table(
    "bookings", metadata,
    Column("id", Integer, primary_key=True),
    Column("kind", String(12), nullable=False),
    Column("customer_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("provider_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("resource_id", Integer, nullable=False, index=True),
    Column("start_at", DateTime, nullable=False),
    Column("end_at", DateTime, nullable=False),
    Column("status", String(32), nullable=False, index=True),
    Column("amount", Integer, nullable=False),
    Column("commission_bps", Integer, nullable=False,
           default=lambda: int(os.getenv("COMMISSION_BPS", "1000"))),
    Column("terms", JSON, nullable=False),
    Column("hold_until", DateTime),
    Column("created_at", DateTime, nullable=False, default=utcnow),
)
agreements = Table(
    "agreements", metadata,
    Column("id", Integer, primary_key=True),
    Column("booking_id", ForeignKey("bookings.id"), unique=True, nullable=False),
    Column("version", Integer, nullable=False),
    Column("document", JSON, nullable=False),
    Column("digest", String(64), nullable=False),
)
acceptances = Table(
    "acceptances", metadata,
    Column("id", Integer, primary_key=True),
    Column("agreement_id", ForeignKey("agreements.id"), nullable=False),
    Column("user_id", ForeignKey("users.id"), nullable=False),
    Column("version", Integer, nullable=False),
    Column("digest", String(64), nullable=False),
    Column("accepted_at", DateTime, nullable=False),
    UniqueConstraint("agreement_id", "user_id"),
)

def authorized_booking(conn, booking_id, user, lock=False):
    query = select(bookings).where(bookings.c.id == booking_id)
    row = conn.execute(query.with_for_update() if lock else query).mappings().first()
    if not row or (user["id"] not in (row["provider_id"], row["customer_id"]) and not user["is_admin"]):
        raise HTTPException(404, "Booking unavailable.")
    return row

def snapshot(conn, booking):
    prior = conn.execute(select(agreements).where(
        agreements.c.booking_id == booking["id"])).mappings().first()
    if prior:
        return prior
    if booking["status"] != "awaiting_agreement":
        raise HTTPException(409, "An accepted reservation or quote is required.")
    from backend.core import users
    parties = {role: conn.scalar(select(users.c.name).where(users.c.id == booking[key]))
               for role, key in [("Customer","customer_id"),("Owner or provider","provider_id")]}
    gross = booking["amount"]
    fee = (gross * booking["commission_bps"] + 5000) // 10000
    terms = {
        "Agreement": f"NL-{booking['id']}-v1", "Booking": booking["id"],
        "Type": booking["kind"], **parties,
        "Start (UTC)": booking["start_at"].isoformat(), "End (UTC)": booking["end_at"].isoformat(),
        "Total (INR)": f"{gross // 100}.{gross % 100:02}",
        "Commission deducted from earnings (INR)": f"{fee // 100}.{fee % 100:02}",
        "Accepted offer": booking["terms"],
        "Cancellation and reporting": "Request cancellation before pickup or work begins. Report issues in the booking workspace. After handover or work starts, the parties may request review.",
        "Platform role": "NeighbourLink records the booking and facilitates test payments. The parties are responsible for fulfilment. The platform offers no insurance, compensation or return guarantee.",
        "Template notice": "College project template requiring legal review before commercial use. Acceptance is recorded against your account.",
    }
    if booking["kind"] == "rental":
        terms["Rental responsibilities"] = "No security deposit. Use the item within the listed restrictions, record condition at pickup and return all listed accessories at the agreed time."
    else:
        terms["Scope of work"] = "Only the accepted scope and charges are authorised. The provider proposes completion and the customer confirms or reports an issue. Additional work requires separate approval."
    digest = hashlib.sha256(json.dumps(terms, sort_keys=True, ensure_ascii=False,
                                       separators=(",", ":")).encode()).hexdigest()
    key = conn.execute(agreements.insert().values(booking_id=booking["id"], version=1,
                       document=terms, digest=digest)).inserted_primary_key[0]
    return conn.execute(select(agreements).where(agreements.c.id == key)).mappings().one()

def records(conn, agreement):
    return [dict(row) for row in conn.execute(select(acceptances.c.user_id, acceptances.c.accepted_at,
        acceptances.c.version, acceptances.c.digest).where(and_(
            acceptances.c.agreement_id == agreement["id"], acceptances.c.version == agreement["version"],
            acceptances.c.digest == agreement["digest"]))).mappings()]

def fully_accepted(conn, booking_id):
    row = conn.execute(select(agreements).where(agreements.c.booking_id == booking_id)).mappings().first()
    if not row:
        return False
    booking = conn.execute(select(bookings.c.customer_id, bookings.c.provider_id).where(
        bookings.c.id == booking_id)).one()
    return {x["user_id"] for x in records(conn, row)} == set(booking)

@router.get("/bookings")
def my_bookings(conn=Depends(db), user=Depends(me)):
    return [dict(r) for r in conn.execute(select(bookings).where(or_(bookings.c.customer_id == user["id"],
        bookings.c.provider_id == user["id"])).order_by(bookings.c.id.desc())).mappings()]

@router.get("/bookings/{booking_id}")
def detail(booking_id: int, conn=Depends(db), user=Depends(me)):
    return dict(authorized_booking(conn, booking_id, user))

@router.get("/bookings/{booking_id}/agreement")
def preview(booking_id: int, conn=Depends(db), user=Depends(me)):
    data = snapshot(conn, authorized_booking(conn, booking_id, user, True))
    return {**dict(data), "acceptances": records(conn, data)}

class Acceptance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    digest: str
    accept: bool

@router.post("/bookings/{booking_id}/agreement/accept")
def accept(booking_id: int, body: Acceptance, conn=Depends(db), user=Depends(active)):
    booking = authorized_booking(conn, booking_id, user, True)
    if user["id"] not in (booking["customer_id"], booking["provider_id"]):
        raise HTTPException(403, "Only the two parties can accept.")
    agreement = snapshot(conn, booking)
    if not body.accept or (body.version, body.digest) != (agreement["version"], agreement["digest"]):
        raise HTTPException(409, "Review and accept the current agreement.")
    if any(row["user_id"] == user["id"] for row in records(conn, agreement)):
        return {"accepted": True, "fully_accepted": fully_accepted(conn, booking_id)}
    if booking["status"] not in ("awaiting_agreement","awaiting_payment") or (
            booking["hold_until"] and booking["hold_until"] <= utcnow()):
        raise HTTPException(409, "This reservation is no longer open for acceptance.")
    conn.execute(acceptances.insert().values(user_id=user["id"], agreement_id=agreement["id"],
        version=body.version, digest=body.digest, accepted_at=utcnow()))
    complete = fully_accepted(conn, booking_id)
    if complete:
        conn.execute(bookings.update().where(bookings.c.id == booking_id).values(status="awaiting_payment"))
    from backend.community import notify
    other = booking["customer_id"] if user["id"] == booking["provider_id"] else booking["provider_id"]
    notify(conn, other, f"accept:{booking_id}:{user['id']}", "The other party accepted the agreement.", booking_id)
    return {"accepted": True, "fully_accepted": complete}

def agreement_lines(value, prefix=""):
    for key, content in value.items():
        label = str(key).replace("_", " ")
        if isinstance(content, dict):
            yield from agreement_lines(content, prefix + label + " / ")
        else:
            display = ", ".join(map(str,content)) if isinstance(content,list) else str(content)
            yield (prefix + label, display)

def make_pdf(agreement, accepted):
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    target = io.BytesIO()
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(target, pagesize=A4, title="NeighbourLink booking agreement")
    story = [Paragraph("NeighbourLink booking agreement",styles["Title"])]
    for name, value in agreement_lines(agreement["document"]):
        story.extend([Paragraph(escape(name),styles["Heading3"]), Paragraph(escape(value),styles["BodyText"])])
    story.extend([Spacer(1,12),Paragraph("Account acceptance records",styles["Heading2"])])
    for row in accepted:
        story.append(Paragraph(f"Account {row['user_id']} accepted version {row['version']} on {row['accepted_at']} UTC.",styles["BodyText"]))
    story.append(Paragraph("Content SHA-256: " + agreement["digest"],styles["BodyText"]))
    doc.build(story)
    return target.getvalue()

@router.get("/bookings/{booking_id}/agreement.pdf")
def pdf(booking_id: int, conn=Depends(db), user=Depends(me)):
    agreement = snapshot(conn, authorized_booking(conn, booking_id, user, True))
    return Response(make_pdf(agreement, records(conn,agreement)), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="NeighbourLink-{booking_id}.pdf"'})

