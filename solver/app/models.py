from typing import Literal

from pydantic import BaseModel, Field


class Horizon(BaseModel):
    start: str
    days: int = Field(..., ge=1, le=31)


class Employee(BaseModel):
    id: str
    name: str
    skills: list[str] = Field(default_factory=list)


class Shift(BaseModel):
    day: str
    date: str
    type: str
    start: str
    end: str
    required: int = Field(1, ge=0, le=100)
    source: str | None = None


class HardConstraint(BaseModel):
    type: Literal["forbid_shift", "require_shift"]
    employee_id: str
    day: str | None = None
    date: str | None = None
    shift_type: str | None = None


class SoftConstraint(BaseModel):
    type: Literal["avoid_assignment", "prefer_assignment"]
    employee_id: str
    day: str | None = None
    date: str | None = None
    shift_type: str | None = None
    weight: int = Field(1, ge=1, le=10_000)


class Constraints(BaseModel):
    hard: list[HardConstraint] = Field(default_factory=list)
    soft: list[SoftConstraint] = Field(default_factory=list)


class FeatureToggles(BaseModel):
    max_worktime_in_row_enabled: bool = True
    max_worktime_in_row_hours: int = Field(8, ge=1, le=24)
    min_rest_after_shift_enabled: bool = True
    min_rest_after_shift_hours: int = Field(10, ge=1, le=24)
    min_rest_after_shift_weight: int = Field(5, ge=1, le=100)
    balance_worked_hours: bool = False
    balance_worked_hours_weight: int = Field(2, ge=1, le=100)
    balance_worked_hours_max_span_multiplier: float = Field(1.5, ge=0.1, le=10.0)


class SolverRequest(BaseModel):
    horizon: Horizon
    employees: list[Employee]
    shifts: list[Shift]
    constraints: Constraints = Field(default_factory=Constraints)
    feature_toggles: FeatureToggles = Field(default_factory=FeatureToggles)
