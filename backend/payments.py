"""Payment orders, demo capture reconciliation and durable refund dispatch."""
import hashlib
import hmac
import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import (func, Column, DateTime, ForeignKey, Integer, String, Table,
                        UniqueConstraint, or_, select)

from backend.core import active, db, engine, me, metadata
from backend.bookings import bookings, fully_accepted

router = APIRouter()
orders = Table("payment_orders", metadata,
    Column("id", Integer, primary_key=True),
    Column("booking_id", ForeignKey("bookings.id"), unique=True, nullable=False),
    Column("gateway_order", String(64), unique=True, nullable=False),
    Column("gateway_payment", String(64), unique=True),
    Column("amount", Integer, nullable=False),
    Column("status", String(32), nullable=False),
    Column("last_check", DateTime, nullable=False),
    Column("created_at", DateTime, nullable=False))
attempts = Table("payment_attempts", metadata,
    Column("gateway_payment", String(64), primary_key=True),
    Column("order_id", ForeignKey("payment_orders.id"), nullable=False),
    Column("status", String(24), nullable=False),
    Column("created_at", DateTime, nullable=False))
refunds = Table("payment_refunds", metadata,
    Column("id", Integer, primary_key=True),
    Column("order_id", ForeignKey("payment_orders.id"), nullable=False),
    Column("request_key", String(120), nullable=False),
    Column("receipt", String(40), nullable=False, unique=True),
    Column("provider_id", String(64), unique=True),
    Column("amount", Integer, nullable=False),
    Column("reason", String(250), nullable=False),
    Column("status", String(24), nullable=False),
    Column("checked_at", DateTime, nullable=False),
    UniqueConstraint("order_id", "request_key"))
ledger = Table("payment_ledger", metadata,
    Column("id", Integer, primary_key=True),
    Column("order_id", ForeignKey("payment_orders.id"), nullable=False),
    Column("key", String(100), unique=True, nullable=False),
    Column("amount", Integer, nullable=False),
    Column("commission", Integer, nullable=False),
    Column("created_at", DateTime, nullable=False))
events = Table("payment_event_receipts", metadata,
    Column("id", String(128), primary_key=True), Column("created_at", DateTime, nullable=False))

def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

def configured():
    return (os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")
            and bool(os.getenv("RAZORPAY_KEY_SECRET")) and bool(os.getenv("RAZORPAY_WEBHOOK_SECRET")))

def demo_mode():
    return os.getenv("APP_ENV", "development") == "development"

def demo_order(order):
    return order["gateway_order"].startswith("demo_order_")

def gateway(method, path, payload=None):
    if not configured():
        raise HTTPException(503, "Payment configuration required.")
    try:
        response = httpx.request(method, "https://api.razorpay.com/v1/" + path,
            auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]),
            json=payload, timeout=10)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Gateway verification unavailable. Check payment history before retrying.")

def signed(data, secret, signature):
    digest = hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()
    return bool(re.fullmatch(r"[0-9a-f]{64}", signature)) and hmac.compare_digest(digest, signature)

def commission(amount, bps):
    return (amount * bps + 5000) // 10000

def one(conn, table, condition, lock=False):
    query = select(table).where(condition)
    if lock:
        query = query.with_for_update()
    return conn.execute(query).mappings().first()

def booking_for(conn, booking_id, user=None, lock=False):
    row = one(conn, bookings, bookings.c.id == booking_id, lock)
    if not row or (user and user["id"] not in (row["customer_id"], row["provider_id"]) and not user["is_admin"]):
        raise HTTPException(404, "Booking unavailable")
    return row

def notify_parties(conn, b, key, message):
    from backend.community import notify
    for uid in (b["customer_id"], b["provider_id"]):
        notify(conn, uid, f"payment:{b['id']}:{key}", message, b["id"])

