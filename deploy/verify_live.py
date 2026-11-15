"""Check running frontend proxy and API without browser automation."""
import httpx
from deploy.inspect_database import ROOT

def main():
    password=(ROOT/'.demo-credentials.txt').read_text().splitlines()[1].split(': ',1)[1]
    with httpx.Client(base_url='http://127.0.0.1:5173',timeout=20) as client:
        page=client.get('/')
        assert page.status_code==200 and '<div id="root"></div>' in page.text
        assert client.get('/api/ready').json()['status']=='ready'
        for role in ('customer','owner','helper','professional','admin'):
            result=client.post('/api/auth/login',json={'email':role+'@example.test','password':password},headers={'Origin':'http://127.0.0.1:5173'})
            assert result.status_code==200
            for path in ('/auth/me','/rentals/listings','/help/providers','/help/requests','/bookings','/community/dashboard','/community/inbox'):
                response=client.get('/api'+path)
                assert response.status_code==200,(role,path,response.status_code)
            admin=client.get('/api/community/admin/dashboard')
            assert admin.status_code==(200 if role=='admin' else 403)
            assert client.post('/api/auth/logout',headers={'Origin':'https://untrusted.invalid'}).status_code==403
            assert client.post('/api/auth/logout').status_code in (200,204)
            print(role+': live API discovery, dashboard, role checks and session passed')
        print('Frontend HTML and proxied database readiness passed. No browser used.')

if __name__=='__main__':
    main()
