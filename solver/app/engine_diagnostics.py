from __future__ import annotations

from collections import defaultdict
from datetime import date
import json

from .engine_utils import (
    build_minimal_qualifying_chain_by_left,
    find_matching_shift_ids,
    shift_duration_minutes,
    shift_label,
    shift_order_key,
    shift_start_abs_minutes,
    shift_to_meta,
)
from .models import SolverRequest


def infer_infeasibility_reasons(
    payload: SolverRequest,
    num_employees: int,
    max_worktime_violating_windows: list[list[int]],
) -> list[dict]:
    reasons: list[dict] = []
    employee_name_by_id = {employee.id: employee.name for employee in payload.employees}

    def add_reason(code: str, message: str, **data) -> None:
        reasons.append(
            {
                "code": code,
                "message": message,
                **data,
            }
        )

    hard_require_by_shift = [set() for _ in payload.shifts]
    hard_forbid_by_shift = [set() for _ in payload.shifts]
    hard_require_by_employee: dict[str, set[int]] = defaultdict(set)

    for hard in payload.constraints.hard:
        matching_shift_ids = find_matching_shift_ids(payload.shifts, hard)
        for shift_idx in matching_shift_ids:
            if hard.type == "require_shift":
                hard_require_by_shift[shift_idx].add(hard.employee_id)
                hard_require_by_employee[hard.employee_id].add(shift_idx)
            elif hard.type == "forbid_shift":
                hard_forbid_by_shift[shift_idx].add(hard.employee_id)

    for shift_idx, shift in enumerate(payload.shifts):
        required_ids = hard_require_by_shift[shift_idx]
        forbidden_ids = hard_forbid_by_shift[shift_idx]
        overlap = required_ids & forbidden_ids
        if overlap:
            overlap_names = ", ".join(
                employee_name_by_id.get(employee_id, employee_id) for employee_id in sorted(overlap)
            )
            add_reason(
                "hard_conflict_required_and_forbidden",
                f"{shift_label(shift)}: same employee(s) are both required and forbidden ({overlap_names}).",
                shift=shift_to_meta(shift),
                employee_names=overlap_names,
            )

        if len(required_ids) > shift.required:
            add_reason(
                "hard_required_exceeds_shift_coverage",
                f"{shift_label(shift)}: {len(required_ids)} hard-required employee(s) exceed required coverage {shift.required}.",
                shift=shift_to_meta(shift),
                hard_required_count=len(required_ids),
                required_coverage=shift.required,
            )

        allowed_employees = num_employees - len(forbidden_ids)
        if shift.required > allowed_employees:
            add_reason(
                "coverage_exceeds_available_after_forbids",
                f"{shift_label(shift)}: required coverage {shift.required} exceeds available employees {allowed_employees} after forbids.",
                shift=shift_to_meta(shift),
                required_coverage=shift.required,
                available_employees=allowed_employees,
            )

    if payload.feature_toggles.max_worktime_in_row_enabled:
        for window in max_worktime_violating_windows:
            window_required = sum(payload.shifts[shift_idx].required for shift_idx in window)
            window_capacity = num_employees * (len(window) - 1)
            if window_required > window_capacity:
                window_preview = ", ".join(shift_label(payload.shifts[shift_idx]) for shift_idx in window[:3])
                if len(window) > 3:
                    window_preview += f", ... ({len(window)} shifts)"
                add_reason(
                    "max_worktime_window_capacity_conflict",
                    f"Max-worktime window [{window_preview}] needs {window_required} assignments, but rule allows at most {window_capacity}.",
                    window_preview=window_preview,
                    required_assignments=window_required,
                    allowed_assignments=window_capacity,
                )

            for employee in payload.employees:
                required_count = sum(
                    1 for shift_idx in window if shift_idx in hard_require_by_employee.get(employee.id, set())
                )
                if required_count > len(window) - 1:
                    window_preview = ", ".join(
                        shift_label(payload.shifts[shift_idx]) for shift_idx in window[:3]
                    )
                    if len(window) > 3:
                        window_preview += f", ... ({len(window)} shifts)"
                    add_reason(
                        "max_worktime_window_employee_overrequired",
                        f"{employee.name} is hard-required on {required_count} shifts inside max-worktime window [{window_preview}], exceeding allowed {len(window) - 1}.",
                        employee_id=employee.id,
                        employee_name=employee.name,
                        hard_required_count=required_count,
                        allowed_assignments=len(window) - 1,
                        window_preview=window_preview,
                    )

    # Motivatie:
    # Cand regula de repaus hard este activa, vrem un indiciu explicit daca
    # infezabilitatea vine din "require" care forteaza un lant + o tura urmatoare
    # cu pauza mai mica decat minimul configurat.
    if payload.feature_toggles.min_rest_after_shift_hard_enabled:
        min_rest_hard_hours = payload.feature_toggles.min_rest_after_shift_hard_hours
        min_rest_hard_minutes = min_rest_hard_hours * 60
        max_chain_for_rest_minutes = payload.feature_toggles.max_worktime_in_row_hours * 60
        horizon_start_ord = date.fromisoformat(payload.horizon.start).toordinal()
        shift_durations = [shift_duration_minutes(shift) for shift in payload.shifts]
        shift_start_abs = [
            shift_start_abs_minutes(shift, horizon_start_ord) for shift in payload.shifts
        ]
        shift_end_abs = [start + duration for start, duration in zip(shift_start_abs, shift_durations)]
        sorted_shift_indices = sorted(
            range(len(payload.shifts)),
            key=lambda idx: shift_order_key(payload.shifts[idx]),
        )

        minimal_chain_by_left = build_minimal_qualifying_chain_by_left(
            sorted_shift_indices=sorted_shift_indices,
            shift_start_abs=shift_start_abs,
            shift_end_abs=shift_end_abs,
            shift_durations=shift_durations,
            max_chain_minutes=max_chain_for_rest_minutes,
        )

        short_rest_by_left: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for left_shift_idx in range(len(payload.shifts)):
            left_end = shift_end_abs[left_shift_idx]
            for right_shift_idx in range(len(payload.shifts)):
                if left_shift_idx == right_shift_idx:
                    continue
                rest_minutes = shift_start_abs[right_shift_idx] - left_end
                if 0 <= rest_minutes < min_rest_hard_minutes:
                    short_rest_by_left[left_shift_idx].append((right_shift_idx, rest_minutes))

        for employee in payload.employees:
            required_shift_ids = hard_require_by_employee.get(employee.id, set())
            if not required_shift_ids:
                continue

            for left_shift_idx, minimal_chain in minimal_chain_by_left.items():
                short_rest_targets = short_rest_by_left.get(left_shift_idx, [])
                if not short_rest_targets:
                    continue
                forced_chain = all(shift_idx in required_shift_ids for shift_idx in minimal_chain)
                if not forced_chain:
                    continue

                for right_shift_idx, rest_minutes in short_rest_targets:
                    if right_shift_idx not in required_shift_ids:
                        continue
                    left_shift = payload.shifts[left_shift_idx]
                    right_shift = payload.shifts[right_shift_idx]
                    add_reason(
                        "hard_min_rest_conflict_on_required_chain",
                        f"{employee.name} is hard-required on {shift_label(left_shift)} and {shift_label(right_shift)} with only {rest_minutes / 60:.1f}h rest (< {min_rest_hard_hours}h hard minimum).",
                        employee_id=employee.id,
                        employee_name=employee.name,
                        left_shift=shift_to_meta(left_shift),
                        right_shift=shift_to_meta(right_shift),
                        rest_hours=round(rest_minutes / 60, 1),
                        min_rest_hours=min_rest_hard_hours,
                    )

    unique_reasons: list[dict] = []
    seen = set()
    for reason in reasons:
        key = json.dumps(reason, sort_keys=True, ensure_ascii=True)
        if key in seen:
            continue
        seen.add(key)
        unique_reasons.append(reason)

    if unique_reasons:
        return unique_reasons[:10]

    return [
        {
            "code": "infeasibility_quick_analysis_inconclusive",
            "message": "No direct contradiction was isolated by quick analysis; infeasibility is likely caused by the combined effect of hard constraints and required coverage.",
        }
    ]

