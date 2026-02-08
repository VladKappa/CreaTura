from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from .engine_types import AssignVars, BalanceContext, ObjectiveTerm
from .models import SolverRequest


def build_infeasible_response(
    warnings: list[dict],
    enabled_feature_toggles: list[str],
    infeasibility_reasons: list[dict],
) -> dict:
    return {
        "status": "infeasible",
        "reason_code": "infeasible_no_feasible_assignment",
        "reason": "No feasible assignment satisfies current hard constraints and coverage.",
        "infeasibility_reasons": infeasibility_reasons,
        "warnings": warnings,
        "objective": None,
        "assignments": [],
        "employee_load": [],
        "enabled_feature_toggles": enabled_feature_toggles,
        "objective_breakdown": {
            "reward_points": 0,
            "penalty_points": 0,
            "unsatisfied_count": 0,
            "items": [],
        },
        "unsatisfied_soft_constraints": [],
    }


def build_feasible_response(
    payload: SolverRequest,
    solver: cp_model.CpSolver,
    assign: AssignVars,
    status: int,
    warnings: list[dict],
    enabled_feature_toggles: list[str],
    objective_term_refs: list[ObjectiveTerm],
    balance_context: BalanceContext,
) -> tuple[dict, int]:
    assignments, employee_load, total_assigned_slots = _build_assignments(payload, solver, assign)
    objective_breakdown, unsatisfied_soft_constraints = _build_objective_breakdown(
        solver=solver,
        objective_term_refs=objective_term_refs,
        balance_context=balance_context,
    )

    status_text = "optimal" if status == cp_model.OPTIMAL else "feasible"
    response = {
        "status": status_text,
        "objective": int(solver.objective_value) if objective_term_refs else 0,
        "warnings": warnings,
        "assignments": assignments,
        "employee_load": employee_load,
        "enabled_feature_toggles": enabled_feature_toggles,
        "objective_breakdown": objective_breakdown,
        "unsatisfied_soft_constraints": unsatisfied_soft_constraints,
    }
    return response, total_assigned_slots


def _build_assignments(
    payload: SolverRequest,
    solver: cp_model.CpSolver,
    assign: AssignVars,
) -> tuple[list[dict], list[dict], int]:
    assignments = []
    employee_load_counter = defaultdict(int)

    for shift_idx, shift in enumerate(payload.shifts):
        assigned = []
        for employee_idx, employee in enumerate(payload.employees):
            if solver.value(assign[(employee_idx, shift_idx)]) == 1:
                assigned.append({"employee_id": employee.id, "employee_name": employee.name})
                employee_load_counter[employee.id] += 1

        assignments.append(
            {
                "day": shift.day,
                "date": shift.date,
                "type": shift.type,
                "start": shift.start,
                "end": shift.end,
                "required": shift.required,
                "assigned": assigned,
            }
        )

    employee_load = [
        {
            "employee_id": employee.id,
            "employee_name": employee.name,
            "assigned_count": employee_load_counter[employee.id],
        }
        for employee in payload.employees
    ]
    total_assigned_slots = sum(len(assignment["assigned"]) for assignment in assignments)
    return assignments, employee_load, total_assigned_slots


def _build_objective_breakdown(
    solver: cp_model.CpSolver,
    objective_term_refs: list[ObjectiveTerm],
    balance_context: BalanceContext,
) -> tuple[dict, list[dict]]:
    objective_items = []
    unsatisfied_soft_constraints = []
    reward_points = 0
    penalty_points = 0

    # Motivatie:
    # Returnam breakdown-ul obiectivului pentru a explica "de ce"
    # solutia are scorul curent. UI poate arata explicit ce reguli
    # soft au ramas nesatisfacute si ce impact au avut in punctaj.
    for ref in objective_term_refs:
        var_value = int(solver.value(ref["var"]))
        active = var_value > 0
        contribution = int(ref["coefficient"]) * var_value
        reward_points += max(0, contribution)
        penalty_points += min(0, contribution)

        constraint_type = ref["constraint_type"]
        if constraint_type == "prefer_assignment":
            status_label = "satisfied" if active else "unmet"
        elif constraint_type == "balance_worked_hours":
            status_label = "within_allowed_span" if not active else "over_allowed_span"
        else:
            status_label = "violated" if active else "satisfied"

        item = {
            "source": ref["source"],
            "constraint_type": constraint_type,
            "employee_id": ref["employee_id"],
            "employee_name": ref["employee_name"],
            "weight": ref["weight"],
            "status": status_label,
            "contribution": contribution,
            "active": active,
            "value": var_value,
        }
        if "shift" in ref:
            item["shift"] = ref["shift"]
        if "left_shift" in ref:
            item["left_shift"] = ref["left_shift"]
        if "right_shift" in ref:
            item["right_shift"] = ref["right_shift"]
        if "rest_minutes" in ref:
            item["rest_minutes"] = ref["rest_minutes"]
        if "required_rest_minutes" in ref:
            item["required_rest_minutes"] = ref["required_rest_minutes"]
        if constraint_type == "balance_worked_hours":
            item["excess_hours"] = var_value
            if balance_context.min_hours_var is not None:
                item["min_employee_hours"] = int(solver.value(balance_context.min_hours_var))
            if balance_context.max_hours_var is not None:
                item["max_employee_hours"] = int(solver.value(balance_context.max_hours_var))
            if balance_context.hours_span_var is not None:
                item["hours_span"] = int(solver.value(balance_context.hours_span_var))
            if balance_context.allowed_span_hours is not None:
                item["allowed_span_hours"] = balance_context.allowed_span_hours
            if balance_context.average_shift_duration_minutes is not None:
                item["average_shift_duration_minutes"] = balance_context.average_shift_duration_minutes

        objective_items.append(item)
        if status_label in ("unmet", "violated", "over_allowed_span"):
            unsatisfied_soft_constraints.append(item)

    objective_breakdown = {
        "reward_points": reward_points,
        "penalty_points": penalty_points,
        "unsatisfied_count": len(unsatisfied_soft_constraints),
        "items": objective_items,
    }
    return objective_breakdown, unsatisfied_soft_constraints

