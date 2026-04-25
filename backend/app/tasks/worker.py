from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.tasks.post_call_tasks import post_call_processing
from app.tasks.campaign_tasks import dial_next_contact
from app.tasks.maintenance_tasks import cleanup_stale_calls, purge_old_calls, reset_failed_campaigns


async def startup(ctx: dict):
    from app.db.session import AsyncSessionLocal
    from app.db.redis import get_redis_pool
    ctx["db_factory"] = AsyncSessionLocal
    ctx["redis"] = await get_redis_pool()


async def shutdown(ctx: dict):
    from app.db.redis import close_redis_pool
    await close_redis_pool()


class WorkerSettings:
    functions = [post_call_processing, dial_next_contact, cleanup_stale_calls, purge_old_calls, reset_failed_campaigns]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 300
    cron_jobs = [
        cron(cleanup_stale_calls, minute={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58}),
        cron(reset_failed_campaigns, minute={0, 10, 20, 30, 40, 50}),
        cron(purge_old_calls, hour=2, minute=0),
    ]
