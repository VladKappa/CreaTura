from __future__ import annotations

from fastapi import HTTPException

from .logging_utils import log_event
from .models import SolverRequest


def validate_solver_request(payload: SolverRequest, logger, request_id: str) -> None:
    if not payload.employees:
        log_event(logger, "WARN", "solve.request.rejected", request_id=request_id, reason="no_employees")
        raise HTTPException(status_code=422, detail="At least one employee is required.")

    if not payload.shifts:
        log_event(logger, "WARN", "solve.request.rejected", request_id=request_id, reason="no_shifts")
        raise HTTPException(status_code=422, detail="At least one shift is required.")

    employee_ids = [employee.id for employee in payload.employees]
    if len(set(employee_ids)) != len(employee_ids):
        log_event(
            logger,
            "WARN",
            "solve.request.rejected",
            request_id=request_id,
            reason="duplicate_employee_ids",
        )
        raise HTTPException(status_code=422, detail="Employee IDs must be unique.")

    for shift in payload.shifts:
        if shift.required > len(payload.employees):
            log_event(
                logger,
                "WARN",
                "solve.request.rejected",
                request_id=request_id,
                reason="required_exceeds_available_employees",
                shift_date=shift.date,
                shift_type=shift.type,
                required=shift.required,
                employees=len(payload.employees),
            )
            raise HTTPException(
                status_code=422,
                detail=f"Shift '{shift.date} {shift.type}' requires {shift.required} employees, "
                f"but only {len(payload.employees)} are available.",
            )

