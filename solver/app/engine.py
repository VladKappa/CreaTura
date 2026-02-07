from collections import defaultdict
from datetime import date
import math
import time

from fastapi import HTTPException
from ortools.sat.python import cp_model

from .models import HardConstraint, Shift, SoftConstraint, SolverRequest


def shift_matches_rule(shift: Shift, rule: HardConstraint | SoftConstraint) -> bool:
    if rule.date is not None and shift.date != rule.date:
        return False
    if rule.day is not None and shift.day != rule.day:
        return False
    if rule.shift_type is not None and shift.type != rule.shift_type:
        return False
    return True


def find_matching_shift_ids(shifts: list[Shift], rule: HardConstraint | SoftConstraint) -> list[int]:
    return [idx for idx, shift in enumerate(shifts) if shift_matches_rule(shift, rule)]


def parse_minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def shift_duration_minutes(shift: Shift) -> int:
    start = parse_minutes(shift.start)
    end = parse_minutes(shift.end)
    if end > start:
        return end - start
    if end < start:
        return end + (24 * 60) - start
    return 24 * 60


def shift_start_abs_minutes(shift: Shift, horizon_start_ord: int) -> int:
    day_offset = date.fromisoformat(shift.date).toordinal() - horizon_start_ord
    return day_offset * 24 * 60 + parse_minutes(shift.start)


def shift_end_abs_minutes(shift: Shift, horizon_start_ord: int) -> int:
    return shift_start_abs_minutes(shift, horizon_start_ord) + shift_duration_minutes(shift)


def shift_order_key(shift: Shift) -> tuple[int, int, str]:
    return (date.fromisoformat(shift.date).toordinal(), parse_minutes(shift.start), shift.type)


