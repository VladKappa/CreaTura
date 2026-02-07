from sqlalchemy.orm import Session

from ..db import SolveJob


def create_solve_job(db: Session, name: str, objective: int, status: str) -> SolveJob:
    row = SolveJob(name=name, objective=objective, status=status)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_solve_jobs(db: Session) -> list[dict]:
    rows = db.query(SolveJob).order_by(SolveJob.id.desc()).all()
    return [{"id": row.id, "name": row.name, "objective": row.objective, "status": row.status} for row in rows]
