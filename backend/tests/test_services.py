"""Service booking journeys use an isolated database, never the live demo data."""
from datetime import timedelta, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from backend import services as s, bookings as b, community as c
from backend.core import metadata, users


@pytest.fixture
def market():
    engine=create_engine('sqlite://')
    metadata.create_all(engine)
    with engine.begin() as conn:
        people=[]
        for name in ('Customer','Helper','Other'):
            people.append(dict(conn.execute(users.insert().values(name=name,email=name+'@example.test',password_hash='fixture').returning(users)).mappings().one()))
        for person in people[1:]:
            s.save_provider(s.Provider(adult_declared=True,bio='Packing and organising',categories=['Packing'],
                offerings=['everyday'],experience='Self-declared',area='Dadar',availability='Weekdays',basis='hourly',rate=60000),conn,person)
        yield conn,people
    engine.dispose()


def task(conn,customer,target=None):
    return s.post_request(s.Task(title='Pack books',description='Pack three shelves',category='Packing',area='Dadar',
        preferred_schedule='Tomorrow',materials='Customer supplies boxes',target_provider_id=target),conn,customer)['id']


def offer(basis='fixed',offset=1):
    start=(s.utcnow()+timedelta(days=offset)).replace(tzinfo=timezone.utc)
    return s.Offer(basis=basis,rate=60000,max_minutes=120,travel=5000,start_at=start,end_at=start+timedelta(hours=2),
        expires_at=start-timedelta(hours=1),scope='Pack the books',exclusions='No transport',materials='Customer supplies boxes')


def booked(conn,people,basis='fixed'):
    customer,helper,_=people
    rid=task(conn,customer)
    oid=s.quote(rid,offer(basis),conn,helper)['id']
    bid=s.accept_offer(rid,oid,conn,customer)['booking_id']
    return rid,oid,bid


def test_quotes_agreements_and_privacy(market):
    conn,people=market; customer,helper,other=people
    rid=task(conn,customer,helper['id'])
    with pytest.raises(HTTPException): s.quote(rid,offer(),conn,other)
    with pytest.raises(HTTPException): s.quote(rid,offer(),conn,customer)
    oid=s.quote(rid,offer(),conn,helper)['id']
    with pytest.raises(HTTPException): s.accept_offer(rid,oid,conn,helper)
    bid=s.accept_offer(rid,oid,conn,customer)['booking_id']
    assert s.accept_offer(rid,oid,conn,customer)['booking_id']==bid
    original=b.preview(bid,conn,customer)
    with pytest.raises(HTTPException): s.quote(rid,offer(),conn,helper)
    with pytest.raises(HTTPException): b.preview(bid,conn,other)
    body=b.Acceptance(version=1,digest=original['digest'],accept=True)
    assert not b.accept(bid,body,conn,customer)['fully_accepted']
    assert b.accept(bid,body,conn,helper)['fully_accepted']
    assert b.pdf(bid,conn,customer).body.startswith(b'%PDF')
    assert b.detail(bid,conn,customer)['status']=='awaiting_payment'
    with pytest.raises(HTTPException): s.start_work(bid,conn,helper)

def test_custom_request_accepts_provider_quote(market):
    conn, people = market
    customer, helper, _ = people
    rid = s.post_request(s.Task(
        title='Repair a folding display stand',
        description='The hinge is loose and needs inspection and repair.',
        category=s.CUSTOM_CATEGORY,
        area='Dadar',
        preferred_schedule='Saturday afternoon',
        materials='Provider to advise',
        target_provider_id=None,
    ), conn, customer)['id']
    assert s.quote(rid, offer(), conn, helper)['request_id'] == rid

def test_cancellation_and_post_start_review(market,monkeypatch):
    conn,people=market; customer,helper,other=people
    _,_,bid=booked(conn,people)
    with pytest.raises(HTTPException): s.cancel_service(bid,s.Dispute(reason='Cancel please'),conn,other)
    assert s.cancel_service(bid,s.Dispute(reason='Plans changed'),conn,customer)['status']=='cancelled'
    assert s.cancel_service(bid,s.Dispute(reason='Plans changed'),conn,customer)['status']=='cancelled'
    _,_,second=booked(conn,people)
    conn.execute(b.bookings.update().where(b.bookings.c.id==second).values(status='in_progress'))
    assert s.cancel_service(second,s.Dispute(reason='Please review this work'),conn,customer)['status']=='disputed'
    assert conn.scalar(select(c.reports.c.id).where(c.reports.c.booking_id==second))


