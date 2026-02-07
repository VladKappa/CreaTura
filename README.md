# Dockerized 3-Layer App Starter

## Stack

- Frontend: React (Vite) with hot reload
- Backend: FastAPI + SQLite
- Solver: FastAPI + OR-Tools CP-SAT

## Service Communication

- Frontend -> Backend: HTTP REST (`POST /solve`, `GET /jobs`)
- Backend -> Solver: HTTP REST (`POST /solve`)
- Backend -> SQLite: SQLAlchemy ORM
- Frontend -> Backend state sync: HTTP REST (`GET /state/schedule`, `PUT /state/schedule`)

## Run

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs
- Solver docs: http://localhost:9000/docs

## Flow

1. User submits form in frontend.
2. Frontend calls backend `/solve`.
3. Backend forwards limits to solver `/solve`.
4. Solver runs CP-SAT and returns `{x, y, objective}`.
5. Backend stores result metadata in SQLite and responds to frontend.

## UI State Persistence

- Frontend auto-loads persisted scheduler state from backend on startup.
- Frontend auto-saves scheduler edits to backend (debounced).
- Backend stores this state in SQLite (`app_state` table), and `./backend/data` is volume-mounted in Docker, so state survives container rebuild/restart.

## Solver Scheduling Payload

The solver service now accepts a scheduling payload on `POST /solve` with:

- `horizon`: `{start, days}`
- `employees`: `{id, name, skills[]}`
- `shifts`: `{day, date, type, start, end, required}`
- `constraints.hard`: `forbid_shift`, `require_shift`
- `constraints.soft`: `prefer_assignment`, `avoid_assignment` with `weight`

Solver output includes:

- `status`: `optimal|feasible|infeasible`
- `objective`
- `assignments`: list of shifts with assigned employees
- `employee_load`: assigned shift counts per employee
- `warnings`: unmatched constraint selectors

## Key Files

- `docker-compose.yml`
- `frontend/src/App.jsx`
- `backend/app/main.py`
- `backend/app/db.py`
- `solver/app/main.py`
