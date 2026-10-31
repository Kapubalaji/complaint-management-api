import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from slowapi.errors import RateLimitExceeded

import backend.database as db
from backend.database import engine, Base
import backend.models  # Imports all models
from backend.migrate import run_migrations
from backend.limiter import limiter, rate_limit_exceeded_handler
from backend.routers.complaints import router as complaint_router
from backend.routers.users import router as user_router
from backend.routers.ai import router as ai_router
from backend.routers.reports import router as reports_router

# Run migration on startup to ensure all columns & tables exist safely
run_migrations()

app = FastAPI(title="ResolveIT API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


def _cors_origins() -> list[str]:
    """Local dev origins plus deployed origins from the environment.

    FRONTEND_URL: the single deployed frontend origin (e.g. the Vercel URL).
    CORS_ORIGINS: optional comma-separated extra origins (preview URLs, custom domains).
    Empty values are dropped; trailing slashes are normalized because browser
    Origin headers never include one.
    """
    origins = {"http://localhost:5173", "http://127.0.0.1:5173"}
    for raw in (os.getenv("FRONTEND_URL", ""), os.getenv("CORS_ORIGINS", "")):
        for part in raw.split(","):
            origin = part.strip().rstrip("/")
            if origin:
                origins.add(origin)
    return sorted(origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(complaint_router)
app.include_router(user_router)
app.include_router(ai_router)
app.include_router(reports_router)

@app.get("/")
def home():
    return {"message": "ResolveIT Complaint Management API is running", "version": "2.0.0"}


@app.get("/health")
def health_check():
    """Lightweight health check that validates database connectivity.

    Returns HTTP 200 {"status": "healthy", "database": "connected"} when ok,
    or HTTP 503 {"status": "unhealthy", "database": "disconnected"} when unreachable.
    Does not expose database URLs, credentials, or internal error details.
    """
    try:
        with Session(db.engine) as session:
            session.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected"},
        )
