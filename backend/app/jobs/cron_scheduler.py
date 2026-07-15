import asyncio
import os
import uuid
from typing import Any, Dict, Optional

from app.agents.memory import save_message
from app.agents.state import ResetList
from app.routers.cron import compute_next_run

_scheduler_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


async def _ensure_conversation(user_id: str, job_id: str, name: Optional[str]) -> str:
    from app.db.session import get_db

    db = get_db()
    conversation_id = str(uuid.uuid4())
    title = name or "Cron job"
    await db.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
        uuid.UUID(conversation_id),
        uuid.UUID(user_id),
        f"Cron: {title}",
    )
    await db.execute(
        "UPDATE cron_jobs SET conversation_id = $1 WHERE id = $2 AND conversation_id IS NULL",
        uuid.UUID(conversation_id),
        uuid.UUID(job_id),
    )
    return conversation_id


async def _conversation_for_job(job) -> str:
    if job["conversation_id"]:
        return str(job["conversation_id"])
    return await _ensure_conversation(str(job["user_id"]), str(job["id"]), job["name"])


async def run_cron_job(job_id: str) -> Dict[str, Any]:
    from app.agents.graph import get_compiled_graph
    from app.db.session import get_db

    db = get_db()
    job = await db.fetchrow("SELECT * FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))
    if not job:
        return {"status": "not_found", "error": "Cron job not found"}

    claimed = await db.fetchrow(
        "UPDATE cron_jobs SET state = 'running', updated_at = now() "
        "WHERE id = $1 AND state != 'running' RETURNING *",
        uuid.UUID(job_id),
    )
    if not claimed:
        return {"status": "skipped", "error": "Cron job is already running"}
    job = claimed

    conversation_id = await _conversation_for_job(job)
    run = await db.fetchrow(
        "INSERT INTO cron_runs (job_id, conversation_id, status) VALUES ($1, $2, 'running') RETURNING id",
        uuid.UUID(job_id),
        uuid.UUID(conversation_id),
    )
    run_id = run["id"]

    instruction = job["prompt"]
    try:
        await save_message(conversation_id, "user", instruction)
        db_groq_key = ""
        try:
            user_row = await db.fetchrow("SELECT groq_api_key FROM users WHERE id = $1", job["user_id"])
            if user_row and user_row["groq_api_key"]:
                from cryptography.fernet import Fernet
                from app.config import settings
                fernet = Fernet(settings.token_encryption_key.encode())
                db_groq_key = fernet.decrypt(user_row["groq_api_key"].encode()).decode()
        except Exception as e:
            print(f"Cron Scheduler: Failed to decrypt user Groq key: {e}")

        graph = await get_compiled_graph()
        result = await graph.ainvoke(
            {
                "user_id": str(job["user_id"]),
                "conversation_id": conversation_id,
                "instruction": instruction,
                "messages": await _load_cron_history(conversation_id),
                "plan": [],
                "active_tasks": ResetList(),
                "completed_tasks": ResetList(),
                "pending_approvals": ResetList(),
                "email_context": ResetList(),
                "draft_results": ResetList(),
                "calendar_results": ResetList(),
                "summaries": ResetList(),
                "errors": ResetList(),
                "groq_api_key": db_groq_key,
                # Signal to the permission gate to auto-approve all actions.
                # Cron jobs are unattended — they must never block on human approval.
                "is_cron": True,
            },
            config={"configurable": {"thread_id": conversation_id}},
        )

        # Detect if the graph returned an interrupt state (shouldn't happen with is_cron=True,
        # but guard defensively in case a future node raises an interrupt for another reason).
        if hasattr(result, "__interrupt__") or (
            isinstance(result, dict) and result.get("__interrupt__")
        ):
            raise RuntimeError(
                "Graph execution was interrupted unexpectedly during a cron run. "
                "This should not happen when is_cron=True. Check permission_gate_node."
            )

        messages = result.get("messages", [])
        if messages:
            last_message = messages[-1]
            output = last_message.content if hasattr(last_message, "content") else last_message.get("content", "Done.")
        else:
            output = "Done."
        await save_message(conversation_id, "assistant", output)

        next_run = compute_next_run(job["schedule_type"], job["schedule_value"])
        await db.execute(
            "UPDATE cron_jobs SET state = 'scheduled', enabled = true, last_run_at = now(), next_run_at = $1, "
            "last_error = NULL, updated_at = now() WHERE id = $2",
            next_run,
            uuid.UUID(job_id),
        )
        await db.execute(
            "UPDATE cron_runs SET status = 'completed', output = $1, finished_at = now() WHERE id = $2",
            output,
            run_id,
        )
        return {"status": "completed", "conversation_id": conversation_id, "output": output}
    except Exception as exc:
        next_run = compute_next_run(job["schedule_type"], job["schedule_value"])
        error = str(exc)
        await db.execute(
            "UPDATE cron_jobs SET state = 'failed', last_run_at = now(), next_run_at = $1, last_error = $2, updated_at = now() "
            "WHERE id = $3",
            next_run,
            error,
            uuid.UUID(job_id),
        )
        await db.execute(
            "UPDATE cron_runs SET status = 'failed', error = $1, finished_at = now() WHERE id = $2",
            error,
            run_id,
        )
        return {"status": "failed", "conversation_id": conversation_id, "error": error}


async def _load_cron_history(conversation_id: str):
    from app.agents.memory import load_recent_messages

    return await load_recent_messages(conversation_id)


async def _scheduler_loop():
    from app.db.session import get_db

    assert _stop_event is not None
    while not _stop_event.is_set():
        try:
            db = get_db()
            rows = await db.fetch(
                "SELECT id::text FROM cron_jobs "
                "WHERE enabled = true AND state != 'running' AND next_run_at IS NOT NULL AND next_run_at <= now() "
                "ORDER BY next_run_at ASC LIMIT 5"
            )
            for row in rows:
                asyncio.create_task(run_cron_job(row["id"]))
            
            # Reconcile stuck sends in background thread on each tick
            from app.jobs.reconcile_sends import reconcile_stuck_sends
            asyncio.create_task(asyncio.to_thread(reconcile_stuck_sends))
        except Exception as exc:
            print(f"Cron scheduler tick failed: {exc}")

        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=30)
        except asyncio.TimeoutError:
            pass


def start_cron_scheduler():
    global _scheduler_task, _stop_event
    if _scheduler_task and not _scheduler_task.done():
        return
    _stop_event = asyncio.Event()
    _scheduler_task = asyncio.create_task(_scheduler_loop())


async def stop_cron_scheduler():
    global _scheduler_task, _stop_event
    if _stop_event:
        _stop_event.set()
    if _scheduler_task:
        await _scheduler_task
    _scheduler_task = None
    _stop_event = None
