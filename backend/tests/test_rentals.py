"""Run from project root: python -m pytest backend/tests/test_rentals.py.

NeighbourLink uses PostgreSQL in production. Set TEST_POSTGRES_URL to a test DB
with schema creation rights to run the independent-connection race test.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier

import pytest
import sqlalchemy as sa
from fastapi import HTTPException

from backend import community, rentals as r
from backend.core import metadata, uploads, users
from backend.bookings import bookings


def setup_market(c):
    people = []
    for name in ("Owner","Renter","Neighbour"):
        user = c.execute(users.insert().values(name=name,email=name.lower()+"@example.test",password_hash="fixture")
                         .returning(*users.c)).mappings().one()
        people.append(dict(user))
    item = r.Listing(title="Camping tent",category="Camping equipment",description="Sleeps two",
                     area="Dadar",daily_price=25000,condition="Light wear",defects="Faded label",
                     accessories="Six pegs",pickup_instructions="Private door A",return_instructions="Private door B")
    listing = r.publish(item,c,people[0])
    return people, item, listing


@pytest.fixture
def market(tmp_path):
    engine=sa.create_engine("sqlite:///"+str(tmp_path/"rentals.sqlite"))
    metadata.create_all(engine)
    try:
        with engine.begin() as c:
            people,item,listing=setup_market(c)
            yield c,people,item,listing
    finally:
        engine.dispose()


def dates(a=0,b=2):
    today=datetime.now(r.IST).date()
    return r.Dates(start=today+timedelta(days=a),end=today+timedelta(days=b))


def discover(c, **kw):
    opts=dict(q="",category="",area="",max_price=None,start=None,end=None)
    opts.update(kw)
    return r.discover(c=c,**opts)


def act(c,user,booking,action,**extra):
    return r.act(booking,r.Action(action=action,**extra),c,user)


def denied(code, fn, *args):
    with pytest.raises(HTTPException) as caught:
        fn(*args)
    assert caught.value.status_code==code


def test_search_privacy_permissions_and_archival(market):
    c,(owner,renter,third),item,listing=market
    result,=discover(c,q="amp",category="Camping equipment",area="dad",max_price=25000)
    assert result["id"]==listing["id"]
    assert {"serial","pickup_instructions","return_instructions"}.isdisjoint(result)
    assert discover(c,max_price=24999)==[]
    i=listing["id"]
    denied(403,r.edit,i,item,c,renter)
    denied(422,r.request,i,dates(),c,owner)
    denied(422,r.request,i,dates(1,1),c,renter)
    b=r.request(i,dates(),c,renter)["id"]
    denied(404,r.details,b,c,third)
    assert "pickup_instructions" not in r.details(b,c,renter)["terms"]
    denied(409,act,c,renter,b,"accept")
    act(c,owner,b,"accept")
    r.edit(i,item.model_copy(update={"daily_price":80000,"status":"archived"}),c,owner)
    assert discover(c)==[]
    details=r.details(b,c,renter)
    assert details["amount"]==50000 and details["terms"]["pickup_instructions"]=="Private door A"


def test_half_open_dates_and_expired_hold(market):
    c,(owner,renter,third),_,listing=market
    i=listing["id"]
    r.blackout(i,dates(4,6),c,owner)
    denied(409,r.request,i,dates(3,5),c,renter)
    first=r.request(i,dates(0,2),c,renter)["id"]
    second=r.request(i,dates(1,3),c,third)["id"]
    adjacent=r.request(i,dates(2,4),c,renter)["id"]
    act(c,owner,first,"accept")
    denied(409,act,c,owner,second,"accept")
    act(c,owner,adjacent,"accept")
    assert discover(c,start=dates().start,end=dates().end)==[]
    c.execute(bookings.update().where(bookings.c.id==first).values(hold_until=r.now()-timedelta(seconds=1)))
    assert r.details(first,c,renter)["status"]=="expired"
    assert discover(c,start=dates().start,end=dates().end)
    denied(409,act,c,renter,first,"pickup")


def test_pickup_return_requires_both_parties(market):
    c,(owner,renter,third),_,listing=market
    b=r.request(listing["id"],dates(),c,renter)["id"]
    denied(409,act,c,renter,b,"pickup")
    act(c,owner,b,"accept")
    # Isolate the handover state machine. This fixture is not a gateway transaction.
    c.execute(bookings.update().where(bookings.c.id==b).values(status="confirmed",hold_until=None))
    assert act(c,owner,b,"pickup")["status"]=="confirmed"
    assert act(c,owner,b,"pickup")["status"]=="confirmed"
    foreign_photo=c.scalar(uploads.insert().values(owner_id=third["id"],public=False,booking_id=b,
                 storage_name="fixture.jpg",mime_type="image/jpeg").returning(uploads.c.id))
    with pytest.raises(HTTPException):
        act(c,renter,b,"pickup",photos=[foreign_photo])
    assert act(c,renter,b,"pickup",accessories="Six pegs")["status"]=="active"
    denied(409,act,c,owner,b,"return")
    assert act(c,renter,b,"return")["status"]=="return_proposed"
    denied(409,act,c,renter,b,"receive")
    assert act(c,owner,b,"receive")["status"]=="completed"
    denied(409,act,c,owner,b,"pickup")
    assert c.scalar(sa.select(sa.func.count()).select_from(community.notifications))==6


def test_disputed_return_preserves_records(market):
    c,(owner,renter,_),_,listing=market
    b=r.request(listing["id"],dates(),c,renter)["id"]
    c.execute(bookings.update().where(bookings.c.id==b).values(status="return_proposed"))
    case=act(c,owner,b,"issue",note="One peg missing")
    assert case["status"]=="disputed" and case["activity"][-1]["note"]=="One peg missing"
    denied(409,act,c,owner,b,"receive")


def test_concurrent_acceptances_postgres():
    url=os.getenv("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL required for the PostgreSQL row-lock test")
    schema="rentals_test_"+uuid.uuid4().hex
    control=sa.create_engine(url)
    with control.begin() as c:
        c.exec_driver_sql("CREATE SCHEMA "+schema)
    engine=sa.create_engine(url,connect_args={"options":"-csearch_path="+schema})
    try:
        metadata.create_all(engine)
        with engine.begin() as c:
            (owner,renter,third),_,listing=setup_market(c)
            ids=[r.request(listing["id"],dates(),c,user)["id"] for user in (renter,third)]
        barrier=Barrier(2)
        def accept(id_):
            try:
                with engine.begin() as c:
                    barrier.wait(timeout=10)
                    act(c,owner,id_,"accept")
                return 200
            except HTTPException as exc:
                return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(accept,ids))==[200,409]
    finally:
        engine.dispose()
        with control.begin() as c:
            c.exec_driver_sql("DROP SCHEMA "+schema+" CASCADE")
        control.dispose()
