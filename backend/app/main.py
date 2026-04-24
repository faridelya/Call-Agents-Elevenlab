from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.middleware import RateLimitMiddleware, LoggingMiddleware
from app.db.redis import get_redis_pool, close_redis_pool
from app.tools.registry import load_tools

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("startup", env=settings.app_env, base_url=settings.base_url)
    await get_redis_pool()
    load_tools()
    yield
    # Shutdown
    await close_redis_pool()
    log.info("shutdown")


app = FastAPI(
    title="Voxara API",
    version="1.0.0",
    description="AI Voice Agent SaaS — FastAPI Backend",
    lifespan=lifespan,
)

app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if not settings.is_production else [settings.base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
from app.routers import auth, agents, calls, campaigns, leads, phone_numbers, tools, webhooks, analytics, settings as settings_router, knowledge_base  # noqa: E402

app.include_router(auth.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(calls.router, prefix="/api/v1")
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(phone_numbers.router, prefix="/api/v1")
app.include_router(tools.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(knowledge_base.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# WebSocket bridge — Twilio Media Streams connect here
from app.websockets.bridge import Bridge  # noqa: E402
from app.websockets.event_bus import run_event_ws  # noqa: E402


@app.websocket("/ws/bridge/{call_record_id}")
async def ws_bridge(call_record_id: str, websocket):
    bridge = Bridge(call_record_id=call_record_id, twilio_ws=websocket)
    await bridge.run()


@app.websocket("/ws/events/{user_id}")
async def ws_events(user_id: str, websocket):
    """Real-time event stream for frontend (call status, campaign progress)."""
    await run_event_ws(user_id, websocket)
