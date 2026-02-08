from __future__ import annotations

import math

from fastapi import HTTPException
from ortools.sat.python import cp_model

from .engine_types import AssignVars, BalanceContext, ObjectiveTerm
from .engine_utils import (
    build_minimal_qualifying_chain_by_left,
    compute_max_worktime_violating_windows,
    find_matching_shift_ids,
    shift_order_key,
    shift_to_meta,
)
from .logging_utils import log_event
from .models import SolverRequest


def build_assignment_variables(
    model: cp_model.CpModel,
    num_employees: int,
    num_shifts: int,
) -> AssignVars:
    assign: AssignVars = {}
    for employee_idx in range(num_employees):
        for shift_idx in range(num_shifts):
            assign[(employee_idx, shift_idx)] = model.new_bool_var(f"a_e{employee_idx}_s{shift_idx}")
    return assign


def add_shift_coverage_constraints(
    model: cp_model.CpModel,
    assign: AssignVars,
    payload: SolverRequest,
    num_employees: int,
) -> None:
    # Motivatie:
    # Modelam acoperirea ca restrictie hard, nu ca obiectiv.
    # Astfel, solverul cauta doar orare unde fiecare tura are exact
    # numarul cerut de oameni, iar preferintele influenteaza doar
    # alegerea dintre solutiile deja fezabile.
    for shift_idx, shift in enumerate(payload.shifts):
        model.add(
            sum(assign[(employee_idx, shift_idx)] for employee_idx in range(num_employees))
            == shift.required
        )


def collect_enabled_feature_toggles(payload: SolverRequest) -> list[str]:
    enabled_feature_toggles: list[str] = []
    if payload.feature_toggles.max_worktime_in_row_enabled:
        enabled_feature_toggles.append("max_worktime_in_row")
    if payload.feature_toggles.min_rest_after_shift_hard_enabled:
        enabled_feature_toggles.append("min_rest_after_shift_hard")
    if payload.feature_toggles.min_rest_after_shift_soft_enabled:
        enabled_feature_toggles.append("min_rest_after_shift_soft")
    if payload.feature_toggles.balance_worked_hours:
        enabled_feature_toggles.append("balance_worked_hours")
    return enabled_feature_toggles


def apply_max_worktime_constraints(
    payload: SolverRequest,
    model: cp_model.CpModel,
    assign: AssignVars,
    num_employees: int,
    shift_start_abs: list[int],
    shift_end_abs: list[int],
    shift_durations: list[int],
) -> list[list[int]]:
    violating_windows: list[list[int]] = []
    if not payload.feature_toggles.max_worktime_in_row_enabled:
        return violating_windows

    # Motivatie:
    # "Max worktime in a row" limiteaza doar LANTUL de ture consecutive.
    # Un shift individual poate depasi pragul,
    # dar nu permitem sa fie lipit de alte ture daca lantul rezultat
    # depaseste limita configurata.
    violating_windows = compute_max_worktime_violating_windows(
        payload,
        shift_start_abs,
        shift_end_abs,
        shift_durations,
    )

    for employee_idx in range(num_employees):
        for window in violating_windows:
            model.add(sum(assign[(employee_idx, shift_idx)] for shift_idx in window) <= len(window) - 1)

    return violating_windows


def apply_hard_constraints(
    payload: SolverRequest,
    model: cp_model.CpModel,
    assign: AssignVars,
    employee_idx_by_id: dict[str, int],
    warnings: list[dict],
    logger,
    request_id: str,
) -> None:
    for hard in payload.constraints.hard:
        employee_idx = employee_idx_by_id.get(hard.employee_id)
        if employee_idx is None:
            log_event(
                logger,
                "WARN",
                "solve.request.rejected",
                request_id=request_id,
                reason="hard_constraint_unknown_employee",
                employee_id=hard.employee_id,
            )
            raise HTTPException(
                status_code=422,
                detail=f"Hard constraint references unknown employee_id '{hard.employee_id}'.",
            )

        matching_shift_ids = find_matching_shift_ids(payload.shifts, hard)
        if not matching_shift_ids:
            warnings.append(
                {
                    "code": "no_matching_shift_for_hard_constraint",
                    "constraint_type": hard.type,
                    "employee_id": hard.employee_id,
                }
            )
            continue

        for shift_idx in matching_shift_ids:
            if hard.type == "forbid_shift":
                model.add(assign[(employee_idx, shift_idx)] == 0)
            elif hard.type == "require_shift":
                model.add(assign[(employee_idx, shift_idx)] == 1)