def solve_schedule_request(payload: SolverRequest, logger, request_id: str, started_at: float) -> dict:
    logger.info(
        "[%s] solve start horizon_start=%s days=%d employees=%d shifts=%d hard=%d soft=%d "
        "max_worktime_enabled=%s max_worktime_hours=%d "
        "min_rest_enabled=%s min_rest_hours=%d min_rest_weight=%d "
        "balance_worked_hours=%s balance_span_multiplier=%.2f balance_weight=%d",
        request_id,
        payload.horizon.start,
        payload.horizon.days,
        len(payload.employees),
        len(payload.shifts),
        len(payload.constraints.hard),
        len(payload.constraints.soft),
        payload.feature_toggles.max_worktime_in_row_enabled,
        payload.feature_toggles.max_worktime_in_row_hours,
        payload.feature_toggles.min_rest_after_shift_enabled,
        payload.feature_toggles.min_rest_after_shift_hours,
        payload.feature_toggles.min_rest_after_shift_weight,
        payload.feature_toggles.balance_worked_hours,
        payload.feature_toggles.balance_worked_hours_max_span_multiplier,
        payload.feature_toggles.balance_worked_hours_weight,
    )

    if not payload.employees:
        logger.warning("[%s] solve rejected: no employees", request_id)
        raise HTTPException(status_code=422, detail="At least one employee is required.")
    if not payload.shifts:
        logger.warning("[%s] solve rejected: no shifts", request_id)
        raise HTTPException(status_code=422, detail="At least one shift is required.")

    employee_ids = [employee.id for employee in payload.employees]
    if len(set(employee_ids)) != len(employee_ids):
        logger.warning("[%s] solve rejected: duplicate employee IDs", request_id)
        raise HTTPException(status_code=422, detail="Employee IDs must be unique.")

    for shift in payload.shifts:
        if shift.required > len(payload.employees):
            logger.warning(
                "[%s] solve rejected: shift '%s %s' required=%d > employees=%d",
                request_id,
                shift.date,
                shift.type,
                shift.required,
                len(payload.employees),
            )
            raise HTTPException(
                status_code=422,
                detail=f"Shift '{shift.date} {shift.type}' requires {shift.required} employees, "
                f"but only {len(payload.employees)} are available.",
            )

    employee_idx_by_id = {employee.id: idx for idx, employee in enumerate(payload.employees)}
    num_employees = len(payload.employees)
    num_shifts = len(payload.shifts)
    horizon_start_ord = date.fromisoformat(payload.horizon.start).toordinal()
    shift_durations = [shift_duration_minutes(shift) for shift in payload.shifts]
    shift_start_abs = [
        shift_start_abs_minutes(shift, horizon_start_ord) for shift in payload.shifts
    ]
    shift_end_abs = [start + duration for start, duration in zip(shift_start_abs, shift_durations)]
    min_desired_rest_minutes = payload.feature_toggles.min_rest_after_shift_hours * 60
    short_rest_penalty_weight = payload.feature_toggles.min_rest_after_shift_weight

    model = cp_model.CpModel()
    assign: dict[tuple[int, int], cp_model.IntVar] = {}
    for employee_idx in range(num_employees):
        for shift_idx in range(num_shifts):
            assign[(employee_idx, shift_idx)] = model.new_bool_var(f"a_e{employee_idx}_s{shift_idx}")

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

    # Motivatie:
    # "Max worktime in a row" limiteaza doar LANTUL de ture consecutive.
    # Un shift individual poate depasi pragul,
    # dar nu permitem sa fie lipit de alte ture daca lantul rezultat
    # depaseste limita configurata.
    # Implementare: construim ferestre consecutive (gap 0) si penalizam
    # doar ferestrele cu cel putin 2 ture care depasesc pragul.
    if payload.feature_toggles.max_worktime_in_row_enabled:
        max_worktime_minutes = payload.feature_toggles.max_worktime_in_row_hours * 60
        sorted_shift_indices = sorted(range(num_shifts), key=lambda idx: shift_order_key(payload.shifts[idx]))

        violating_windows: list[list[int]] = []
        for start_pos, start_shift_idx in enumerate(sorted_shift_indices):
            running_minutes = shift_durations[start_shift_idx]
            window = [start_shift_idx]

            for next_pos in range(start_pos + 1, len(sorted_shift_indices)):
                prev_shift_idx = sorted_shift_indices[next_pos - 1]
                next_shift_idx = sorted_shift_indices[next_pos]
                gap_minutes = shift_start_abs[next_shift_idx] - shift_end_abs[prev_shift_idx]
                if gap_minutes != 0:
                    break

                window.append(next_shift_idx)
                running_minutes += shift_durations[next_shift_idx]
                if len(window) >= 2 and running_minutes > max_worktime_minutes:
                    violating_windows.append(window.copy())

        for employee_idx in range(num_employees):
            for window in violating_windows:
                model.add(sum(assign[(employee_idx, shift_idx)] for shift_idx in window) <= len(window) - 1)

    warnings: list[str] = []
    enabled_feature_toggles: list[str] = []
    applied_default_rules: list[str] = []
    if payload.feature_toggles.max_worktime_in_row_enabled:
        applied_default_rules.append("max_worktime_in_row")
    if payload.feature_toggles.min_rest_after_shift_enabled:
        applied_default_rules.append("prefer_min_rest_after_shift")

    for hard in payload.constraints.hard:
        employee_idx = employee_idx_by_id.get(hard.employee_id)
        if employee_idx is None:
            logger.warning(
                "[%s] solve rejected: hard constraint unknown employee_id=%s",
                request_id,
                hard.employee_id,
            )
            raise HTTPException(
                status_code=422,
                detail=f"Hard constraint references unknown employee_id '{hard.employee_id}'.",
            )

        matching_shift_ids = find_matching_shift_ids(payload.shifts, hard)
        if not matching_shift_ids:
            warnings.append(
                f"No shifts matched hard constraint ({hard.type}) for employee_id '{hard.employee_id}'."
            )
            continue

        for shift_idx in matching_shift_ids:
            if hard.type == "forbid_shift":
                model.add(assign[(employee_idx, shift_idx)] == 0)
            elif hard.type == "require_shift":
                model.add(assign[(employee_idx, shift_idx)] == 1)

    objective_term_refs: list[dict] = []
    for soft in payload.constraints.soft:
        employee_idx = employee_idx_by_id.get(soft.employee_id)
        if employee_idx is None:
            logger.warning(
                "[%s] solve rejected: soft constraint unknown employee_id=%s",
                request_id,
                soft.employee_id,
            )
            raise HTTPException(
                status_code=422,
                detail=f"Soft constraint references unknown employee_id '{soft.employee_id}'.",
            )

        matching_shift_ids = find_matching_shift_ids(payload.shifts, soft)
        if not matching_shift_ids:
            warnings.append(
                f"No shifts matched soft constraint ({soft.type}) for employee_id '{soft.employee_id}'."
            )
            continue

        for shift_idx in matching_shift_ids:
            shift = payload.shifts[shift_idx]
            shift_meta = {
                "day": shift.day,
                "date": shift.date,
                "type": shift.type,
                "start": shift.start,
                "end": shift.end,
            }
            if soft.type == "prefer_assignment":
                objective_term_refs.append(
                    {
                        "var": assign[(employee_idx, shift_idx)],
                        "coefficient": soft.weight,
                        "source": "user_soft_constraint",
                        "constraint_type": soft.type,
                        "employee_id": payload.employees[employee_idx].id,
                        "employee_name": payload.employees[employee_idx].name,
                        "weight": soft.weight,
                        "shift": shift_meta,
                    }
                )
            elif soft.type == "avoid_assignment":
                objective_term_refs.append(
                    {
                        "var": assign[(employee_idx, shift_idx)],
                        "coefficient": -soft.weight,
                        "source": "user_soft_constraint",
                        "constraint_type": soft.type,
                        "employee_id": payload.employees[employee_idx].id,
                        "employee_name": payload.employees[employee_idx].name,
                        "weight": soft.weight,
                        "shift": shift_meta,
                    }
                )

    # Motivatie:
    # Pauza minima este modelata ca soft-constraint fiindca in realitate
    # poate aparea conflict cu cerintele hard de acoperire.
    # Cand apar conflicte, solverul penalizeaza perechile de ture apropiate
    # in loc sa declare instant problema infezabila.
    if payload.feature_toggles.min_rest_after_shift_enabled:
        short_rest_pairs = []
        for left_shift_idx in range(num_shifts):
            left_end = shift_end_abs[left_shift_idx]
            for right_shift_idx in range(num_shifts):
                if left_shift_idx == right_shift_idx:
                    continue
                right_start = shift_start_abs[right_shift_idx]
                rest_minutes = right_start - left_end
                if 0 <= rest_minutes < min_desired_rest_minutes:
                    short_rest_pairs.append((left_shift_idx, right_shift_idx, rest_minutes))

        for employee_idx in range(num_employees):
            for left_shift_idx, right_shift_idx, _ in short_rest_pairs:
                both_assigned = model.new_bool_var(
                    f"short_rest_e{employee_idx}_s{left_shift_idx}_s{right_shift_idx}"
                )
                model.add(both_assigned <= assign[(employee_idx, left_shift_idx)])
                model.add(both_assigned <= assign[(employee_idx, right_shift_idx)])
                model.add(
                    both_assigned
                    >= assign[(employee_idx, left_shift_idx)] + assign[(employee_idx, right_shift_idx)] - 1
                )
                left_shift = payload.shifts[left_shift_idx]
                right_shift = payload.shifts[right_shift_idx]
                rest_minutes = shift_start_abs[right_shift_idx] - shift_end_abs[left_shift_idx]
                objective_term_refs.append(
                    {
                        "var": both_assigned,
                        "coefficient": -short_rest_penalty_weight,
                        "source": "default_soft_constraint",
                        "constraint_type": "min_rest_after_shift",
                        "employee_id": payload.employees[employee_idx].id,
                        "employee_name": payload.employees[employee_idx].name,
                        "weight": short_rest_penalty_weight,
                        "rest_minutes": rest_minutes,
                        "required_rest_minutes": min_desired_rest_minutes,
                        "left_shift": {
                            "day": left_shift.day,
                            "date": left_shift.date,
                            "type": left_shift.type,
                            "start": left_shift.start,
                            "end": left_shift.end,
                        },
                        "right_shift": {
                            "day": right_shift.day,
                            "date": right_shift.date,
                            "type": right_shift.type,
                            "start": right_shift.start,
                            "end": right_shift.end,
                        },
                    }
                )

    balance_hours_span_var = None
    balance_min_hours_var = None
    balance_max_hours_var = None
    balance_allowed_span_hours = None
    balance_average_shift_duration_minutes = None
    if payload.feature_toggles.balance_worked_hours:
        enabled_feature_toggles.append("balance_worked_hours")
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

        balance_min_hours_var = model.new_int_var(0, max_hours_upper, "min_work_hours")
        balance_max_hours_var = model.new_int_var(0, max_hours_upper, "max_work_hours")
        model.add_min_equality(balance_min_hours_var, employee_work_hours)
        model.add_max_equality(balance_max_hours_var, employee_work_hours)

        balance_hours_span_var = model.new_int_var(0, max_hours_upper, "worked_hours_span")
        model.add(balance_hours_span_var == balance_max_hours_var - balance_min_hours_var)

        balance_average_shift_duration_minutes = total_shift_minutes / max(1, len(shift_durations))
        balance_allowed_span_hours = math.ceil(
            (
                balance_average_shift_duration_minutes
                * payload.feature_toggles.balance_worked_hours_max_span_multiplier
            )
            / 60
        )
        balance_allowed_span_hours = min(balance_allowed_span_hours, max_hours_upper)

        balance_excess_span_hours = model.new_int_var(0, max_hours_upper, "worked_hours_span_excess")
        model.add(balance_excess_span_hours >= balance_hours_span_var - balance_allowed_span_hours)
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
                "allowed_span_hours": balance_allowed_span_hours,
                "span_multiplier": payload.feature_toggles.balance_worked_hours_max_span_multiplier,
                "average_shift_duration_minutes": balance_average_shift_duration_minutes,
            }
        )

    if objective_term_refs:
        model.maximize(sum(ref["coefficient"] * ref["var"] for ref in objective_term_refs))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    solver.parameters.num_search_workers = 8
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        logger.info(
            "[%s] solve done status=infeasible elapsed_ms=%.1f warnings=%d",
            request_id,
            elapsed_ms,
            len(warnings),
        )
        return {
            "status": "infeasible",
            "reason": "No feasible assignment satisfies current hard constraints and coverage.",
            "warnings": warnings,
            "applied_defaults": applied_default_rules,
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

    # Motivatie:
    # Returnam breakdown-ul obiectivului pentru a explica "de ce"
    # solutia are scorul curent. UI poate arata explicit ce reguli
    # soft au ramas nesatisfacute si ce impact au avut in punctaj.
    objective_items = []
    unsatisfied_soft_constraints = []
    reward_points = 0
    penalty_points = 0

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
            if balance_min_hours_var is not None:
                item["min_employee_hours"] = int(solver.value(balance_min_hours_var))
            if balance_max_hours_var is not None:
                item["max_employee_hours"] = int(solver.value(balance_max_hours_var))
            if balance_hours_span_var is not None:
                item["hours_span"] = int(solver.value(balance_hours_span_var))
            if balance_allowed_span_hours is not None:
                item["allowed_span_hours"] = balance_allowed_span_hours
            if balance_average_shift_duration_minutes is not None:
                item["average_shift_duration_minutes"] = balance_average_shift_duration_minutes

        objective_items.append(item)
        if status_label in ("unmet", "violated", "over_allowed_span"):
            unsatisfied_soft_constraints.append(item)

    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    total_assigned_slots = sum(len(assignment["assigned"]) for assignment in assignments)
    status_text = "optimal" if status == cp_model.OPTIMAL else "feasible"
    logger.info(
        "[%s] solve done status=%s elapsed_ms=%.1f objective=%d assigned_slots=%d warnings=%d "
        "default_rules=%s feature_toggles=%s",
        request_id,
        status_text,
        elapsed_ms,
        int(solver.objective_value) if objective_term_refs else 0,
        total_assigned_slots,
        len(warnings),
        ",".join(applied_default_rules) if applied_default_rules else "none",
        ",".join(enabled_feature_toggles) if enabled_feature_toggles else "none",
    )

    return {
        "status": status_text,
        "objective": int(solver.objective_value) if objective_term_refs else 0,
        "warnings": warnings,
        "applied_defaults": applied_default_rules,
        "assignments": assignments,
        "employee_load": employee_load,
        "enabled_feature_toggles": enabled_feature_toggles,
        "objective_breakdown": {
            "reward_points": reward_points,
            "penalty_points": penalty_points,
            "unsatisfied_count": len(unsatisfied_soft_constraints),
            "items": objective_items,
        },
        "unsatisfied_soft_constraints": unsatisfied_soft_constraints,
    }
