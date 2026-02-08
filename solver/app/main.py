import time
from uuid import uuid4

from fastapi import FastAPI, Request

from .engine import solve_schedule_request
from .logging_utils import get_logger, log_event
from .models import SolverRequest


app = FastAPI(title="CreaTura Solver Service")
logger = get_logger()


@app.get("/health")
def health():
    log_event(logger, "INFO", "health.check")
    return {"status": "ok"}


@app.post("/solve")
def solve(payload: SolverRequest, request: Request):
    request_id = request.headers.get("X-Request-Id") or uuid4().hex[:8]
    started_at = time.perf_counter()
    log_event(
        logger,
        "INFO",
        "solve.request.received",
        request_id=request_id,
        employees=len(payload.employees),
        shifts=len(payload.shifts),
        hard=len(payload.constraints.hard),
        soft=len(payload.constraints.soft),
    )
    return solve_schedule_request(payload, logger, request_id, started_at)
