import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routers import feed, topics, overrides


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Political Feed Simulator", lifespan=lifespan)

_origins = [
    o.strip() for o in [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", ""),
    ] if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Admin-Secret"],
)

app.include_router(feed.router, prefix="/api")
app.include_router(topics.router, prefix="/api")
app.include_router(overrides.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
