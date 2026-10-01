from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.audit import audit
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.rate_limit import check_rate_limit, client_ip, rate_limit_for_path
from backend.app.core.security import get_password_hash, redact_secrets
from backend.app.db.session import SessionLocal, get_db

PUBLIC_PATHS = {"/", "/health", "/health/db"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.app.engine.event_bus import event_bus
    from backend.app.models.user import User

    event_bus.start()
    if settings.BOOTSTRAP_ADMIN_USERNAME and settings.BOOTSTRAP_ADMIN_PASSWORD:
        try:
            async with SessionLocal() as db:
                existing = (
                    await db.execute(select(User).where(User.username == settings.BOOTSTRAP_ADMIN_USERNAME))
                ).scalar_one_or_none()
                if not existing:
                    db.add(
                        User(
                            username=settings.BOOTSTRAP_ADMIN_USERNAME,
                            email=settings.BOOTSTRAP_ADMIN_EMAIL or f"{settings.BOOTSTRAP_ADMIN_USERNAME}@local",
                            password_hash=get_password_hash(settings.BOOTSTRAP_ADMIN_PASSWORD),
                            role="ADMIN",
                            status="ACTIVE",
                        )
                    )
                    await db.commit()
                    audit("admin_bootstrap", actor="system", outcome="success")
        except Exception as exc:
            logger.warning("Admin bootstrap skipped: %s", exc)
    yield
    event_bus.stop()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SOC Monitor Backend API",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    debug=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def security_and_limits(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.MAX_REQUEST_BODY_BYTES:
                return JSONResponse(status_code=413, content={"detail": "Request entity too large"})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})

    path = request.url.path
    if path not in PUBLIC_PATHS and not path.startswith("/api/v1/auth/login"):
        if path.startswith("/api/") or path.startswith("/api/v1/ws"):
            try:
                check_rate_limit(
                    f"api:{client_ip(request)}:{path.split('/')[3] if len(path.split('/')) > 3 else 'root'}",
                    rate_limit_for_path(path),
                )
            except Exception as exc:
                if getattr(exc, "status_code", None) == 429:
                    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
                raise

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    if settings.HTTPS_ENABLED:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", redact_secrets(str(exc)))
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )


@app.get("/")
def root():
    logger.info("Root endpoint accessed")
    return {"message": "SOC Monitor API is running"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "soc-monitor-backend",
    }


@app.get("/health/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "service": "database"}
    except Exception as exc:
        logger.error("Database health check failed: %s", redact_secrets(str(exc)))
        return JSONResponse(
            status_code=503,
            content={"status": "error", "service": "database", "detail": "Database unavailable"},
        )


from backend.app.api.v1.api import api_router

app.include_router(api_router, prefix=settings.API_V1_STR)