@router.post("/bookings/{booking_id}/checkout")
def checkout(booking_id: int, user=Depends(active), conn=Depends(db)):
    b = booking_for(conn, booking_id, user, True)
    if b["customer_id"] != user["id"]:
        raise HTTPException(403, "Only the customer can check out")
    if b["status"] not in ("awaiting_payment","awaiting_agreement") or (b["hold_until"] and b["hold_until"] <= now()):
        raise HTTPException(409, "Booking is unavailable for checkout")
    if not fully_accepted(conn, booking_id):
        raise HTTPException(409, "Both parties must accept the agreement")
    if not configured():
        raise HTTPException(503, "Payment configuration required.")
    o = one(conn, orders, orders.c.booking_id == booking_id)
    if o and demo_order(o):
        raise HTTPException(409, "This booking uses demo checkout")
    if not o:
        amount = b["amount"]
        if amount < 100:
            raise HTTPException(422, "Razorpay checkout requires at least ₹1")
        entity = gateway("POST", "orders", {"amount": amount, "currency": "INR",
            "receipt": f"NL-{booking_id}-{uuid.uuid4().hex[:12]}", "notes":{"booking_id":str(booking_id)}})
        if entity.get("currency") != "INR" or entity.get("amount") != amount or not re.fullmatch(r"order_[A-Za-z0-9]+", entity.get("id","")):
            raise HTTPException(502, "Unexpected gateway order")
        conn.execute(orders.insert().values(booking_id=booking_id,gateway_order=entity["id"],
            amount=amount,status="unpaid",created_at=now(),last_check=now()))
        o = one(conn, orders, orders.c.booking_id == booking_id)
    if o["gateway_payment"]:
        raise HTTPException(409, "Payment already received")
    return {"order_id":o["gateway_order"], "amount":o["amount"],"currency":"INR",
            "key":os.environ["RAZORPAY_KEY_ID"]}

@router.post("/bookings/{booking_id}/checkout/demo")
def demo_checkout(booking_id: int, user=Depends(active), conn=Depends(db)):
    if not demo_mode():
        raise HTTPException(404, "Demo payments are unavailable")
    b = booking_for(conn, booking_id, user, True)
    if b["customer_id"] != user["id"]:
        raise HTTPException(403, "Only the customer can check out")
    o = one(conn, orders, orders.c.booking_id == booking_id, True)
    if o and not demo_order(o):
        raise HTTPException(409, "This booking already has a gateway order")
    if o and o["gateway_payment"]:
        return {"status": o["status"], "payment_id": o["gateway_payment"]}
    if b["status"] not in ("awaiting_payment", "awaiting_agreement") or (b["hold_until"] and b["hold_until"] <= now()):
        raise HTTPException(409, "Booking is unavailable for checkout")
    if not fully_accepted(conn, booking_id):
        raise HTTPException(409, "Both parties must accept the agreement")
    if not o:
        order_id = "demo_order_" + uuid.uuid4().hex[:16]
        conn.execute(orders.insert().values(booking_id=booking_id, gateway_order=order_id,
            amount=b["amount"], status="unpaid", created_at=now(), last_check=now()))
        o = one(conn, orders, orders.c.booking_id == booking_id, True)
    payment_id = "demo_pay_" + uuid.uuid4().hex[:16]
    status = apply_payment(conn, {"order_id": o["gateway_order"], "id": payment_id,
        "amount": o["amount"], "currency": "INR", "status": "captured"}, demo=True)
    return {"status": status, "payment_id": payment_id}

def request_refund(conn, booking_id, amount_paise, reason, request_key):
    if not isinstance(amount_paise, int) or amount_paise <= 0:
        raise HTTPException(422, "Refund amount must be positive")
    o = one(conn, orders, orders.c.booking_id == booking_id, True)
    if not o or not o["gateway_payment"]:
        raise HTTPException(409, "No captured payment")
    previous = one(conn, refunds, (refunds.c.order_id == o["id"]) & (refunds.c.request_key == request_key))
    if previous:
        if previous["amount"] != amount_paise:
            raise HTTPException(409, "Refund request amount changed")
        return dict(previous)
    committed = conn.execute(select(refunds.c.amount).where(refunds.c.order_id==o["id"], refunds.c.status!="failed")).scalars()
    if sum(committed) + amount_paise > o["amount"]:
        raise HTTPException(409, "Refund exceeds remaining balance")
    rid = conn.execute(refunds.insert().values(order_id=o["id"],request_key=request_key,
        amount=amount_paise,reason=reason,receipt="nl_"+uuid.uuid4().hex,
        status="queued",checked_at=now())).inserted_primary_key[0]
    return dict(one(conn,refunds,refunds.c.id==rid))

