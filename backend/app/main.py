from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .schemas import SolveRequest, SolveResponse
from .services.jobs import create_solve_job, list_solve_jobs
from .services.solver_proxy import solve_limits, solve_schedule as solve_schedule_payload
from .services.state_store import get_json_state, put_json_state


SCHEDULE_STATE_KEY = "schedule_ui_state_v1"

app = FastAPI(title="CreaTura Backend API")

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
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
async def solve(payload: SolveRequest, db: Session = Depends(get_db)):
    # Motivatie:
    # Endpoint-ul clasic (/solve) e pastrat pentru backward compatibility.
    # Fluxul real este:
    # UI/API -> proxy backend -> solver -> persist metadata job.
    result = await solve_limits(payload)
    row = create_solve_job(
        db=db,
        name=payload.name,
        objective=result["objective"],
        status=result["status"],
    )

    return SolveResponse(
        id=row.id,
        name=row.name,
        x=result["x"],
        y=result["y"],
        objective=row.objective,
        status=row.status,
    )


@app.post("/solve/schedule")
async def solve_schedule(payload: dict[str, Any]):
    return await solve_schedule_payload(payload)


@app.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    return list_solve_jobs(db)


@app.get("/state/schedule")
def get_schedule_state(db: Session = Depends(get_db)):
    return get_json_state(db, SCHEDULE_STATE_KEY)


@app.put("/state/schedule")
def put_schedule_state(payload: dict[str, Any], db: Session = Depends(get_db)):
    return put_json_state(db, SCHEDULE_STATE_KEY, payload)
