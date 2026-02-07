import logging
import time
from uuid import uuid4

from fastapi import FastAPI

from .engine import solve_schedule_request
from .models import SolverRequest


app = FastAPI(title="CreaTura Solver Service")
logger = logging.getLogger("uvicorn.error")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/solve")
def solve(payload: SolverRequest):
    request_id = uuid4().hex[:8]
    started_at = time.perf_counter()
    return solve_schedule_request(payload, logger, request_id, started_at)
