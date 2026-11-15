import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import auth, bookings, rentals, services, payments, community

app = FastAPI(title="NeighbourLink", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if x.strip()], allow_credentials=True, allow_methods=["GET","POST","PATCH","PUT","DELETE"], allow_headers=["Content-Type","X-Requested-With"])
for module in (auth, bookings, rentals, services, payments, community):
    app.include_router(module.router, prefix="/api")

