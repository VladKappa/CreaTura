# CreaTura - Employee Scheduling App (Dockerized)

## What This App Does

`CreaTura` is a 3-layer employee scheduling system:

- Frontend: React + Vite (week timeline UI, constraints editor, diagnostics)
- Backend: FastAPI + SQLite (API gateway + persistence)
- Solver: FastAPI + OR-Tools CP-SAT (schedule optimization)

It supports interactive shift planning and solving directly from the UI.

## Architecture

- Frontend -> Backend (REST)
- Backend -> Solver (REST)
- Backend -> SQLite (`solve_jobs`, `app_state`)

Main files:

- `docker-compose.yml`
- `frontend/src/App.jsx`
- `backend/app/main.py`
- `solver/app/main.py`
- `solver/app/engine.py`

## Run

```bash
docker compose up --build
```

Open:

- CreaTura Frontend: `http://localhost:5173`
- CreaTura Backend docs: `http://localhost:8000/docs`
- CreaTura Solver docs: `http://localhost:9000/docs`

## Health Endpoints

Yes, both services expose health checks:

- Backend: `GET http://localhost:8000/health`
- Solver: `GET http://localhost:9000/health`

Expected response:

```json
{ "status": "ok" }
```

## Current UI Capabilities

- Weekly calendar (Mon-Sun), timeline per day
- Multiple shifts per day, including overnight shifts (`+1d`)
- Shift naming (custom name or default `Morning/Evening/Night`)
- Default template popup (Mon-Sun)
- Per-day custom overrides (copy/paste day shifts)
- Employee management popup (create/select/remove)
- Shift inspector (assign constraints for multiple employees on same shift)
- Constraint labels:
  - `Desired` (hard require)
  - `Undesired` (hard forbid)
  - `Preferred` (soft prefer, weighted)
  - `Unpreferred` (soft avoid, weighted)
- Solve button sends full payload to backend/solver
- Solver result painted back on shift blocks (assigned employee names)
- Diagnostics panel (objective breakdown + unsatisfied soft constraints)
- Employee workload stats (interactive bars + pie charts for shifts/hours)
- Workspace auto-save/load from SQLite via backend state endpoint

## Solver Model (Current Behavior)

Hard constraints:

- Coverage: each shift gets exactly `required` employees
- User hard constraints: `require_shift`, `forbid_shift`
- Default hard rule: `max_worktime_in_row`
  - Applies to consecutive shift chains (`gap == 0`)
  - A single long shift may exceed the threshold
  - Chain segments that exceed threshold are prevented

Soft constraints:

- User soft constraints: `prefer_assignment`, `avoid_assignment` (weighted)
- Default soft rule: prefer minimum rest gap after shift
- Optional feature toggle: balance worked hours across employees

Solver output includes:

- `status`: `optimal | feasible | infeasible`
- `objective`
- `assignments`
- `employee_load`
- `objective_breakdown`
- `unsatisfied_soft_constraints`
- `warnings`

## API Overview

Backend (`backend/app/main.py`):

- `GET /health`
- `POST /solve` (legacy/simple endpoint)
- `POST /solve/schedule` (main scheduler flow)
- `GET /jobs`
- `GET /state/schedule`
- `PUT /state/schedule`

Solver (`solver/app/main.py`):

- `GET /health`
- `POST /solve`

## Persistence

- UI state is persisted as JSON in SQLite (`app_state` table).
- DB file lives in `./backend/data/app.db`.
- Docker volume mapping keeps state across container rebuild/restart.

## Dev Notes

- Frontend HMR is configured for Docker (polling + explicit Vite server/HMR config).
- Relevant files:
  - `docker-compose.yml`
  - `frontend/vite.config.js`

## Refactored Code Map

Frontend:

- `frontend/src/App.jsx`: page orchestration
- `frontend/src/api/scheduleApi.js`: backend HTTP calls
- `frontend/src/config/constraintsConfig.js`: defaults + normalization
- `frontend/src/utils/persistedWorkspace.js`: persisted state hydration/migration
- `frontend/src/utils/solverPayload.js`: UI -> solver payload mapping

Backend:

- `backend/app/main.py`: thin routes
- `backend/app/services/solver_proxy.py`: solver HTTP proxy
- `backend/app/services/state_store.py`: persisted workspace state
- `backend/app/services/jobs.py`: solve job persistence helpers

Solver:

- `solver/app/main.py`: HTTP entrypoint
- `solver/app/models.py`: request schema/toggles
- `solver/app/engine.py`: CP-SAT model + solve + diagnostics
