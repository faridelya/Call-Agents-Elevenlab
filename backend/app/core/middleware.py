"""Rate limiting and request logging middleware."""
import time
import structlog
from collections import defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

log = structlog.get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Structured request/response logging for every HTTP request — useful for Docker log tailing."""

    SKIP_PATHS = ("/health", "/ws/")

    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in self.SKIP_PATHS):
            return await call_next(request)

        start = time.monotonic()
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
            elapsed_ms = round((time.monotonic() - start) * 1000, 1)
            level = "warning" if response.status_code >= 400 else "info"
            getattr(log, level)(
                "http_request",
                method=method,
                path=path,
                status=response.status_code,
                ms=elapsed_ms,
            )
            return response
        except Exception as exc:
            elapsed_ms = round((time.monotonic() - start) * 1000, 1)
            log.error("http_exception", method=method, path=path, ms=elapsed_ms, error=str(exc))
            raise


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token-bucket rate limiter keyed by user IP or JWT sub claim.

    Limits: 200 req/min for API endpoints, unlimited for webhooks and health.
    """

    EXEMPT_PREFIXES = ("/api/v1/webhooks/", "/health", "/ws/")
    LIMIT = 200
    WINDOW = 60  # seconds

    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _get_key(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in self.EXEMPT_PREFIXES):
            return await call_next(request)

        key = self._get_key(request)
        now = time.monotonic()
        window_start = now - self.WINDOW

        hits = self._buckets[key]
        # Evict timestamps outside the window
        self._buckets[key] = [t for t in hits if t > window_start]

        if len(self._buckets[key]) >= self.LIMIT:
            log.warning("rate_limit_exceeded", key=key, path=path)
            return Response(
                content='{"detail":"Too many requests"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(self.WINDOW)},
            )

        self._buckets[key].append(now)
        return await call_next(request)
