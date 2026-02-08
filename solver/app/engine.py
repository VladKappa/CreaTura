from __future__ import annotations

from datetime import date
import time

from ortools.sat.python import cp_model

from .engine_constraints import (
    add_shift_coverage_constraints,
    apply_balance_worked_hours_constraint,
    apply_hard_constraints,
    apply_max_worktime_constraints,
    apply_min_rest_constraints,
    apply_objective,
    apply_user_soft_constraints,
    build_assignment_variables,
    collect_enabled_feature_toggles,
)
from .engine_diagnostics import infer_infeasibility_reasons
from .engine_results import build_feasible_response, build_infeasible_response
from .engine_utils import shift_duration_minutes, shift_start_abs_minutes
from .engine_validation import validate_solver_request
from .logging_utils import log_event
from .models import SolverRequest


def solve_schedule_request(payload: SolverRequest, logger, request_id: str, started_at: float) -> dict:
    min_rest_hard_enabled = payload.feature_toggles.min_rest_after_shift_hard_enabled
    min_rest_hard_hours = payload.feature_toggles.min_rest_after_shift_hard_hours
    min_rest_soft_enabled = payload.feature_toggles.min_rest_after_shift_soft_enabled
    min_rest_soft_hours = payload.feature_toggles.min_rest_after_shift_soft_hours
    min_rest_soft_weight = payload.feature_toggles.min_rest_after_shift_soft_weight

    log_event(
        logger,
        "INFO",
        "solve.request.start",
        request_id=request_id,
        horizon_start=payload.horizon.start,
        days=payload.horizon.days,
        employees=len(payload.employees),
        shifts=len(payload.shifts),
        hard=len(payload.constraints.hard),
        soft=len(payload.constraints.soft),
        max_worktime_enabled=payload.feature_toggles.max_worktime_in_row_enabled,
        max_worktime_hours=payload.feature_toggles.max_worktime_in_row_hours,
        min_rest_hard_enabled=min_rest_hard_enabled,
        min_rest_hard_hours=min_rest_hard_hours,
        min_rest_soft_enabled=min_rest_soft_enabled,
        min_rest_soft_hours=min_rest_soft_hours,
        min_rest_soft_weight=min_rest_soft_weight,
        balance_worked_hours=payload.feature_toggles.balance_worked_hours,
        balance_span_multiplier=payload.feature_toggles.balance_worked_hours_max_span_multiplier,
        balance_weight=payload.feature_toggles.balance_worked_hours_weight,
    )

    # Etapa 1: validam datele de intrare inainte sa construim modelul.
    # Daca aici avem problema (de ex. employee_id duplicat), iesim rapid
    # cu eroare 422 ca sa nu "consumam" timp in solver.
    validate_solver_request(payload=payload, logger=logger, request_id=request_id)

    # Etapa 2: pregatim structuri numerice simple (indici + minute absolute)
    # care sunt usor de folosit in CP-SAT pentru reguli de timp.
    employee_idx_by_id = {employee.id: idx for idx, employee in enumerate(payload.employees)}
    num_employees = len(payload.employees)
    num_shifts = len(payload.shifts)
    horizon_start_ord = date.fromisoformat(payload.horizon.start).toordinal()
    shift_durations = [shift_duration_minutes(shift) for shift in payload.shifts]
    shift_start_abs = [
        shift_start_abs_minutes(shift, horizon_start_ord) for shift in payload.shifts
    ]
    shift_end_abs = [start + duration for start, duration in zip(shift_start_abs, shift_durations)]

    # Etapa 3: construim modelul CP-SAT.
    # "assign[(e, s)] = 1" inseamna ca employee e este atribuit pe shift s.
    model = cp_model.CpModel()
    assign = build_assignment_variables(
        model=model,
        num_employees=num_employees,
        num_shifts=num_shifts,
    )

    add_shift_coverage_constraints(
        model=model,
        assign=assign,
        payload=payload,
        num_employees=num_employees,
    )

    violating_windows = apply_max_worktime_constraints(
        payload=payload,
        model=model,
        assign=assign,
        num_employees=num_employees,
        shift_start_abs=shift_start_abs,
        shift_end_abs=shift_end_abs,
        shift_durations=shift_durations,
    )

    warnings: list[dict] = []
    enabled_feature_toggles = collect_enabled_feature_toggles(payload)
    objective_term_refs = []

    apply_hard_constraints(
        payload=payload,
        model=model,
        assign=assign,
        employee_idx_by_id=employee_idx_by_id,
        warnings=warnings,
        logger=logger,
        request_id=request_id,
    )

    apply_user_soft_constraints(
        payload=payload,
        assign=assign,
        employee_idx_by_id=employee_idx_by_id,
        objective_term_refs=objective_term_refs,
        warnings=warnings,
        logger=logger,
        request_id=request_id,
    )

    apply_min_rest_constraints(
        payload=payload,
        model=model,
        assign=assign,
        num_employees=num_employees,
        num_shifts=num_shifts,
        shift_start_abs=shift_start_abs,
        shift_end_abs=shift_end_abs,
        shift_durations=shift_durations,
        objective_term_refs=objective_term_refs,
    )

    balance_context = apply_balance_worked_hours_constraint(
        payload=payload,
        model=model,
        assign=assign,
        num_employees=num_employees,
        num_shifts=num_shifts,
        shift_durations=shift_durations,
        objective_term_refs=objective_term_refs,
    )

    apply_objective(model=model, objective_term_refs=objective_term_refs)

    # Etapa 4: rulam solverul si construim raspunsul API
    # (infezabil / fezabil + diagnostice).
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    solver.parameters.num_search_workers = 8
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        infeasibility_reasons = infer_infeasibility_reasons(
            payload=payload,
            num_employees=num_employees,
            max_worktime_violating_windows=violating_windows,
        )
        log_event(
            logger,
            "INFO",
            "solve.request.done",
            request_id=request_id,
            status="infeasible",
            elapsed_us=int(elapsed_ms * 1000),
            warnings=len(warnings),
            inferred_reasons=len(infeasibility_reasons),
        )
        return build_infeasible_response(
            warnings=warnings,
            enabled_feature_toggles=enabled_feature_toggles,
            infeasibility_reasons=infeasibility_reasons,
        )

    response, total_assigned_slots = build_feasible_response(
        payload=payload,
        solver=solver,
        assign=assign,
        status=status,
        warnings=warnings,
        enabled_feature_toggles=enabled_feature_toggles,
        objective_term_refs=objective_term_refs,
        balance_context=balance_context,
    )

    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    log_event(
        logger,
        "INFO",
        "solve.request.done",
        request_id=request_id,
        status=response["status"],
        elapsed_us=int(elapsed_ms * 1000),
        objective=response["objective"],
        assigned_slots=total_assigned_slots,
        warnings=len(warnings),
        feature_toggles=enabled_feature_toggles,
    )
    return response
