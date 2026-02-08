import os
import time
from typing import Any

import httpx
from fastapi import HTTPException

from ..logging_utils import get_logger, log_event

SOLVER_URL = os.getenv("SOLVER_URL", "http://solver:9000")
logger = get_logger()


async def _post_to_solver(
    path: str,
    payload: dict[str, Any],
    timeout_seconds: float,
    request_id: str | None = None,
) -> dict[str, Any]:
    # Motivatie:
    # Centralizam comunicarea cu solverul intr-un singur loc ca sa avem:
    # 1) timeout-uri consistente,
    # 2) mapare unitara a erorilor HTTP catre API-ul backend,
    # 3) un punct unic de modificare daca schimbam protocolul.
    started_at = time.perf_counter()
    request_id_value = request_id or "n/a"
    log_event(
        logger,
        "INFO",
        "solver_proxy.forward.start",
        request_id=request_id_value,
        path=path,
        timeout_seconds=timeout_seconds,
    )
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        try:
            solver_resp = await client.post(
                f"{SOLVER_URL}{path}",
                json=payload,
                headers={"X-Request-Id": request_id_value},
            )
            solver_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Solver rejected request."
            elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
            log_event(
                logger,
                "WARN",
                "solver_proxy.forward.rejected",
                request_id=request_id_value,
                path=path,
                status_code=exc.response.status_code,
                elapsed_us=elapsed_us,
                detail=detail,
            )
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:
            elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
            log_event(
                logger,
                "ERROR",
                "solver_proxy.forward.error",
                request_id=request_id_value,
                path=path,
                elapsed_us=elapsed_us,
                error=str(exc),
            )
            raise HTTPException(status_code=502, detail=f"Solver unavailable: {exc}") from exc
    elapsed_us = int((time.perf_counter() - started_at) * 1_000_000)
    log_event(
        logger,
        "INFO",
        "solver_proxy.forward.done",
        request_id=request_id_value,
        path=path,
        status_code=solver_resp.status_code,
        elapsed_us=elapsed_us,
    )
    return solver_resp.json()


async def solve_schedule(payload: dict[str, Any], request_id: str | None = None) -> dict[str, Any]:
    return await _post_to_solver("/solve", payload, timeout_seconds=60.0, request_id=request_id)
