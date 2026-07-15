"""
bulk_email.py — FastAPI router for bulk email campaigns.

Endpoints:
  POST /api/bulk-email/smtp-test      — Test SMTP credentials
  POST /api/bulk-email/upload-csv     — Upload CSV, return parsed contacts
  POST /api/bulk-email/send           — Start bulk campaign (returns job_id)
  GET  /api/bulk-email/stream/{id}    — SSE progress stream
  POST /api/bulk-email/stop/{id}      — Stop running campaign
  GET  /api/bulk-email/history        — Send run history
  POST /api/bulk-email/test-email     — Send single test email
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.tools.bulk_send_service import (
    BulkSendRequest,
    Contact,
    ColumnMap,
    ComposePayload,
    RecipientResult,
    SMTPConfig,
    SendProgress,
    TestEmailRequest,
    run_campaign_sync,
    send_test_email,
    test_smtp_connection,
)

logger = logging.getLogger("mailing_agent.bulk_email_router")

router = APIRouter(prefix="/api/bulk-email", tags=["bulk-email"])

# In-memory job tracker
_jobs: Dict[str, Dict] = {}


# ─── Models ───────────────────────────────────────────────────────────────────

class ParsedCSVResponse(BaseModel):
    contacts: List[Dict]
    columns: List[str]
    count: int


class CampaignStartResponse(BaseModel):
    job_id: str
    total: int


class HistoryEntry(BaseModel):
    job_id: str
    campaign_name: Optional[str]
    started_at: str
    total: int
    sent: int
    failed: int
    stopped: bool
    done: bool


# ─── SMTP Test ────────────────────────────────────────────────────────────────

@router.post("/smtp-test")
async def smtp_test(cfg: SMTPConfig):
    """Test SMTP credentials without sending."""
    result = await asyncio.get_event_loop().run_in_executor(
        None, test_smtp_connection, cfg
    )
    return result


# ─── CSV Upload ───────────────────────────────────────────────────────────────

@router.post("/upload-csv", response_model=ParsedCSVResponse)
async def upload_csv(file: UploadFile = File(...)):
    """Parse uploaded CSV and return contacts + column headers."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    columns = reader.fieldnames or []
    rows = []
    for row in reader:
        cleaned = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        if cleaned:
            rows.append(cleaned)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV is empty or has no data rows.")

    return ParsedCSVResponse(
        contacts=rows,
        columns=[c.strip() for c in columns],
        count=len(rows),
    )


# ─── Start Campaign ──────────────────────────────────────────────────────────

@router.post("/send", response_model=CampaignStartResponse)
async def start_send(request: BulkSendRequest):
    """Start a bulk email campaign. Returns job_id for progress streaming."""
    if not request.contacts:
        raise HTTPException(status_code=400, detail="No contacts provided.")

    job_id = str(uuid.uuid4())
    stop_event = asyncio.Event()

    _jobs[job_id] = {
        "stop_event": stop_event,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "campaign_name": request.campaign_name,
        "total": len(request.contacts),
        "sent": 0,
        "failed": 0,
        "stopped": False,
        "done": False,
        "request": request,
    }

    return CampaignStartResponse(job_id=job_id, total=len(request.contacts))


# ─── SSE Progress Stream ─────────────────────────────────────────────────────

@router.get("/stream/{job_id}")
async def stream_progress(job_id: str):
    """Server-Sent Events stream of campaign progress."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    request: BulkSendRequest = job["request"]
    stop_event = job["stop_event"]

    async def generate():
        loop = asyncio.get_event_loop()
        gen = run_campaign_sync(request, stop_event=stop_event)

        try:
            while True:
                progress = await loop.run_in_executor(None, next, gen, None)
                if progress is None:
                    break

                # Update in-memory tracker
                job["sent"] = progress.sent
                job["failed"] = progress.failed
                job["done"] = progress.done
                job["stopped"] = progress.stopped

                data = progress.model_dump_json()
                yield f"data: {data}\n\n"

                if progress.done or progress.stopped:
                    break
        except StopIteration:
            pass

        job["done"] = True
        yield f"data: {json.dumps({'done': True, 'sent': job['sent'], 'failed': job['failed'], 'total': job['total']})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Stop Campaign ───────────────────────────────────────────────────────────

@router.post("/stop/{job_id}")
async def stop_send(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    job["stop_event"].set()
    job["stopped"] = True
    return {"status": "stop_requested"}


# ─── Send History ─────────────────────────────────────────────────────────────

@router.get("/history", response_model=List[HistoryEntry])
async def get_history():
    """Return in-memory campaign history."""
    entries = []
    for jid, job in _jobs.items():
        entries.append(HistoryEntry(
            job_id=jid,
            campaign_name=job.get("campaign_name"),
            started_at=job.get("started_at", ""),
            total=job.get("total", 0),
            sent=job.get("sent", 0),
            failed=job.get("failed", 0),
            stopped=job.get("stopped", False),
            done=job.get("done", False),
        ))
    return sorted(entries, key=lambda e: e.started_at, reverse=True)


# ─── Test Email ───────────────────────────────────────────────────────────────

@router.post("/test-email")
async def test_email(req: TestEmailRequest):
    """Send a single test email."""
    result = await asyncio.get_event_loop().run_in_executor(
        None, send_test_email, req.smtp, req.compose, req.to
    )
    return result
