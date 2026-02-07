import os
from typing import Any

import httpx
from fastapi import HTTPException

from ..schemas import SolveRequest


SOLVER_URL = os.getenv("SOLVER_URL", "http://solver:9000")


async def _post_to_solver(path: str, payload: dict[str, Any], timeout_seconds: float) -> dict[str, Any]:
    # Motivatie:
    # Centralizam comunicarea cu solverul intr-un singur loc ca sa avem:
    # 1) timeout-uri consistente,
    # 2) mapare unitara a erorilor HTTP catre API-ul backend,
    # 3) un punct unic de modificare daca schimbam protocolul.
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        try:
            solver_resp = await client.post(f"{SOLVER_URL}{path}", json=payload)
            solver_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Solver rejected request."
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Solver unavailable: {exc}") from exc
    return solver_resp.json()


async def solve_limits(payload: SolveRequest) -> dict[str, Any]:
    return await _post_to_solver(
        "/solve",
        {"x_max": payload.x_max, "y_max": payload.y_max},
        timeout_seconds=20.0,
    )


async def solve_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    return await _post_to_solver("/solve", payload, timeout_seconds=60.0)
