from typing import Any
import time
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .logging_utils import get_logger, log_event
from .services.solver_proxy import solve_schedule as solve_schedule_payload
from .services.state_store import get_json_state, put_json_state


SCHEDULE_STATE_KEY = "schedule_ui_state_v1"

app = FastAPI(title="CreaTura Backend API")
logger = get_logger()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    log_event(logger, "INFO", "health.check")
    return {"status": "ok"}


@app.post("/solve/schedule")
async def solve_schedule(payload: dict[str, Any], request: Request):
    request_id = request.headers.get("X-Request-Id") or uuid4().hex[:8]
    started_at = time.perf_counter()
    employees_count = len(payload.get("employees", [])) if isinstance(payload.get("employees"), list) else 0
    shifts_count = len(payload.get("shifts", [])) if isinstance(payload.get("shifts"), list) else 0
    hard_count = 0
    soft_count = 0
    constraints = payload.get("constraints", {})
    if isinstance(constraints, dict):
        hard = constraints.get("hard", [])
        soft = constraints.get("soft", [])
        hard_count = len(hard) if isinstance(hard, list) else 0
        soft_count = len(soft) if isinstance(soft, list) else 0

    log_event(
        logger,
        "INFO",
        "solve_schedule.request.start",
        request_id=request_id,
        employees=employees_count,
        shifts=shifts_count,
        hard=hard_count,
        soft=soft_count,
    )
    try:
        result = await solve_schedule_payload(payload, request_id=request_id)
    except HTTPException as exc:
        elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
        level = "WARN" if 400 <= exc.status_code < 500 else "ERROR"
        log_event(
            logger,
            level,
            "solve_schedule.request.failed",
            request_id=request_id,
            status_code=exc.status_code,
            elapsed_us=elapsed_us,
            detail=str(exc.detail),
        )
        raise
    except Exception as exc:
        elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
        log_event(
            logger,
            "ERROR",
            "solve_schedule.request.exception",
            request_id=request_id,
            elapsed_us=elapsed_us,
            error=str(exc),
        )
        raise

    elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
    log_event(
        logger,
        "INFO",
        "solve_schedule.request.done",
        request_id=request_id,
        elapsed_us=elapsed_us,
        solver_status=result.get("status"),
        objective=result.get("objective"),
    )
    return result


@app.get("/state/schedule")
def get_schedule_state(request: Request, db: Session = Depends(get_db)):
    request_id = request.headers.get("X-Request-Id") or uuid4().hex[:8]
    result = get_json_state(db, SCHEDULE_STATE_KEY)
    log_event(
        logger,
        "INFO",
        "state.schedule.get",
        request_id=request_id,
        exists=result.get("exists"),
    )
    return result


@app.put("/state/schedule")
def put_schedule_state(payload: dict[str, Any], request: Request, db: Session = Depends(get_db)):
    request_id = request.headers.get("X-Request-Id") or uuid4().hex[:8]
    result = put_json_state(db, SCHEDULE_STATE_KEY, payload)
    log_event(
        logger,
        "INFO",
        "state.schedule.put",
        request_id=request_id,
        updated_at=result.get("updated_at"),
        payload_keys=len(payload.keys()),
    )
    return result
