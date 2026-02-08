from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .services.solver_proxy import solve_schedule as solve_schedule_payload
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


@app.post("/solve/schedule")
async def solve_schedule(payload: dict[str, Any]):
    return await solve_schedule_payload(payload)


@app.get("/state/schedule")
def get_schedule_state(db: Session = Depends(get_db)):
    return get_json_state(db, SCHEDULE_STATE_KEY)


@app.put("/state/schedule")
def put_schedule_state(payload: dict[str, Any], db: Session = Depends(get_db)):
    return put_json_state(db, SCHEDULE_STATE_KEY, payload)
