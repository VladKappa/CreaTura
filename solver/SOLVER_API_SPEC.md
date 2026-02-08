# CreaTura Solver API Spec

This document describes the solver service contract implemented in `solver/app/main.py`, `solver/app/models.py`, and `solver/app/engine.py`.

## Base

- Service: CreaTura Solver
- Default URL (docker-compose): `http://localhost:9000`
- Content-Type: `application/json`

## Endpoints

### `GET /health`

Response:

```json
{ "status": "ok" }
```

### `POST /solve`

Solves one scheduling instance using OR-Tools CP-SAT.

Request body type: `SolverRequest`

---

## Request Spec

### Top-level

```json
{
  "horizon": {
    "start": "2026-02-02",
    "days": 7
  },
  "employees": [
    {
      "id": "e1",
      "name": "Alice Martin",
      "skills": ["cashier"]
    }
  ],
  "shifts": [
    {
      "day": "Mon",
      "date": "2026-02-02",
      "type": "Shift 1",
      "start": "07:30",
      "end": "15:30",
      "required": 1,
      "source": "default"
    }
  ],
  "constraints": {
    "hard": [],
    "soft": []
  },
  "feature_toggles": {
    "max_worktime_in_row_enabled": true,
    "max_worktime_in_row_hours": 8,
    "min_rest_after_shift_hard_enabled": true,
    "min_rest_after_shift_hard_hours": 10,
    "min_rest_after_shift_soft_enabled": true,
    "min_rest_after_shift_soft_hours": 10,
    "min_rest_after_shift_soft_weight": 5,
    "balance_worked_hours": false,
    "balance_worked_hours_weight": 2,
    "balance_worked_hours_max_span_multiplier": 1.5
  }
}
```

### Field constraints

#### `horizon`

- `start`: string (ISO date expected by business logic, ex `YYYY-MM-DD`)
- `days`: integer, `1..31`

#### `employees[]`

- `id`: string, must be unique in request
- `name`: string
- `skills`: string array, default `[]`

#### `shifts[]`

- `day`: string (label, ex `Mon`)
- `date`: string (ISO date expected by business logic)
- `type`: string (shift name)
- `start`: string time (`HH:MM` expected by solver parser)
- `end`: string time (`HH:MM` expected)
- `required`: integer, `0..100`, default `1`
- `source`: optional string, metadata only

#### `constraints.hard[]`

- `type`: `forbid_shift` or `require_shift`
- `employee_id`: string
- `day`: optional string filter
- `date`: optional string filter
- `shift_type`: optional string filter

#### `constraints.soft[]`

- `type`: `avoid_assignment` or `prefer_assignment`
- `employee_id`: string
- `day`: optional string filter
- `date`: optional string filter
- `shift_type`: optional string filter
- `weight`: integer, `1..10000`

#### `feature_toggles`

- `max_worktime_in_row_enabled`: bool (default `true`)
- `max_worktime_in_row_hours`: integer `1..24` (default `8`)
- `min_rest_after_shift_hard_enabled`: bool (default `true`)
- `min_rest_after_shift_hard_hours`: integer `1..24` (default `10`)
- `min_rest_after_shift_soft_enabled`: bool (default `true`)
- `min_rest_after_shift_soft_hours`: integer `1..24` (default `10`)
- `min_rest_after_shift_soft_weight`: integer `1..100` (default `5`)
- `balance_worked_hours`: bool (default `false`)
- `balance_worked_hours_weight`: integer `1..100` (default `2`)
- `balance_worked_hours_max_span_multiplier`: float `0.1..10.0` (default `1.5`)

---

## Server-side validation and rejections

Besides Pydantic validation (422), solver can reject with HTTP 422 when:

- no employees (`"At least one employee is required."`)
- no shifts (`"At least one shift is required."`)
- duplicate employee IDs
- any shift requires more employees than provided
- hard/soft rule references unknown `employee_id`

---

## Response Spec

`status` is one of:

- `optimal`
- `feasible`
- `infeasible`

### Common fields (all statuses)

- `status`: string
- `warnings`: array
- `enabled_feature_toggles`: string[]

