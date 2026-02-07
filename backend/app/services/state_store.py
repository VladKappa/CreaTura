import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..db import AppState


def get_json_state(db: Session, key: str) -> dict[str, Any]:
    row = db.query(AppState).filter(AppState.key == key).first()
    if not row:
        return {"exists": False, "state": None, "updated_at": None}

    try:
        state = json.loads(row.value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Stored schedule state is invalid JSON.") from exc

    return {
        "exists": True,
        "state": state,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def put_json_state(db: Session, key: str, payload: dict[str, Any]) -> dict[str, Any]:
    # Motivatie:
    # Persistam tot workspace-ul UI ca JSON "snapshot" pentru a evita
    # schema migrations frecvente in faza de prototip.
    # Cand domeniul devine stabil, se poate trece la tabele normalizate.
    try:
        serialized = json.dumps(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Schedule state payload is not JSON serializable.") from exc

    row = db.query(AppState).filter(AppState.key == key).first()
    if row is None:
        row = AppState(key=key, value=serialized)
        db.add(row)
    else:
        row.value = serialized

    db.commit()
    db.refresh(row)
    return {"ok": True, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