def apply_payment(conn, entity, *, demo=False):
    o = one(conn, orders, orders.c.gateway_order == entity.get("order_id"))
    if not o:
        return "unrelated"
    b = booking_for(conn, o["booking_id"], lock=True)
    o = one(conn, orders, orders.c.id == o["id"], True)
    pid = entity.get("id", "")
    pattern = r"demo_pay_[A-Za-z0-9]+" if demo else r"pay_[A-Za-z0-9]+"
    if demo != demo_order(o) or (demo and not demo_mode()) or not re.fullmatch(pattern, pid) or entity.get("amount") != o["amount"] or entity.get("currency") != "INR" or b["amount"] != o["amount"]:
        raise HTTPException(409, "Payment does not match the booking order")
    if o["gateway_payment"]:
        if pid != o["gateway_payment"] and entity.get("status")=="captured":
            raise HTTPException(409, "Conflicting captured payment; investigate in gateway")
        return o["status"]
    status = entity.get("status")
    if status not in ("failed","authorized","captured"):
        return status
    earlier = one(conn,attempts,attempts.c.gateway_payment==pid)
    if earlier is None:
        conn.execute(attempts.insert().values(gateway_payment=pid,order_id=o["id"],status=status,created_at=now()))
    elif earlier["order_id"]!=o["id"]:
        raise HTTPException(409,"Payment belongs to another order")
    else:
        conn.execute(attempts.update().where(attempts.c.gateway_payment==pid).values(status=status))
    if status != "captured":
        if status in ("failed","authorized"):
            conn.execute(orders.update().where(orders.c.id==o["id"]).values(status=status))
            if status == "failed":
                notify_parties(conn,b,pid,"Payment attempt failed. The booking remains unpaid.")
        return status
    eligible = b["status"] in ("awaiting_payment","awaiting_agreement","expired") and fully_accepted(conn,b["id"])
    if eligible and (b["status"] == "expired" or (b["hold_until"] and b["hold_until"] <= now())):
        if b["kind"] == "rental":
            from backend.rentals import can_fulfil
        else:
            from backend.services import can_fulfil
        eligible = can_fulfil(conn,b)
    state = "captured" if eligible else "refund_required"
    conn.execute(orders.update().where(orders.c.id==o["id"]).values(gateway_payment=pid,status=state))
    conn.execute(ledger.insert().values(order_id=o["id"],key=pid,amount=o["amount"],
        commission=commission(o["amount"],b["commission_bps"]),created_at=now()))
    if eligible:
        conn.execute(bookings.update().where(bookings.c.id==b["id"]).values(status="confirmed",hold_until=None))
    else:
        request_refund(conn,b["id"],o["amount"],"Booking unavailable after capture","unfulfillable")
    label = "Demo" if demo else "Test"
    notify_parties(conn,b,pid,f"{label} payment captured. Booking confirmed." if eligible else "Payment received after availability changed. Refund queued.")
    return state

class Verification(BaseModel):
    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,55}$")
    razorpay_order_id: str = Field(max_length=64)
    razorpay_signature: str = Field(max_length=128)

@router.post("/bookings/{booking_id}/checkout/verify")
def verify(booking_id:int,data:Verification,user=Depends(active),conn=Depends(db)):
    b = booking_for(conn,booking_id,user)
    if user["id"]!=b["customer_id"]:
        raise HTTPException(403,"Customer access required")
    o = one(conn,orders,orders.c.booking_id==booking_id)
    if not configured():
        raise HTTPException(503,"Payment configuration required.")
    if not o or data.razorpay_order_id!=o["gateway_order"] or not signed(
        f"{o['gateway_order']}|{data.razorpay_payment_id}".encode(),os.environ["RAZORPAY_KEY_SECRET"],data.razorpay_signature):
        raise HTTPException(400,"Invalid checkout signature")
    entity = gateway("GET","payments/"+data.razorpay_payment_id)
    if entity.get("id")!=data.razorpay_payment_id or entity.get("order_id")!=o["gateway_order"]:
        raise HTTPException(409,"Gateway payment does not match this order")
    return {"status":apply_payment(conn,entity)}

