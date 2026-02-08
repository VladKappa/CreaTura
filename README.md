# CreaTura

<img width="512" height="512" alt="CreaTura" src="https://github.com/user-attachments/assets/2778a646-0c03-43c1-b086-72607a65a369" />

![overview](https://github.com/user-attachments/assets/cbbf8878-0731-45d0-afe3-113fea00ca70)

CreaTura is a dockerized employee scheduling workspace with an interactive weekly timeline, configurable solver constraints, and CP-SAT optimization diagnostics.

## Stack and Architecture

- Frontend: React + Vite + MUI
- Backend: FastAPI + SQLAlchemy + SQLite
- Solver: FastAPI + OR-Tools CP-SAT

Runtime flow:

- Frontend -> Backend (`POST /solve/schedule`)
- Backend -> Solver (`POST /solve`)
- Backend -> SQLite (`app_state` snapshot API)

## Main Features

- Weekly timeline view with multi-shift days and overnight shifts.
- Default template editor (Mon-Sun) in popup.
- Per-day custom overrides in popup.
- Copy/paste shifts between days.
- Shift overlap guards:
  - no same-day overlap
  - no overlap with previous-day overnight carry-in
  - no overlap with next-day schedule
- Shift auto-add fills the next available to-the-minute slot.
- Shift inspector dialog opened by double-click or per-shift edit button.
- Multiple constraints per shift for different employees.
- Preference mapping:
  - `desired` -> hard `require_shift`
  - `undesired` -> hard `forbid_shift`
  - `preferred` -> soft `prefer_assignment`
  - `unpreferred` -> soft `avoid_assignment`
- Solve diagnostics for feasible/infeasible runs.
- Employee workload view with bars and 3 pie charts:
  - constraint distribution
  - shift count distribution
  - worked hours distribution
- Language toggle (`EN`/`RO`).
- Theme toggle (dark default).
- First day of week setting (`Mon`/`Sun`).
- Browser workspace persistence (`localStorage`, key `creatura_workspace_v2`).

## Solver Model (Current)

Hard constraints:

- Exact coverage for every shift (`sum(assign[e,s]) == required`).
- User hard constraints (`require_shift`, `forbid_shift`).
- Feature toggle: `max_worktime_in_row`.
  - Applies to consecutive shift chains (`gap == 0`).
  - Limits chaining beyond configured hours.
  - A single long shift can exceed threshold; the chain is constrained.
- Feature toggle: hard minimum rest after reaching max-worktime chain.

Soft objective terms:

- User soft constraints (`prefer_assignment`, `avoid_assignment`) with weights.
- Feature toggle: soft minimum rest after max-worktime chain (weighted penalty).
- Feature toggle: balance worked hours by penalizing span excess beyond allowed limit.

Solver returns:

- `status`: `optimal | feasible | infeasible`
- `objective`
- `assignments`
- `employee_load`
- `enabled_feature_toggles`
- `warnings` (coded objects)
- `objective_breakdown`
- `unsatisfied_soft_constraints`
- On infeasible:
  - `reason_code`
  - `reason`
  - `infeasibility_reasons` (coded, structured items)

## API Endpoints

Backend (`http://localhost:8000`):

- `GET /health`
- `POST /solve/schedule`
- `GET /state/schedule`
- `PUT /state/schedule`

Solver (`http://localhost:9000`):

- `GET /health`
- `POST /solve`

## Run with Docker

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`
- Solver docs: `http://localhost:9000/docs`

## Persistence

Current active persistence in UI:

- Browser local storage snapshot (`creatura_workspace_v2`).

Backend persistence is still available (for future use):

- SQLite file: `backend/data/app.db`
- Table: `app_state`
- Endpoints: `/state/schedule` GET/PUT

## Logging

All 3 layers use a unified structured format with microsecond timestamps:

- `timestamp | service=<frontend|backend|solver> | level=<INFO|WARN|ERROR> | event=<name> | key=value ...`

## Project Map

- `docker-compose.yml`
- `frontend/src/App.jsx`
- `frontend/src/components/WeekCalendar.jsx`
- `frontend/src/components/ConstraintsConfig.jsx`
- `frontend/src/components/SolveDiagnostics.jsx`
- `frontend/src/components/SolveStats.jsx`
- `frontend/src/utils/schedule.js`
- `frontend/src/utils/solverPayload.js`
- `frontend/src/utils/persistedWorkspace.js`
- `backend/app/main.py`
- `backend/app/services/solver_proxy.py`
- `backend/app/services/state_store.py`
- `solver/app/main.py`
- `solver/app/models.py`
- `solver/app/engine.py`

## Notes

- Frontend hot reload is configured for Docker via polling and explicit Vite HMR host/port.
- Default employee set is initialized in frontend hydration helpers.
- Shift names are generic (`Shift 1`, `Shift 2`, ...) and fully customizable.
