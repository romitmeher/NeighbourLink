"""Gateway fixtures validate business rules; they never establish actual provider connectivity."""
import asyncio
import hashlib
import hmac
import json
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from starlette.requests import Request
from backend import bookings as bmod, community, payments as p
from backend.core import metadata, users


@pytest.fixture
def scenario(monkeypatch):
    engine=create_engine("sqlite://")
    metadata.create_all(engine)
    monkeypatch.setattr(p,"engine",engine)
    for key,value in [("RAZORPAY_KEY_ID","rzp_test_fixture"),("RAZORPAY_KEY_SECRET","fixture"),
                      ("RAZORPAY_WEBHOOK_SECRET","fixture-webhook")]:
        monkeypatch.setenv(key,value)
    with engine.begin() as c:
        for i in (1,2,3):
            c.execute(users.insert().values(id=i,name="Fixture",email=f"fixture{i}@example.invalid",password_hash="test"))
        c.execute(p.bookings.insert().values(id=1,kind="rental",customer_id=1,provider_id=2,resource_id=5,
            start_at=p.now()+timedelta(days=1),end_at=p.now()+timedelta(days=2),amount=10003,
            status="awaiting_agreement",commission_bps=1000,terms={},hold_until=p.now()+timedelta(minutes=10)))
        rec=bmod.snapshot(c,p.booking_for(c,1))
        body=bmod.Acceptance(version=rec["version"],digest=rec["digest"],accept=True)
        for uid in (1,2):
            bmod.accept(1,body,c,{"id":uid,"is_admin":False})
    return engine


def make_order(c,monkeypatch):
    monkeypatch.setattr(p,"gateway",lambda *args:{"id":"order_test1","amount":10003,"currency":"INR"})
    return p.checkout(1,{"id":1,"is_admin":False},c)


def payment(status="captured",**kwargs):
    return {"id":"pay_test1","order_id":"order_test1","amount":10003,"currency":"INR","status":status,**kwargs}


def test_order_is_reused_and_participant_limited(scenario,monkeypatch):
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        monkeypatch.setattr(p,"gateway",lambda *args:pytest.fail("duplicate gateway order"))
        assert p.checkout(1,{"id":1,"is_admin":False},c)["order_id"]=="order_test1"
        with pytest.raises(HTTPException,match="403"):
            p.checkout(1,{"id":2,"is_admin":False},c)
        with pytest.raises(HTTPException,match="404"):
            p.finance(1,{"id":3,"is_admin":False},c)


def test_configuration_and_acceptances(scenario,monkeypatch):
    with scenario.begin() as c:
        monkeypatch.setenv("RAZORPAY_KEY_ID","rzp_live_rejected")
        with pytest.raises(HTTPException,match="Payment configuration required"):
            p.checkout(1,{"id":1,"is_admin":False},c)
        c.execute(bmod.acceptances.delete())
        with pytest.raises(HTTPException,match="Both parties"):
            p.checkout(1,{"id":1,"is_admin":False},c)


def test_mismatch_bad_signature_and_uncaptured(scenario,monkeypatch):
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        v=p.Verification(razorpay_order_id="order_test1",razorpay_payment_id="pay_test1",razorpay_signature="fake")
        with pytest.raises(HTTPException,match="Invalid checkout signature"):
            p.verify(1,v,{"id":1,"is_admin":False},c)
        for data in (payment(amount=3),payment(currency="USD")):
            with pytest.raises(HTTPException,match="does not match"):
                p.apply_payment(c,data)
        p.apply_payment(c,payment("failed"))
        p.apply_payment(c,payment("authorized"))
        assert p.booking_for(c,1)["status"]=="awaiting_payment"
        assert p.finance_summary(c)["captured"]==0


