"""
Cron Router — manage scheduled agent jobs.

Security:
  - All endpoints require JWT authentication via Depends(get_current_user)
  - Ownership check on all job-specific operations
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.jwt_auth import get_current_user

router = APIRouter(prefix="/cron", tags=["cron"])


class CronJobInput(BaseModel):
    name: Optional[str] = None
    prompt: str = Field(..., min_length=3)
    schedule_type: str = Field(..., pattern="^(interval_minutes|daily)$")
    schedule_value: str


class CronJobUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = Field(default=None, min_length=3)
    schedule_type: Optional[str] = Field(default=None, pattern="^(interval_minutes|daily)$")
    schedule_value: Optional[str] = None
    enabled: Optional[bool] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def compute_next_run(schedule_type: str, schedule_value: str, now: Optional[datetime] = None) -> datetime:
    now = now or _utc_now()
    if schedule_type == "interval_minutes":
        try:
            minutes = int(schedule_value)
        except ValueError as exc:
            raise ValueError("Interval schedule must be a number of minutes") from exc
        if minutes < 1 or minutes > 10080:
            raise ValueError("Interval must be between 1 minute and 7 days")
        return now + timedelta(minutes=minutes)

    if schedule_type == "daily":
        try:
            hour_text, minute_text = schedule_value.split(":", 1)
            hour = int(hour_text)
            minute = int(minute_text)
        except ValueError as exc:
            raise ValueError("Daily schedule must use HH:MM format") from exc
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("Daily schedule must use a valid 24-hour HH:MM time")
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    raise ValueError("Unsupported schedule type")


def _job_from_row(row) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "conversation_id": str(row["conversation_id"]) if row["conversation_id"] else None,
        "name": row["name"],
        "prompt": row["prompt"],
        "schedule_type": row["schedule_type"],
        "schedule_value": row["schedule_value"],
        "enabled": row["enabled"],
        "state": row["state"],
        "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
        "next_run_at": row["next_run_at"].isoformat() if row["next_run_at"] else None,
        "last_error": row["last_error"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def _verify_job_ownership(job_id: str, user_id: str, db):
    """Verify the cron job belongs to the authenticated user. Raises 404/403."""
    job = await db.fetchrow("SELECT user_id FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Cron job not found")
    if str(job["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your cron job")


@router.get("")
async def list_cron_jobs(
    current_user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    from app.db.session import get_db
    db = get_db()
    rows = await db.fetch(
        "SELECT * FROM cron_jobs WHERE user_id = $1 ORDER BY created_at DESC",
        uuid.UUID(current_user["user_id"]),
    )
    return [_job_from_row(row) for row in rows]


@router.post("")
async def create_cron_job(
    payload: CronJobInput,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    from app.db.session import get_db
    try:
        next_run = compute_next_run(payload.schedule_type, payload.schedule_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db = get_db()
    user_uuid = uuid.UUID(current_user["user_id"])

    # Ensure user exists
    user = await db.fetchrow("SELECT id FROM users WHERE id = $1", user_uuid)
    if not user:
        placeholder_email = f"user_{user_uuid}@example.com"
        await db.execute(
            "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            user_uuid, placeholder_email, "User",
        )
        from app.db.init_db import seed_default_rules
        await seed_default_rules(str(user_uuid), db)

    row = await db.fetchrow(
        "INSERT INTO cron_jobs (user_id, name, prompt, schedule_type, schedule_value, next_run_at) "
        "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        user_uuid, payload.name, payload.prompt, payload.schedule_type, payload.schedule_value, next_run,
    )
    return _job_from_row(row)


@router.patch("/{job_id}")
async def update_cron_job(
    job_id: str,
    payload: CronJobUpdate,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    current = await db.fetchrow("SELECT * FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))

    schedule_type = payload.schedule_type or current["schedule_type"]
    schedule_value = payload.schedule_value or current["schedule_value"]
    next_run = current["next_run_at"]
    if payload.schedule_type is not None or payload.schedule_value is not None:
        try:
            next_run = compute_next_run(schedule_type, schedule_value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    enabled = current["enabled"] if payload.enabled is None else payload.enabled
    state = "scheduled" if enabled else "paused"
    row = await db.fetchrow(
        "UPDATE cron_jobs SET name = $1, prompt = $2, schedule_type = $3, schedule_value = $4, "
        "enabled = $5, state = $6, next_run_at = $7, updated_at = now(), last_error = NULL "
        "WHERE id = $8 RETURNING *",
        payload.name if payload.name is not None else current["name"],
        payload.prompt if payload.prompt is not None else current["prompt"],
        schedule_type, schedule_value, enabled, state, next_run, uuid.UUID(job_id),
    )
    return _job_from_row(row)


@router.post("/{job_id}/pause")
async def pause_cron_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    row = await db.fetchrow(
        "UPDATE cron_jobs SET enabled = false, state = 'paused', updated_at = now() WHERE id = $1 RETURNING *",
        uuid.UUID(job_id),
    )
    return _job_from_row(row)


@router.post("/{job_id}/resume")
async def resume_cron_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    current = await db.fetchrow("SELECT * FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))
    next_run = compute_next_run(current["schedule_type"], current["schedule_value"])
    row = await db.fetchrow(
        "UPDATE cron_jobs SET enabled = true, state = 'scheduled', next_run_at = $1, updated_at = now(), last_error = NULL "
        "WHERE id = $2 RETURNING *",
        next_run, uuid.UUID(job_id),
    )
    return _job_from_row(row)


@router.delete("/{job_id}")
async def delete_cron_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, str]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    await db.execute("DELETE FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))
    return {"status": "deleted"}


@router.post("/{job_id}/trigger")
async def trigger_cron_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    from app.jobs.cron_scheduler import run_cron_job
    return await run_cron_job(job_id)


@router.get("/{job_id}/runs")
async def list_cron_runs(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    from app.db.session import get_db
    db = get_db()
    await _verify_job_ownership(job_id, current_user["user_id"], db)

    rows = await db.fetch(
        "SELECT id::text, job_id::text, conversation_id::text, status, output, error, started_at, finished_at "
        "FROM cron_runs WHERE job_id = $1 ORDER BY started_at DESC LIMIT 50",
        uuid.UUID(job_id),
    )
    return [
        {
            "id": row["id"],
            "job_id": row["job_id"],
            "conversation_id": row["conversation_id"],
            "status": row["status"],
            "output": row["output"],
            "error": row["error"],
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
        }
        for row in rows
    ]
