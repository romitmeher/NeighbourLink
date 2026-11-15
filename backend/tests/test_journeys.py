"""HTTP journeys with independent authenticated clients and persistent test storage."""
from datetime import datetime, timedelta
from contextlib import ExitStack
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from backend.main import app
from backend.core import db, metadata, users
from backend.rentals import IST


def test_rental_http_journey_and_private_communications(tmp_path,monkeypatch):
    monkeypatch.setenv('SESSION_SECRET','isolated-session-secret'*3)
    monkeypatch.setenv('COOKIE_SECURE','false')
    engine=create_engine('sqlite:///'+(tmp_path/'journey.sqlite').as_posix())
    metadata.create_all(engine)
    def database():
        with engine.begin() as conn: yield conn
    app.dependency_overrides[db]=database
    try:
        with ExitStack() as stack:
            owner,renter,other=[stack.enter_context(TestClient(app)) for _ in range(3)]
            for client,name in [(owner,'Owner'),(renter,'Renter'),(other,'Other')]:
                assert client.post('/api/auth/register',json={'name':name,'email':name+'@example.test','password':'test-password-123','area':'Dadar'}).status_code==201
            listing=owner.post('/api/rentals/listings',json={'title':'Camping tent','category':'Camping equipment','description':'Two person tent',
                'area':'Dadar','condition':'Good condition','daily_price':20000,'pickup_instructions':'Private lobby 42','return_instructions':'Private lobby 42'}).json()
            lid=listing['id']
            public=renter.get('/api/rentals/listings').json()[0]
            assert 'pickup_instructions' not in public
            day=datetime.now(IST).date()+timedelta(days=2)
            dates={'start':day.isoformat(),'end':(day+timedelta(days=2)).isoformat()}
            blocked=owner.post(f'/api/rentals/listings/{lid}/blackouts',json=dates)
            assert blocked.status_code==201
            block=blocked.json()['id']
            assert renter.delete(f'/api/rentals/listings/{lid}/blackouts/{block}').status_code==403
            assert renter.post(f'/api/rentals/listings/{lid}/requests',json=dates).status_code==409
            assert owner.delete(f'/api/rentals/listings/{lid}/blackouts/{block}').status_code==200
            request=renter.post(f'/api/rentals/listings/{lid}/requests',json=dates)
            assert request.status_code==201
            bid=request.json()['id']
            assert other.get(f'/api/bookings/{bid}').status_code==404
            assert owner.post(f'/api/rentals/bookings/{bid}/actions',json={'action':'accept'}).status_code==200
            agreement=renter.get(f'/api/bookings/{bid}/agreement').json()
            for client in (renter,owner):
                assert client.post(f'/api/bookings/{bid}/agreement/accept',json={'version':agreement['version'],'digest':agreement['digest'],'accept':True}).status_code==200
            assert renter.get(f'/api/bookings/{bid}').json()['status']=='awaiting_payment'
            pdf=renter.get(f'/api/bookings/{bid}/agreement.pdf')
            assert pdf.status_code==200 and pdf.content.startswith(b'%PDF')
            assert other.get(f'/api/bookings/{bid}/agreement.pdf').status_code==404
            path=f'/api/community/bookings/{bid}/messages'
            assert renter.post(path,json={'body':'Can we meet at the agreed time?'}).status_code==200
            assert owner.get(path).json()[0]['body']=='Can we meet at the agreed time?'
            assert other.get(path).status_code==404
            assert owner.post(path+'/read').status_code==200
            assert owner.get('/api/community/inbox').json()['unread_messages']==0
            assert other.get('/api/community/admin/dashboard').status_code==403
            with engine.begin() as conn:
                conn.execute(users.update().where(users.c.email=='other@example.test').values(is_admin=True))
            assert other.get('/api/community/admin/dashboard').status_code==200
            assert other.get(path).status_code==200
            assert other.post(path,json={'body':'Not a participant'}).status_code==404
            assert other.get(f'/api/community/bookings/{bid}/activity').json()['participant'] is False
            assert renter.post(f'/api/community/bookings/{bid}/reviews',json={'stars':5}).status_code==409
            assert renter.post(f'/api/rentals/bookings/{bid}/actions',json={'action':'cancel'}).status_code==200
            assert owner.get(f'/api/bookings/{bid}').json()['status']=='cancelled'
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
