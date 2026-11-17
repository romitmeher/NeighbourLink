"""Integration tests through FastAPI with independent browser cookie jars and disk files."""
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select, update

from backend import auth
from backend.core import account_actions, db, metadata, users
from backend.credentials import verify_password

@pytest.fixture()
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret" * 3)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "files"))
    uri = "sqlite:///" + (tmp_path / "test.sqlite").as_posix()
    engine = create_engine(uri)
    metadata.create_all(engine)
    app = FastAPI()
    app.include_router(auth.router, prefix="/api")
    def local_db():
        with engine.begin() as conn:
            yield conn
    app.dependency_overrides[db] = local_db
    yield app, engine
    engine.dispose()

def register(client,email="a@example.test"):
    return client.post("/api/auth/register", json={"email":email,"name":"Test","password":"long test password","area":"Thane"})

def test_policy_acceptance_persists(setup):
    app, engine = setup
    with TestClient(app) as client:
        assert register(client).json()['policy_required'] is True
        assert client.post('/api/auth/accept-policy', json={'version': 'wrong', 'accept': True}).status_code == 422
        assert client.post('/api/auth/accept-policy', json={'version': 'draft-2026-11-17', 'accept': False}).status_code == 422
        result = client.post('/api/auth/accept-policy', json={'version': 'draft-2026-11-17', 'accept': True})
        assert result.status_code == 200
        engine.dispose()
        account = client.get('/api/auth/me').json()
        assert account['policy_required'] is False
        assert account['policy_version'] == 'draft-2026-11-17'
        assert account['policy_accepted_at']

def test_accounts(setup):
    app, engine = setup
    with TestClient(app) as a, TestClient(app) as b:
        assert a.get("/api/auth/me").status_code == 401
        registered = register(a)
        assert registered.status_code == 201, registered.text
        assert register(b).status_code == 409
        assert register(b, "b@example.test").status_code == 201
        assert a.patch("/api/profile",json={"name":"Owner"}).json()["name"] == "Owner"
        assert b.get("/api/auth/me").json()["name"] == "Test"
        assert a.patch("/api/profile",json={"id":b.get("/api/auth/me").json()["id"]}).status_code == 422
        assert b.post("/api/auth/register",json={"email":"c@example.test","name":"C","password":"valid password","is_admin":True}).status_code == 422
        with engine.connect() as conn:
            stored = conn.scalar(select(users.c.password_hash).where(users.c.email == "a@example.test"))
            assert stored != "long test password" and verify_password("long test password", stored)
        raw = a.cookies.get("nl_session")
        assert a.post("/api/auth/logout").status_code == 204
        a.cookies.set("nl_session", raw)
        assert a.get("/api/auth/me").status_code == 401
        a.cookies.clear()
        assert a.post("/api/auth/login",json={"email":"a@example.test","password":"bad"}).status_code == 401
        assert a.post("/api/auth/login",json={"email":"A@example.test","password":"long test password"}).status_code == 200
        assert a.patch("/api/profile",headers={"Origin":"https://untrusted.example"},json={"name":"X"}).status_code == 403
        engine.dispose()
        assert a.get("/api/auth/me").json()["name"] == "Owner"

def test_development_otp_lifecycle(setup, monkeypatch):
    app, _ = setup
    monkeypatch.setenv("APP_ENV", "development")
    auth._dev_otps.clear()
    with TestClient(app) as client:
        assert client.post("/api/auth/register", json={
            "email": "otp@example.test", "name": "Otp User",
            "password": "long test password", "area": "Thane", "phone": "9876543210",
        }).status_code == 201
        requested = client.post("/api/auth/dev-otp/request", json={"phone": "+919876543210"})
        assert requested.status_code == 200
        code = requested.json()["development_code"]
        assert client.post("/api/auth/dev-otp/request", json={"phone": "+919876543210"}).status_code == 429
        assert client.post("/api/auth/dev-otp/verify", json={"phone": "+919876543210", "code": "000000"}).status_code == 401
        assert client.post("/api/auth/dev-otp/verify", json={"phone": "+919876543210", "code": code}).status_code == 200
        assert client.post("/api/auth/dev-otp/verify", json={"phone": "+919876543210", "code": code}).status_code == 400