Possible `enabled_feature_toggles` values:

- `max_worktime_in_row`
- `min_rest_after_shift_hard`
- `min_rest_after_shift_soft`
- `balance_worked_hours`

### Feasible/optimal response

```json
{
  "status": "optimal",
  "objective": 7,
  "warnings": [],
  "assignments": [
    {
      "day": "Mon",
      "date": "2026-02-02",
      "type": "Shift 1",
      "start": "07:30",
      "end": "15:30",
      "required": 1,
      "assigned": [
        {
          "employee_id": "e1",
          "employee_name": "Alice Martin"
        }
      ]
    }
  ],
  "employee_load": [
    {
      "employee_id": "e1",
      "employee_name": "Alice Martin",
      "assigned_count": 1
    }
  ],
  "enabled_feature_toggles": [
    "max_worktime_in_row",
    "min_rest_after_shift_hard",
    "min_rest_after_shift_soft"
  ],
  "objective_breakdown": {
    "reward_points": 10,
    "penalty_points": -3,
    "unsatisfied_count": 1,
    "items": []
  },
  "unsatisfied_soft_constraints": []
}
```

### Infeasible response

```json
{
  "status": "infeasible",
  "reason_code": "infeasible_no_feasible_assignment",
  "reason": "No feasible assignment satisfies current hard constraints and coverage.",
  "infeasibility_reasons": [],
  "warnings": [],
  "objective": null,
  "assignments": [],
  "employee_load": [],
  "enabled_feature_toggles": [],
  "objective_breakdown": {
    "reward_points": 0,
    "penalty_points": 0,
    "unsatisfied_count": 0,
    "items": []
  },
  "unsatisfied_soft_constraints": []
}
```

---

## `warnings[]` codes

Current warning objects:

- `no_matching_shift_for_hard_constraint`
  - fields: `constraint_type`, `employee_id`
- `no_matching_shift_for_soft_constraint`
  - fields: `constraint_type`, `employee_id`

Example:

```json
{
  "code": "no_matching_shift_for_hard_constraint",
  "constraint_type": "require_shift",
  "employee_id": "e1"
}
```

---

## `infeasibility_reasons[]` codes

Current structured reasons include:

- `hard_conflict_required_and_forbidden`
- `hard_required_exceeds_shift_coverage`
- `coverage_exceeds_available_after_forbids`
- `max_worktime_window_capacity_conflict`
- `max_worktime_window_employee_overrequired`
- `hard_min_rest_conflict_on_required_chain`
- `infeasibility_quick_analysis_inconclusive`

Reasons include a human-readable `message` and additional machine-readable fields (shift refs, counts, employee info, etc.).

---

## `objective_breakdown.items[]` contract

Each item has base fields:

- `source`: `user_soft_constraint` or `feature_toggle`
- `constraint_type`: one of:
  - `prefer_assignment`
  - `avoid_assignment`
  - `min_rest_after_shift`
  - `balance_worked_hours`
- `employee_id`
- `employee_name`
- `weight`
- `status`
- `contribution`
- `active`
- `value`

Optional fields by `constraint_type`:

- `prefer_assignment` / `avoid_assignment`
  - `shift`
- `min_rest_after_shift`
  - `left_shift`, `right_shift`, `rest_minutes`, `required_rest_minutes`
- `balance_worked_hours`
  - `excess_hours`
  - `min_employee_hours`
  - `max_employee_hours`
  - `hours_span`
  - `allowed_span_hours`
  - `average_shift_duration_minutes`
  - `span_multiplier`

`unsatisfied_soft_constraints` is a subset of `objective_breakdown.items` where status is one of:

- `unmet`
- `violated`
- `over_allowed_span`

---

## Notes for clients

- Solver time parser expects `start`/`end` in `HH:MM` 24h format.
- Duration semantics support overnight shifts when `end < start`.
- Solver is currently configured with:
  - `max_time_in_seconds = 10.0`
  - `num_search_workers = 8`
- Always branch on `status` and handle `infeasible` explicitly.
- Treat `warnings` as non-fatal diagnostics.
