from io import BytesIO
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from backend.core import db, metadata
from backend.main import app

def test_rental_photo_survives_instance_change(tmp_path, monkeypatch):
    monkeypatch.setenv('SESSION_SECRET', 'test-photo-secret' * 4)
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    monkeypatch.setenv('UPLOAD_DIR', str(tmp_path / 'first'))
    engine = create_engine('sqlite:///' + (tmp_path / 'test.sqlite').as_posix())
    metadata.create_all(engine)
    def database():
        with engine.begin() as conn:
            yield conn
    app.dependency_overrides[db] = database
    try:
        with TestClient(app) as owner, TestClient(app) as visitor:
            response = owner.post('/api/auth/register', json={'name':'Owner', 'email':'photo@example.test', 'password':'test-password-123', 'area':'Dadar'})
            assert response.status_code == 201
            image = BytesIO()
            Image.new('RGB', (24, 24), 'orange').save(image, 'PNG')
            uploaded = owner.post('/api/uploads', data={'public':'true'}, files={'file':('item.png', image.getvalue(), 'image/png')})
            assert uploaded.status_code == 201
            photo_id = uploaded.json()['id']
            listing = owner.post('/api/rentals/listings', json={'title':'Perfume bottle', 'category':'Basic tools', 'description':'A perfume bottle', 'area':'Dadar', 'condition':'Good', 'daily_price':25000, 'pickup_instructions':'Lobby entrance', 'return_instructions':'Lobby entrance', 'photos':[photo_id]})
            assert listing.status_code == 201, listing.text
            assert visitor.get('/api/rentals/listings').json()[0]['photos'] == [photo_id]
            monkeypatch.setenv('UPLOAD_DIR', str(tmp_path / 'second'))
            engine.dispose()
            photo = visitor.get(f'/api/uploads/{photo_id}')
            assert photo.status_code == 200
            assert photo.content.startswith(b'\xff\xd8')
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