def apply_user_soft_constraints(
    payload: SolverRequest,
    assign: AssignVars,
    employee_idx_by_id: dict[str, int],
    objective_term_refs: list[ObjectiveTerm],
    warnings: list[dict],
    logger,
    request_id: str,
) -> None:
    for soft in payload.constraints.soft:
        employee_idx = employee_idx_by_id.get(soft.employee_id)
        if employee_idx is None:
            log_event(
                logger,
                "WARN",
                "solve.request.rejected",
                request_id=request_id,
                reason="soft_constraint_unknown_employee",
                employee_id=soft.employee_id,
            )
            raise HTTPException(
                status_code=422,
                detail=f"Soft constraint references unknown employee_id '{soft.employee_id}'.",
            )

        matching_shift_ids = find_matching_shift_ids(payload.shifts, soft)
        if not matching_shift_ids:
            warnings.append(
                {
                    "code": "no_matching_shift_for_soft_constraint",
                    "constraint_type": soft.type,
                    "employee_id": soft.employee_id,
                }
            )
            continue

        for shift_idx in matching_shift_ids:
            shift = payload.shifts[shift_idx]
            coefficient = soft.weight if soft.type == "prefer_assignment" else -soft.weight
            objective_term_refs.append(
                {
                    "var": assign[(employee_idx, shift_idx)],
                    "coefficient": coefficient,
                    "source": "user_soft_constraint",
                    "constraint_type": soft.type,
                    "employee_id": payload.employees[employee_idx].id,
                    "employee_name": payload.employees[employee_idx].name,
                    "weight": soft.weight,
                    "shift": shift_to_meta(shift),
                }
            )


def apply_min_rest_constraints(
    payload: SolverRequest,
    model: cp_model.CpModel,
    assign: AssignVars,
    num_employees: int,
    num_shifts: int,
    shift_start_abs: list[int],
    shift_end_abs: list[int],
    shift_durations: list[int],
    objective_term_refs: list[ObjectiveTerm],
) -> None:
    min_rest_hard_enabled = payload.feature_toggles.min_rest_after_shift_hard_enabled
    min_rest_soft_enabled = payload.feature_toggles.min_rest_after_shift_soft_enabled
    if not (min_rest_hard_enabled or min_rest_soft_enabled):
        return

    min_hard_rest_minutes = payload.feature_toggles.min_rest_after_shift_hard_hours * 60
    min_soft_rest_minutes = payload.feature_toggles.min_rest_after_shift_soft_hours * 60
    short_rest_penalty_weight = payload.feature_toggles.min_rest_after_shift_soft_weight
    max_chain_for_rest_minutes = payload.feature_toggles.max_worktime_in_row_hours * 60
    sorted_shift_indices = sorted(range(num_shifts), key=lambda idx: shift_order_key(payload.shifts[idx]))

    # Motivatie:
    # Regulile de "minimum rest gap" se aplica doar dupa ce un angajat a atins
    # pragul de "max worktime in a row" pe lantul curent de ture consecutive.
    # Avem doua variante:
    # - hard: combinatia devine interzisa;
    # - soft: combinatia e permisa, dar penalizata in obiectiv.
    minimal_chain_by_left = build_minimal_qualifying_chain_by_left(
        sorted_shift_indices=sorted_shift_indices,
        shift_start_abs=shift_start_abs,
        shift_end_abs=shift_end_abs,
        shift_durations=shift_durations,
        max_chain_minutes=max_chain_for_rest_minutes,
    )

    hard_short_rest_pairs = []
    soft_short_rest_pairs = []
    for left_shift_idx in range(num_shifts):
        left_end = shift_end_abs[left_shift_idx]
        for right_shift_idx in range(num_shifts):
            if left_shift_idx == right_shift_idx:
                continue
            right_start = shift_start_abs[right_shift_idx]
            rest_minutes = right_start - left_end
            if rest_minutes < 0:
                continue
            if min_rest_hard_enabled and rest_minutes < min_hard_rest_minutes:
                hard_short_rest_pairs.append((left_shift_idx, right_shift_idx, rest_minutes))
            if min_rest_soft_enabled and rest_minutes < min_soft_rest_minutes:
                soft_short_rest_pairs.append((left_shift_idx, right_shift_idx, rest_minutes))

    for employee_idx in range(num_employees):
        reached_max_chain_by_left: dict[int, cp_model.IntVar] = {}
        for left_shift_idx, minimal_chain in minimal_chain_by_left.items():
            reached_max_chain = model.new_bool_var(f"max_chain_reached_e{employee_idx}_left{left_shift_idx}")
            for shift_idx in minimal_chain:
                model.add(reached_max_chain <= assign[(employee_idx, shift_idx)])
            model.add(
                reached_max_chain
                >= sum(assign[(employee_idx, shift_idx)] for shift_idx in minimal_chain)
                - len(minimal_chain)
                + 1
            )
            reached_max_chain_by_left[left_shift_idx] = reached_max_chain

        # Hard minimum rest: daca lantul a atins pragul, urmatoarea tura
        # cu pauza insuficienta devine interzisa.
        for left_shift_idx, right_shift_idx, _ in hard_short_rest_pairs:
            reached_max_chain = reached_max_chain_by_left.get(left_shift_idx)
            if reached_max_chain is None:
                continue
            model.add(reached_max_chain + assign[(employee_idx, right_shift_idx)] <= 1)

        # Soft minimum rest: pastram aceeasi logica, dar cu penalizare.
        for left_shift_idx, right_shift_idx, rest_minutes in soft_short_rest_pairs:
            reached_max_chain = reached_max_chain_by_left.get(left_shift_idx)
            if reached_max_chain is None:
                continue

            short_rest_after_max_chain = model.new_bool_var(
                f"short_rest_after_max_e{employee_idx}_s{left_shift_idx}_s{right_shift_idx}"
            )
            model.add(short_rest_after_max_chain <= reached_max_chain)
            model.add(short_rest_after_max_chain <= assign[(employee_idx, right_shift_idx)])
            model.add(
                short_rest_after_max_chain
                >= reached_max_chain + assign[(employee_idx, right_shift_idx)] - 1
            )

            left_shift = payload.shifts[left_shift_idx]
            right_shift = payload.shifts[right_shift_idx]
            objective_term_refs.append(
                {
                    "var": short_rest_after_max_chain,
                    "coefficient": -short_rest_penalty_weight,
                    "source": "feature_toggle",
                    "constraint_type": "min_rest_after_shift",
                    "employee_id": payload.employees[employee_idx].id,
                    "employee_name": payload.employees[employee_idx].name,
                    "weight": short_rest_penalty_weight,
                    "rest_minutes": rest_minutes,
                    "required_rest_minutes": min_soft_rest_minutes,
                    "left_shift": shift_to_meta(left_shift),
                    "right_shift": shift_to_meta(right_shift),
                }
            )