def test_capture_and_partial_full_refund_reconcile(scenario,monkeypatch):
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        for _ in range(2):
            p.apply_payment(c,payment())
        for idx,amount in enumerate([3333,6670]):
            key=f"part{idx}"
            r=p.request_refund(c,1,amount,"test",key)
            assert p.request_refund(c,1,amount,"test",key)["id"]==r["id"]
            with pytest.raises(HTTPException,match="exceeds"):
                p.request_refund(c,1,10003,"test","too-large")
            entity={"id":f"rfnd_test{idx}","payment_id":"pay_test1","amount":amount,"currency":"INR",
                    "receipt":r["receipt"],"status":"processed"}
            p.apply_refund(c,entity)
            p.apply_refund(c,entity)
            if idx==0:
                assert p.finance_summary(c)["commission"]==667
        assert p.finance_summary(c)=={"booking_value":10003,"captured":10003,"refunded":10003,
                                    "commission":0,"earnings":0,"payout_status":"unsettled"}
        assert p.receipt(1,{"id":1,"is_admin":False},c).body.startswith(b"%PDF-")


@pytest.mark.parametrize("available",[True,False])
def test_late_capture_rechecks_and_refunds_conflict(scenario,monkeypatch,available):
    from backend import rentals
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        c.execute(p.bookings.update().values(status="expired",hold_until=p.now()-timedelta(minutes=2)))
        monkeypatch.setattr(rentals,"can_fulfil",lambda conn,b:available)
        p.apply_payment(c,payment())
        assert p.booking_for(c,1)["status"]==("confirmed" if available else "expired")
        assert len(c.execute(select(p.refunds)).all())==int(not available)


def test_webhook_raw_body_signature_and_duplicate(scenario,monkeypatch):
    body=json.dumps({"event":"payment.captured","payload":{"payment":{"entity":payment()}}}).encode()
    def req(sig):
        async def receive():
            return {"type":"http.request","body":body,"more_body":False}
        return Request({"type":"http","headers":[(b"x-razorpay-event-id",b"fixture-evt"),
            (b"x-razorpay-signature",sig.encode())]},receive)
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        with pytest.raises(HTTPException,match="Invalid webhook signature"):
            asyncio.run(p.webhook(req("invalid"),c))
        sig=hmac.new(b"fixture-webhook",body,hashlib.sha256).hexdigest()
        for _ in range(2):
            asyncio.run(p.webhook(req(sig),c))
        assert len(c.execute(select(p.events)).all())==1
        assert len(c.execute(select(p.ledger)).all())==1


def test_ambiguous_refund_is_not_reissued(scenario,monkeypatch):
    with scenario.begin() as c:
        make_order(c,monkeypatch)
        p.apply_payment(c,payment())
        request=p.request_refund(c,1,10003,"cancel","cancel1")
    calls=[]
    def test_gateway(method,path,payload=None):
        calls.append(method)
        if method=="POST":
            raise HTTPException(502,"lost response")
        return {"items":[{"id":"rfnd_recovered1","amount":10003,"currency":"INR","payment_id":"pay_test1",
                         "receipt":request["receipt"],"status":"processed"}]}
    monkeypatch.setattr(p,"gateway",test_gateway)
    p.process_refunds()
    with scenario.begin() as c:
        assert c.scalar(select(p.refunds.c.status))=="uncertain"
        c.execute(p.refunds.update().values(checked_at=p.now()-timedelta(minutes=10)))
    p.process_refunds()
    assert calls==["POST","GET"]
    with scenario.begin() as c:
        assert p.finance_summary(c)["refunded"]==10003


