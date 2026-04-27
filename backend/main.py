import os
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
load_dotenv()

from database import init_db
from auth import get_current_user
from routers import feed, topics, overrides, billing, demo, account, pulse
from routers.feed import client_ip_var
from scheduler import start_scheduler, refresh_featured_topics, CRON_SECRET


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if os.getenv("ENABLE_SCHEDULER", "true").lower() == "true":
        start_scheduler()
    yield


app = FastAPI(title="DividedView API", lifespan=lifespan)

_origins = [
    o.strip() for o in [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", ""),
        "https://www.dividedview.com",
        "https://dividedview.com",
    ] if o.strip()
]

class ClientIPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        token = client_ip_var.set(ip)
        try:
            return await call_next(request)
        finally:
            client_ip_var.reset(token)

app.add_middleware(ClientIPMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

app.include_router(feed.router, prefix="/api")
app.include_router(topics.router, prefix="/api")
app.include_router(overrides.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(pulse.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current user's profile (id, email, name, tier)."""
    return user


@app.post("/api/cron/refresh-featured")
async def cron_refresh_featured(request: Request):
    """Trigger a refresh of all featured topics. Secured by CRON_SECRET."""
    secret = request.headers.get("x-cron-secret", "")
    if not CRON_SECRET or secret != CRON_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Invalid cron secret")
    import threading
    def _refresh_all():
        # Only run trending topics (full pipeline for each)
        # Curated topics retain their existing data
        try:
            from routers.pulse import refresh_trending_cache
            refresh_trending_cache()
        except Exception as e:
            print(f"[Cron] Trending refresh error: {e}")
    threading.Thread(target=_refresh_all, daemon=True).start()
    return {"status": "started", "message": "Refreshing featured topics + trending in background"}
