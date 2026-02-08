from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ortools.sat.python import cp_model

AssignVars = dict[tuple[int, int], cp_model.IntVar]
ObjectiveTerm = dict[str, Any]


@dataclass
class BalanceContext:
    min_hours_var: cp_model.IntVar | None = None
    max_hours_var: cp_model.IntVar | None = None
    hours_span_var: cp_model.IntVar | None = None
    allowed_span_hours: int | None = None
    average_shift_duration_minutes: float | None = None

