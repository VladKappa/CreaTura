import os
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, SolveJob, engine
from .schemas import SolveRequest, SolveResponse


SOLVER_URL = os.getenv("SOLVER_URL", "http://solver:9000")

app = FastAPI(title="Backend API")

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
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            solver_resp = await client.post(
                f"{SOLVER_URL}/solve",
                json={"x_max": payload.x_max, "y_max": payload.y_max},
            )
            solver_resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Solver unavailable: {exc}") from exc

    result = solver_resp.json()

    row = SolveJob(
        name=payload.name,
        objective=result["objective"],
        status=result["status"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

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
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            solver_resp = await client.post(f"{SOLVER_URL}/solve", json=payload)
            solver_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Solver rejected request."
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Solver unavailable: {exc}") from exc

    return solver_resp.json()


@app.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    rows = db.query(SolveJob).order_by(SolveJob.id.desc()).all()
    return [
        {"id": row.id, "name": row.name, "objective": row.objective, "status": row.status}
        for row in rows
    ]