def test_profile_phone_is_normalized(setup):
    app, _ = setup
    with TestClient(app) as client:
        assert register(client).status_code == 201
        response = client.patch("/api/profile", json={"phone": "9876543210"})
        assert response.status_code == 200
        assert response.json()["phone"] == "+919876543210"

def test_login_rate_limit(setup):
    app, _ = setup
    with TestClient(app) as client:
        assert register(client).status_code == 201
        for _ in range(10):
            assert client.post("/api/auth/login", json={
                "email": "a@example.test", "password": "wrong password",
            }).status_code == 401
        limited = client.post("/api/auth/login", json={
            "email": "a@example.test", "password": "wrong password",
        })
        assert limited.status_code == 429
        assert limited.headers["retry-after"]

def test_change_password_rotates_sessions(setup):
    app, _ = setup
    with TestClient(app) as client, TestClient(app) as other:
        assert register(client).status_code == 201
        assert client.post("/api/auth/login", json={
            "email": "a@example.test", "password": "long test password",
        }).status_code == 200
        assert other.post("/api/auth/login", json={
            "email": "a@example.test", "password": "long test password",
        }).status_code == 200
        changed = client.post("/api/auth/password", json={
            "current_password": "long test password", "new_password": "new secure password",
        })
        assert changed.status_code == 200
        assert client.get("/api/auth/me").status_code == 200
        assert other.get("/api/auth/me").status_code == 401
        assert client.post("/api/auth/login", json={
            "email": "a@example.test", "password": "long test password",
        }).status_code == 401
        assert client.post("/api/auth/login", json={
            "email": "a@example.test", "password": "new secure password",
        }).status_code == 200

def test_development_otp_is_disabled_outside_development(setup, monkeypatch):
    app, _ = setup
    monkeypatch.setenv("APP_ENV", "production")
    with TestClient(app) as client:
        assert client.post("/api/auth/dev-otp/request", json={"phone": "+919876543210"}).status_code == 404

def test_restrictions(setup):
    app, engine = setup
    with TestClient(app) as a, TestClient(app) as b:
        admin_id = register(a).json()["id"]
        target = register(b,"b@example.test").json()["id"]
        assert b.get("/api/admin/users").status_code == 403
        with engine.begin() as conn:
            conn.execute(update(users).where(users.c.id == admin_id).values(is_admin=True))
        for state in ("restricted","suspended","active"):
            assert a.post(f"/api/admin/users/{target}/state",json={"state":state,"reason":"Reviewed request"}).status_code == 200
            if state == "restricted":
                assert b.get("/api/auth/me").status_code == 200
                assert b.patch("/api/profile",json={"name":"X"}).status_code == 403
            if state == "suspended":
                assert b.get("/api/auth/me").status_code == 401
                assert b.post("/api/auth/login",json={"email":"b@example.test","password":"long test password"}).status_code == 403
        with engine.connect() as conn:
            assert len(conn.execute(select(account_actions)).all()) == 3

def test_persistent_images(setup):
    app, engine = setup
    with TestClient(app) as a, TestClient(app) as other:
        register(a)
        buf=BytesIO()
        Image.new("RGB",(3,3),"yellow").save(buf,"PNG")
        for public in (True,False):
            req=a.post("/api/uploads",data={"public":str(public).lower()},files={"file":("../../outside.png",buf.getvalue(),"image/png")})
            assert req.status_code == 201, req.text
            url=req.json()["url"]
            engine.dispose()
            assert a.get(url).headers["content-type"] == "image/jpeg"
            assert other.get(url).status_code == (200 if public else 404)
        assert a.post("/api/uploads",files={"file":("bad.png",b"not an image","image/png")}).status_code == 422
        assert a.post("/api/uploads",files={"file":("big.png",b"0" * (5*1024**2+1),"image/png")}).status_code == 413
        assert a.post("/api/uploads",data={"booking_id":99999},files={"file":("x.png",buf.getvalue(),"image/png")}).status_code == 403