def apply_balance_worked_hours_constraint(
    payload: SolverRequest,
    model: cp_model.CpModel,
    assign: AssignVars,
    num_employees: int,
    num_shifts: int,
    shift_durations: list[int],
    objective_term_refs: list[ObjectiveTerm],
) -> BalanceContext:
    context = BalanceContext()
    if not payload.feature_toggles.balance_worked_hours:
        return context

    total_shift_minutes = sum(shift_durations)
    max_hours_upper = max(1, (total_shift_minutes + 59) // 60)
    employee_work_hours = []

    for employee_idx in range(num_employees):
        work_minutes = model.new_int_var(0, total_shift_minutes, f"work_minutes_e{employee_idx}")
        model.add(
            work_minutes
            == sum(
                shift_durations[shift_idx] * assign[(employee_idx, shift_idx)]
                for shift_idx in range(num_shifts)
            )
        )

        work_hours = model.new_int_var(0, max_hours_upper, f"work_hours_e{employee_idx}")
        model.add_division_equality(work_hours, work_minutes, 60)
        employee_work_hours.append(work_hours)

    context.min_hours_var = model.new_int_var(0, max_hours_upper, "min_work_hours")
    context.max_hours_var = model.new_int_var(0, max_hours_upper, "max_work_hours")
    model.add_min_equality(context.min_hours_var, employee_work_hours)
    model.add_max_equality(context.max_hours_var, employee_work_hours)

    context.hours_span_var = model.new_int_var(0, max_hours_upper, "worked_hours_span")
    model.add(context.hours_span_var == context.max_hours_var - context.min_hours_var)

    context.average_shift_duration_minutes = total_shift_minutes / max(1, len(shift_durations))
    context.allowed_span_hours = math.ceil(
        (
            context.average_shift_duration_minutes
            * payload.feature_toggles.balance_worked_hours_max_span_multiplier
        )
        / 60
    )
    context.allowed_span_hours = min(context.allowed_span_hours, max_hours_upper)

    balance_excess_span_hours = model.new_int_var(0, max_hours_upper, "worked_hours_span_excess")
    model.add(balance_excess_span_hours >= context.hours_span_var - context.allowed_span_hours)
    model.add(balance_excess_span_hours >= 0)

    objective_term_refs.append(
        {
            "var": balance_excess_span_hours,
            "coefficient": -payload.feature_toggles.balance_worked_hours_weight,
            "source": "feature_toggle",
            "constraint_type": "balance_worked_hours",
            "employee_id": "all",
            "employee_name": "All employees",
            "weight": payload.feature_toggles.balance_worked_hours_weight,
            "allowed_span_hours": context.allowed_span_hours,
            "span_multiplier": payload.feature_toggles.balance_worked_hours_max_span_multiplier,
            "average_shift_duration_minutes": context.average_shift_duration_minutes,
        }
    )

    return context


def apply_objective(model: cp_model.CpModel, objective_term_refs: list[ObjectiveTerm]) -> None:
    if not objective_term_refs:
        return
    model.maximize(sum(ref["coefficient"] * ref["var"] for ref in objective_term_refs))

