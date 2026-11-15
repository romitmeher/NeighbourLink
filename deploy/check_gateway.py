"""Read-only authentication check; never print keys or account records."""
import os
import httpx
from deploy.inspect_database import load_environment

if __name__ == '__main__':
    load_environment()
    response=httpx.get('https://api.razorpay.com/v1/orders',params={'count':1},
        auth=(os.environ['RAZORPAY_KEY_ID'],os.environ['RAZORPAY_KEY_SECRET']),timeout=20)
    print('Razorpay read-only authentication check: HTTP',response.status_code)
    if response.status_code!=200:
        try:
            error=response.json().get('error',{})
            print('Provider error:',error.get('code','unknown'),error.get('description',''))
        except ValueError:
            print('Provider returned a non-JSON response.')
        raise SystemExit(1)
    print('Test API credentials accepted. Checkout and webhook delivery are separate checks.')