def apply_refund(conn, entity, *, demo=False):
    rid = entity.get("id","")
    pattern = r"demo_rfnd_[A-Za-z0-9]+" if demo else r"rfnd_[A-Za-z0-9]+"
    if not re.fullmatch(pattern,rid):
        raise HTTPException(400,"Invalid refund identifier")
    receipt = entity.get("receipt") or (entity.get("notes") or {}).get("local_receipt")
    r = one(conn,refunds,or_(refunds.c.provider_id==rid,refunds.c.receipt==(receipt or "")))
    if not r:
        return
    o = one(conn,orders,orders.c.id==r["order_id"])
    b = booking_for(conn,o["booking_id"],lock=True)
    o = one(conn,orders,orders.c.id==o["id"],True)
    r = one(conn,refunds,refunds.c.id==r["id"],True)
    if demo != demo_order(o) or (demo and not demo_mode()):
        raise HTTPException(409, "Refund payment mode mismatch")
    if entity.get("payment_id")!=o["gateway_payment"] or entity.get("amount")!=r["amount"] or entity.get("currency")!="INR" or r["provider_id"] not in (None,rid):
        raise HTTPException(409,"Refund details mismatch")
    if r["status"]=="processed":
        return
    state=entity.get("status")
    if state not in ("pending","processed","failed"):
        return
    conn.execute(refunds.update().where(refunds.c.id==r["id"]).values(status=state,provider_id=rid,checked_at=now()))
    if state=="processed":
        entries=conn.execute(select(ledger.c.amount,ledger.c.commission).where(ledger.c.order_id==o["id"])).all()
        retained=sum(x.amount for x in entries)-r["amount"]
        if retained<0:
            raise HTTPException(409,"Refund exceeds captured value")
        delta=commission(retained,b["commission_bps"])-sum(x.commission for x in entries)
        conn.execute(ledger.insert().values(order_id=o["id"],key=rid,amount=-r["amount"],commission=delta,created_at=now()))
        conn.execute(orders.update().where(orders.c.id==o["id"]).values(status="refunded" if retained==0 else "partially_refunded"))
    label = "Demo" if demo else "Test"
    notify_parties(conn,b,f"{rid}:{state}",f"{label} refund {state}.")

