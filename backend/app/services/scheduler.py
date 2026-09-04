"""Background scheduler service for automated agronomic and meteorological jobs."""

import logging
from typing import Optional

from app.database import AsyncSessionLocal
from app.services.weather_service import sync_weather_for_all_estates

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[object] = None


async def scheduled_daily_weather_job() -> None:
    """Daily weather sync job executed at 05:00 WIB (before satellite processing)."""
    logger.info("Executing scheduled daily weather synchronization job...")
    try:
        async with AsyncSessionLocal() as session:
            summary = await sync_weather_for_all_estates(session)
            logger.info("Daily weather job finished: %s", summary["message"])
    except Exception as exc:
        logger.error("Error executing scheduled daily weather job: %s", str(exc), exc_info=True)


async def scheduled_daily_gdd_job() -> None:
    """Daily GDD calculation and phenology prediction job executed at 05:30 WIB."""
    logger.info("Executing scheduled daily GDD calculation job (05:30 WIB)...")
    try:
        from app.services.gdd_service import sync_gdd_for_all_plots

        async with AsyncSessionLocal() as session:
            summary = await sync_gdd_for_all_plots(session)
            logger.info("Daily GDD job finished: %s", summary["message"])
    except Exception as exc:
        logger.error("Error executing scheduled daily GDD job: %s", str(exc), exc_info=True)


async def scheduled_daily_satellite_job() -> None:
    """Daily satellite image sync job executed at 06:00 WIB (Sentinel-2 & Sentinel-1)."""
    logger.info("Executing scheduled daily satellite synchronization job (06:00 WIB)...")
    try:
        from app.services.gee_service import sync_satellite_for_all_plots

        async with AsyncSessionLocal() as session:
            summary = await sync_satellite_for_all_plots(session)
            logger.info("Daily satellite job finished: %s", summary["message"])
    except Exception as exc:
        logger.error("Error executing scheduled daily satellite job: %s", str(exc), exc_info=True)


async def scheduled_daily_alert_job() -> None:
    """Daily Alert Engine evaluation job executed at 06:30 WIB (after weather, GDD, and satellite)."""
    logger.info("Executing scheduled daily Alert Engine evaluation job (06:30 WIB)...")
    try:
        from app.services.alert_service import evaluate_alerts_for_all_plots

        async with AsyncSessionLocal() as session:
            summary = await evaluate_alerts_for_all_plots(session)
            logger.info("Daily Alert Engine job finished: %s", summary["message"])
    except Exception as exc:
        logger.error("Error executing scheduled daily Alert Engine job: %s", str(exc), exc_info=True)


async def scheduled_daily_email_job() -> None:
    """Daily email alert summary job executed at 07:30 WIB (after alert evaluation)."""
    logger.info("Executing scheduled daily email alerts job (07:30 WIB)...")
    try:
        from app.services.email_service import process_and_send_daily_alert_emails

        async with AsyncSessionLocal() as session:
            summary = await process_and_send_daily_alert_emails(session)
            logger.info("Daily email alert summary finished: %s", summary["message"])
    except Exception as exc:
        logger.error("Error executing scheduled daily email alerts job: %s", str(exc), exc_info=True)


async def scheduled_weekly_reports_job() -> None:
    """Weekly automated PDF report generation (Health & Water Usage) executed every Monday at 07:00 WIB."""
    logger.info("Executing scheduled weekly reports job (Monday 07:00 WIB)...")
    try:
        from app.services.report_service import generate_and_save_weekly_reports

        async with AsyncSessionLocal() as session:
            summary = await generate_and_save_weekly_reports(session)
            logger.info(
                "Weekly reports generation finished: %d reports created for %d estates",
                summary["reports_created"],
                summary["estates_processed"],
            )
    except Exception as exc:
        logger.error("Error executing scheduled weekly reports job: %s", str(exc), exc_info=True)


def start_scheduler() -> None:
    """Initialize and start APScheduler background async scheduler."""
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler(timezone="Asia/Jakarta")

        # Schedule daily weather fetch at 05:00 WIB
        scheduler.add_job(
            scheduled_daily_weather_job,
            trigger=CronTrigger(hour=5, minute=0, timezone="Asia/Jakarta"),
            id="daily_weather_sync_0500_wib",
            name="Daily Open-Meteo Weather Sync (05:00 WIB)",
            replace_existing=True,
        )

        # Schedule daily GDD calculation at 05:30 WIB
        scheduler.add_job(
            scheduled_daily_gdd_job,
            trigger=CronTrigger(hour=5, minute=30, timezone="Asia/Jakarta"),
            id="daily_gdd_calc_0530_wib",
            name="Daily GDD Calculation & Phase Prediction (05:30 WIB)",
            replace_existing=True,
        )

        # Schedule daily satellite processing at 06:00 WIB
        scheduler.add_job(
            scheduled_daily_satellite_job,
            trigger=CronTrigger(hour=6, minute=0, timezone="Asia/Jakarta"),
            id="daily_satellite_sync_0600_wib",
            name="Daily Sentinel-2/Sentinel-1 Satellite Sync (06:00 WIB)",
            replace_existing=True,
        )

        # Schedule daily alert evaluation at 06:30 WIB
        scheduler.add_job(
            scheduled_daily_alert_job,
            trigger=CronTrigger(hour=6, minute=30, timezone="Asia/Jakarta"),
            id="daily_alert_evaluation_0630_wib",
            name="Daily Alert Engine Evaluation (06:30 WIB)",
            replace_existing=True,
        )

        # Schedule daily email alerts at 07:30 WIB
        scheduler.add_job(
            scheduled_daily_email_job,
            trigger=CronTrigger(hour=7, minute=30, timezone="Asia/Jakarta"),
            id="daily_email_alerts_0730_wib",
            name="Daily Email Alert Summary (07:30 WIB)",
            replace_existing=True,
        )

        # Schedule weekly automated PDF reports on Monday at 07:00 WIB
        scheduler.add_job(
            scheduled_weekly_reports_job,
            trigger=CronTrigger(day_of_week="mon", hour=7, minute=0, timezone="Asia/Jakarta"),
            id="weekly_reports_monday_0700_wib",
            name="Weekly Health & Water PDF Reports (Monday 07:00 WIB)",
            replace_existing=True,
        )

        scheduler.start()
        _scheduler = scheduler
        logger.info(
            "APScheduler initialized successfully with weather (05:00 WIB), GDD (05:30 WIB), satellite (06:00 WIB), alert (06:30 WIB), reports (Mon 07:00 WIB), and email (07:30 WIB) jobs."
        )


    except ImportError:
        logger.warning(
            "APScheduler is not installed. Background cron jobs are disabled. "
            "Install 'apscheduler' to enable automated 05:00 WIB weather synchronization."
        )
    except Exception as exc:
        logger.error("Failed to initialize APScheduler: %s", str(exc), exc_info=True)


def stop_scheduler() -> None:
    """Gracefully shutdown background scheduler."""
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
            logger.info("APScheduler shutdown completed.")
        except Exception as exc:
            logger.warning("Error shutting down APScheduler: %s", str(exc))
        finally:
            _scheduler = None