@pytest.mark.parametrize('credentials_present', [False, True])
def test_demo_checkout_and_partial_full_refunds_stay_local(scenario, monkeypatch, credentials_present):
    monkeypatch.setenv('APP_ENV', 'development')
    if not credentials_present:
        for name in ('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'):
            monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(p, 'gateway', lambda *args: pytest.fail('Demo flow called external gateway'))
    customer = {'id': 1, 'is_admin': False}
    with scenario.begin() as conn:
        result = p.demo_checkout(1, customer, conn)
        assert result['status'] == 'captured'
        assert result['payment_id'].startswith('demo_pay_')
        assert p.booking_for(conn, 1)['status'] == 'confirmed'
        assert p.demo_checkout(1, customer, conn) == result
        assert len(conn.execute(select(p.ledger)).all()) == 1
        assert p.finance(1, customer, conn)['mode'] == 'demo'
        assert p.receipt(1, customer, conn).body.startswith(b'%PDF-')
        first = p.request_refund(conn, 1, 3333, 'Unused hours', 'partial')
        assert first['status'] == 'queued'
    p.process_refunds()
    p.process_refunds()
    with scenario.begin() as conn:
        data = p.finance(1, customer, conn)
        assert (data['refunded'], data['commission'], data['earnings']) == (3333, 667, 6003)
        assert data['refunds'][0]['status'] == 'processed'
        assert data['refunds'][0]['provider_id'].startswith('demo_rfnd_')
        assert p.request_refund(conn, 1, 3333, 'Unused hours', 'partial')['id'] == first['id']
        p.request_refund(conn, 1, 6670, 'Remaining balance', 'remainder')
        with pytest.raises(HTTPException, match='exceeds'):
            p.request_refund(conn, 1, 1, 'Over refund', 'overflow')
    p.process_refunds()
    p.process_refunds()
    with scenario.begin() as conn:
        data = p.finance(1, customer, conn)
        assert (data['status'], data['refunded'], data['commission'], data['earnings']) == ('refunded', 10003, 0, 0)
        assert len(conn.execute(select(p.ledger)).all()) == 3
        assert p.demo_checkout(1, customer, conn)['status'] == 'refunded'


def test_demo_checkout_requires_parties_agreement_and_open_hold(scenario, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'development')
    with scenario.begin() as conn:
        for uid, code in ((2, '403'), (3, '404')):
            with pytest.raises(HTTPException, match=code):
                p.demo_checkout(1, {'id': uid, 'is_admin': False}, conn)
        conn.execute(p.bookings.update().values(hold_until=p.now()-timedelta(seconds=1)))
        with pytest.raises(HTTPException, match='unavailable'):
            p.demo_checkout(1, {'id': 1, 'is_admin': False}, conn)
        conn.execute(p.bookings.update().values(hold_until=p.now()+timedelta(minutes=10)))
        conn.execute(bmod.acceptances.delete())
        with pytest.raises(HTTPException, match='Both parties'):
            p.demo_checkout(1, {'id': 1, 'is_admin': False}, conn)
        assert not conn.execute(select(p.ledger)).all()


def test_demo_checkout_disabled_outside_development(scenario, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    with scenario.begin() as conn:
        with pytest.raises(HTTPException, match='404'):
            p.demo_checkout(1, {'id': 1, 'is_admin': False}, conn)


def test_demo_cannot_capture_gateway_order(scenario, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'development')
    with scenario.begin() as conn:
        make_order(conn, monkeypatch)
        with pytest.raises(HTTPException, match='gateway order'):
            p.demo_checkout(1, {'id': 1, 'is_admin': False}, conn)
        with pytest.raises(HTTPException, match='does not match'):
            p.apply_payment(conn, payment(id='demo_pay_invalid'), demo=True)
        assert p.finance_summary(conn)['captured'] == 0


def test_gateway_events_cannot_capture_or_refund_demo_order(scenario, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'development')
    with scenario.begin() as conn:
        p.demo_checkout(1, {'id': 1, 'is_admin': False}, conn)
        order = conn.execute(select(p.orders)).mappings().one()
        with pytest.raises(HTTPException, match='does not match'):
            p.apply_payment(conn, payment(order_id=order['gateway_order']))
        refund = p.request_refund(conn, 1, 10003, 'Cancelled', 'cancel')
        with pytest.raises(HTTPException, match='mode mismatch'):
            p.apply_refund(conn, {'id': 'rfnd_external', 'receipt': refund['receipt']})
        assert p.finance_summary(conn)['refunded'] == 0


def test_unpaid_demo_orders_are_never_polled_at_gateway(scenario, monkeypatch):
    monkeypatch.setenv('APP_ENV', 'development')
    with scenario.begin() as conn:
        conn.execute(p.orders.insert().values(booking_id=1, gateway_order='demo_order_pending', amount=10003,
            status='unpaid', created_at=p.now(), last_check=p.now()-timedelta(minutes=5)))
        with pytest.raises(HTTPException, match='demo checkout'):
            p.checkout(1, {'id': 1, 'is_admin': False}, conn)
    monkeypatch.setattr(p, 'gateway', lambda *args: pytest.fail('Demo order polled at external gateway'))
    p.process_refunds()
