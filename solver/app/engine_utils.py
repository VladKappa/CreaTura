from __future__ import annotations

from datetime import date

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


def shift_label(shift: Shift) -> str:
    return f"{shift.day} {shift.date} {shift.type} ({shift.start}-{shift.end})"


def shift_to_meta(shift: Shift) -> dict:
    return {
        "day": shift.day,
        "date": shift.date,
        "type": shift.type,
        "start": shift.start,
        "end": shift.end,
    }


def build_minimal_qualifying_chain_by_left(
    sorted_shift_indices: list[int],
    shift_start_abs: list[int],
    shift_end_abs: list[int],
    shift_durations: list[int],
    max_chain_minutes: int,
) -> dict[int, list[int]]:
    """
    Returneaza pentru fiecare shift "left" (capat de lant) cel mai scurt lant
    consecutiv (gap == 0) care atinge/depaseste pragul de worktime.

    De ce e suficient lantul minim:
    - orice lant mai lung care atinge pragul include acest lant minim;
    - daca lantul minim nu este complet atribuit, niciun lant mai lung nu poate fi complet.
    """
    minimal_chain_by_left: dict[int, list[int]] = {}
    for end_pos, end_shift_idx in enumerate(sorted_shift_indices):
        running_minutes = shift_durations[end_shift_idx]
        chain = [end_shift_idx]
        if running_minutes >= max_chain_minutes:
            minimal_chain_by_left[end_shift_idx] = chain.copy()
            continue

        for prev_pos in range(end_pos - 1, -1, -1):
            prev_shift_idx = sorted_shift_indices[prev_pos]
            next_shift_idx = sorted_shift_indices[prev_pos + 1]
            gap_minutes = shift_start_abs[next_shift_idx] - shift_end_abs[prev_shift_idx]
            if gap_minutes != 0:
                break

            chain.insert(0, prev_shift_idx)
            running_minutes += shift_durations[prev_shift_idx]
            if running_minutes >= max_chain_minutes:
                minimal_chain_by_left[end_shift_idx] = chain.copy()
                break

    return minimal_chain_by_left


def compute_max_worktime_violating_windows(
    payload: SolverRequest,
    shift_start_abs: list[int],
    shift_end_abs: list[int],
    shift_durations: list[int],
) -> list[list[int]]:
    max_worktime_minutes = payload.feature_toggles.max_worktime_in_row_hours * 60
    num_shifts = len(payload.shifts)
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
                # Primul "prefix" care depaseste pragul este suficient pentru
                # acel start; orice fereastra mai lunga il contine si devine redundant.
                break

    # Dedupe ferestre duplicate rezultate din scanari diferite.
    unique_windows: list[list[int]] = []
    seen = set()
    for window in violating_windows:
        key = tuple(window)
        if key in seen:
            continue
        seen.add(key)
        unique_windows.append(window)
    return unique_windows