def test_hourly_cap_and_refund(market,monkeypatch):
    conn,people=market; customer,helper,_=people
    _,_,bid=booked(conn,people,'hourly')
    # Payment confirmation is an isolated fixture; actual gateway testing is separate.
    conn.execute(b.bookings.update().where(b.bookings.c.id==bid).values(status='confirmed',start_at=s.utcnow()-timedelta(minutes=1)))
    with pytest.raises(HTTPException): s.start_work(bid,conn,customer)
    s.start_work(bid,conn,helper)
    with pytest.raises(HTTPException): s.propose(bid,s.Completion(note='Finished',minutes=121),conn,helper)
    s.propose(bid,s.Completion(note='Finished',minutes=60),conn,helper)
    refunds=[]
    monkeypatch.setattr('backend.payments.request_refund',lambda *args: refunds.append(args))
    assert s.confirm(bid,conn,customer)['status']=='completed'
    assert refunds[0][2]==60000
    with pytest.raises(HTTPException): s.confirm(bid,conn,customer)
    c.review(bid,c.Review(stars=5,comment='Clear communication'),conn,customer)
    with pytest.raises(HTTPException): c.review(bid,c.Review(stars=4),conn,customer)
    assert c.ratings(helper['id'],conn)['service']['count']==1
    assert c.ratings(helper['id'],conn)['rental']['count']==0


def test_inspection_requires_separate_booking(market):
    conn,people=market; customer,helper,_=people
    _,_,bid=booked(conn,people,'inspection')
    with pytest.raises(HTTPException): s.follow_up(bid,offer(),conn,helper)
    conn.execute(b.bookings.update().where(b.bookings.c.id==bid).values(status='completed'))
    follow=s.follow_up(bid,offer(offset=3),conn,helper)
    next_bid=s.accept_offer(follow['request_id'],follow['id'],conn,customer)['booking_id']
    next_booking=b.detail(next_bid,conn,customer)
    assert next_booking['status']=='awaiting_agreement'
    assert next_booking['terms']['parent_booking_id']==bid
    assert not b.fully_accepted(conn,next_bid)
    with pytest.raises(HTTPException): s.follow_up(bid,offer(offset=4),conn,helper)


def test_paid_cancellation_queues_one_full_refund(market,monkeypatch):
    conn,people=market
    _,_,bid=booked(conn,people)
    conn.execute(b.bookings.update().where(b.bookings.c.id==bid).values(status='confirmed'))
    refunds=[]
    monkeypatch.setattr('backend.payments.request_refund',lambda *args:refunds.append(args))
    form=s.Dispute(reason='Provider unavailable')
    assert s.cancel_service(bid,form,conn,people[1])['status']=='cancelled'
    assert s.cancel_service(bid,form,conn,people[1])['status']=='cancelled'
    assert len(refunds)==1 and refunds[0][2]==65000


def test_postgres_competing_service_quotes():
    import os, uuid
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    url=os.getenv('TEST_POSTGRES_URL')
    if not url: pytest.skip('TEST_POSTGRES_URL required for real concurrent transactions')
    schema='services_test_'+uuid.uuid4().hex
    control=create_engine(url)
    with control.begin() as conn: conn.exec_driver_sql('CREATE SCHEMA '+schema)
    engine=create_engine(url,connect_args={'options':'-csearch_path='+schema})
    try:
        metadata.create_all(engine)
        with engine.begin() as conn:
            people=[]
            for name in ('Customer','Helper','Other'):
                people.append(dict(conn.execute(users.insert().values(name=name,email=name+'@example.test',password_hash='fixture').returning(users)).mappings().one()))
            for person in people[1:]:
                s.save_provider(s.Provider(adult_declared=True,bio='Packing help',categories=['Packing'],offerings=['everyday'],experience='Demo',area='Dadar',availability='Weekdays',basis='fixed',rate=60000),conn,person)
            rid=task(conn,people[0])
            offers=[s.quote(rid,offer(),conn,person)['id'] for person in people[1:]]
        barrier=Barrier(2)
        def accept(oid):
            try:
                with engine.begin() as conn:
                    barrier.wait(timeout=10)
                    s.accept_offer(rid,oid,conn,people[0])
                return 200
            except HTTPException as exc: return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(accept,offers))==[200,409]
        with engine.connect() as conn:
            assert len(conn.execute(select(b.bookings)).all())==1
    finally:
        engine.dispose()
        with control.begin() as conn: conn.exec_driver_sql('DROP SCHEMA '+schema+' CASCADE')
        control.dispose()