@router.post("/payments/webhook")
async def webhook(request:Request,conn=Depends(db)):
    body = await request.body()
    if not configured() or not signed(body,os.environ["RAZORPAY_WEBHOOK_SECRET"],request.headers.get("x-razorpay-signature","")):
        raise HTTPException(400,"Invalid webhook signature")
    eid=request.headers.get("x-razorpay-event-id","")
    if not eid or len(eid)>128:
        raise HTTPException(400,"Missing webhook event ID")
    # The savepoint lets a duplicate delivery finish without aborting the outer transaction.
    from sqlalchemy.exc import IntegrityError
    try:
        with conn.begin_nested():
            conn.execute(events.insert().values(id=eid,created_at=now()))
    except IntegrityError:
        return {"received":True}
    try:
        event=json.loads(body)
        kind=event["event"]
        if kind in ("payment.captured","payment.failed","payment.authorized","order.paid"):
            apply_payment(conn,event["payload"]["payment"]["entity"])
        elif kind in ("refund.created","refund.processed","refund.failed"):
            apply_refund(conn,event["payload"]["refund"]["entity"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400,"Invalid webhook event")
    return {"received":True}

def process_demo_refunds():
    """Apply local refunds atomically, with stable identifiers and no network calls."""
    if not demo_mode():
        return
    with engine.begin() as conn:
        ids = list(conn.scalars(select(refunds.c.id).join(orders).where(
            orders.c.gateway_order.startswith("demo_order_", autoescape=True),
            refunds.c.status.in_(("queued", "dispatching", "pending", "uncertain"))
        ).order_by(refunds.c.id).limit(50)))
    for local_id in ids:
        with engine.begin() as conn:
            r = one(conn, refunds, refunds.c.id == local_id)
            if not r:
                continue
            o = one(conn, orders, orders.c.id == r["order_id"])
            # apply_refund locks booking, order and refund in the capture lock order.
            apply_refund(conn, {"id": "demo_rfnd_" + str(local_id),
                "payment_id": o["gateway_payment"], "amount": r["amount"],
                "currency": "INR", "receipt": r["receipt"], "status": "processed"}, demo=True)


def process_refunds():
    """Dispatch a bounded batch. Ambiguous POST outcomes are reconciled, never blindly replayed."""
    process_demo_refunds()
    if not configured():
        return
    cutoff=now()-timedelta(seconds=60)
    with engine.begin() as conn:
        ids=conn.execute(select(refunds.c.id).join(orders).where(
            ~orders.c.gateway_order.startswith("demo_order_", autoescape=True),
            or_(refunds.c.status=="queued",(refunds.c.status.in_(["dispatching","pending","uncertain"])) & (refunds.c.checked_at<cutoff)))
            .order_by(refunds.c.checked_at).limit(10)).scalars().all()
    for local_id in ids:
        with engine.begin() as conn:
            r=one(conn,refunds,refunds.c.id==local_id,True)
            if not r or r["status"] in ("failed","processed") or (r["status"]!="queued" and r["checked_at"]>=cutoff):
                continue
            o=one(conn,orders,orders.c.id==r["order_id"])
            send=r["status"]=="queued"
            conn.execute(refunds.update().where(refunds.c.id==local_id).values(
                checked_at=now(),status="dispatching" if send else r["status"]))
        try:
            if send:
                entity=gateway("POST",f"payments/{o['gateway_payment']}/refund",
                    {"amount":r["amount"],"speed":"normal","receipt":r["receipt"],
                     "notes":{"local_receipt":r["receipt"]}})
            elif r["provider_id"]:
                entity=gateway("GET","refunds/"+r["provider_id"])
            else:
                # Reconcile a lost response using the same receipt. If no match is visible,
                # leave it for an operator (or later webhook) rather than issuing a duplicate.
                items=gateway("GET",f"payments/{o['gateway_payment']}/refunds?count=100").get("items",[])
                entity=next((x for x in items if x.get("receipt")==r["receipt"] or
                             (x.get("notes") or {}).get("local_receipt")==r["receipt"]),None)
                if not entity:
                    raise HTTPException(502,"Uncertain refund")
            with engine.begin() as conn:
                apply_refund(conn,entity)
        except HTTPException:
            with engine.begin() as conn:
                conn.execute(refunds.update().where(refunds.c.id==local_id,refunds.c.status=="dispatching").values(status="uncertain"))
    with engine.begin() as conn:
        batch=conn.execute(select(orders.c.id,orders.c.gateway_order).where(
            ~orders.c.gateway_order.startswith("demo_order_", autoescape=True),
            orders.c.gateway_payment.is_(None),orders.c.last_check<cutoff)
            .order_by(orders.c.last_check).limit(5)).all()
    for oid,order_id in batch:
        with engine.begin() as conn:
            conn.execute(orders.update().where(orders.c.id==oid).values(last_check=now()))
        try:
            rows=gateway("GET","orders/"+order_id+"/payments").get("items",[])
            for entity in sorted(rows,key=lambda x:x.get("created_at",0)):
                if entity.get("order_id")==order_id:
                    with engine.begin() as conn:
                        apply_payment(conn,entity)
        except HTTPException:
            continue

def finance_summary(conn,provider_id=None):
    query=select(func.coalesce(func.sum(bookings.c.amount),0)).select_from(bookings)
    posted=select(ledger.c.amount,ledger.c.commission).select_from(ledger.join(orders).join(bookings))
    if provider_id is not None:
        query=query.where(bookings.c.provider_id==provider_id)
        posted=posted.where(bookings.c.provider_id==provider_id)
    rows=conn.execute(posted).all()
    gross=sum(x.amount for x in rows if x.amount>0)
    refunded=-sum(x.amount for x in rows if x.amount<0)
    fee=sum(x.commission for x in rows)
    return {"booking_value":conn.scalar(query),"captured":gross,
            "refunded":refunded,"commission":fee,"earnings":gross-refunded-fee,"payout_status":"unsettled"}

def exceptions(conn):
    unpaid=conn.execute(select(orders.c.booking_id,orders.c.status).where(orders.c.status.in_(["authorized","refund_required"])))
    out=[{"booking_id":b,"reason":"Payment requires follow-up","status":s} for b,s in unpaid]
    unsettled=conn.execute(select(orders.c.booking_id,refunds.c.reason,refunds.c.status)
        .select_from(refunds.join(orders)).where(refunds.c.status.in_(["failed","uncertain","dispatching"])))
    return out+[dict(row._mapping) for row in unsettled]

@router.get("/bookings/{booking_id}/finance")
def finance(booking_id:int,user=Depends(me),conn=Depends(db)):
    b=booking_for(conn,booking_id,user)
    o=one(conn,orders,orders.c.booking_id==booking_id)
    entries=[] if not o else [dict(row) for row in conn.execute(select(ledger).where(
        ledger.c.order_id==o["id"]).order_by(ledger.c.id)).mappings()]
    refunded=-sum(x["amount"] for x in entries if x["amount"]<0)
    captured=sum(x["amount"] for x in entries if x["amount"]>0)
    fee=sum(x["commission"] for x in entries)
    history=[] if not o else [dict(row) for row in conn.execute(select(
        refunds.c.amount,refunds.c.reason,refunds.c.status,refunds.c.provider_id).where(refunds.c.order_id==o["id"])).mappings()]
    attempt_history=[] if not o else [dict(row) for row in conn.execute(select(attempts.c.status,attempts.c.created_at,
        attempts.c.gateway_payment).where(attempts.c.order_id==o["id"]).order_by(attempts.c.created_at)).mappings()]
    mode = "demo" if (demo_order(o) if o else demo_mode()) else "test"
    return {"attempts":attempt_history,"configured":demo_mode() if mode == "demo" else configured(),"mode":mode,"booking_value":b["amount"],"status":o["status"] if o else "unpaid",
        "captured":captured,"refunded":refunded,"commission":fee,"earnings":captured-refunded-fee,
        "payout_status":"unsettled","history":entries,"refunds":history}

@router.get("/bookings/{booking_id}/receipt")
def receipt(booking_id:int,user=Depends(me),conn=Depends(db)):
    from io import BytesIO
    from reportlab.pdfgen import canvas
    data=finance(booking_id,user,conn)
    if not data["captured"]:
        raise HTTPException(409,"Receipt available after verified capture")
    buffer=BytesIO()
    pdf=canvas.Canvas(buffer)
    pdf.setTitle(f"NeighbourLink payment receipt {booking_id}")
    y=765
    demo = data['mode'] == 'demo'
    for line in ["NeighbourLink | " + ("Demo payment receipt" if demo else "Test payment receipt"),f"Booking #{booking_id}",
                 "Simulation only - no money moved" if demo else "Provider test-mode transaction",
                 "Currency: INR",f"Captured: {data['captured']/100:.2f}",
                 f"Recorded refunds: {data['refunded']/100:.2f}",
                 f"Commission: {data['commission']/100:.2f}",
                 f"Earnings (unsettled): {data['earnings']/100:.2f}","Recorded transactions:"]:
        pdf.drawString(50,y,line)
        y-=23
    for entry in data["history"]:
        if y<50:
            pdf.showPage()
            y=765
        pdf.drawString(50,y,f"{entry['key']}    INR {entry['amount']/100:.2f}    {entry['created_at']} UTC")
        y-=20
    pdf.save()
    return Response(buffer.getvalue(),media_type="application/pdf",
        headers={"Content-Disposition":f'attachment; filename="receipt-{booking_id}.pdf"',"Cache-Control":"no-store"})
