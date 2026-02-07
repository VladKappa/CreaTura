import { useEffect, useMemo, useState } from "react";
import EmployeeSidebar from "./components/EmployeeSidebar";
import SolveDiagnostics from "./components/SolveDiagnostics";
import SolveStats from "./components/SolveStats";
import TemplateGrid from "./components/TemplateGrid";
import WeekCalendar from "./components/WeekCalendar";
import {
  buildWeekFromToday,
  cloneShifts,
  defaultShiftName,
  findNextAvailableShift,
  getDayShifts,
  makeEmployee,
  normalizeShiftConstraints,
  PREFERENCE_KEYS,
  validateShiftSet,
} from "./utils/schedule";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function removeErrorKey(setter, key) {
  setter((prev) => {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
}

function setErrorKey(setter, key, value) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function roleToSkills(role) {
  const value = (role || "").trim();
  if (!value || value.toLowerCase() === "team member") {
    return [];
  }
  return [value.toLowerCase().replace(/\s+/g, "_")];
}

function makeShiftKey(date, type, start, end) {
  return `${date}__${type}__${start}__${end}`;
}

export default function App() {
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [employees, setEmployees] = useState([
    makeEmployee("Alice Martin", "Cashier"),
    makeEmployee("Victor Hall", "Stock"),
    makeEmployee("Nina Carter", "Customer Service"),
    makeEmployee("Marcus Reed", "Manager"),
  ]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [defaultErrors, setDefaultErrors] = useState({});
  const [overrideErrors, setOverrideErrors] = useState({});
  const [shiftClipboard, setShiftClipboard] = useState(null);
  const [isEmployeePanelOpen, setIsEmployeePanelOpen] = useState(false);
  const [isTemplatePopupOpen, setIsTemplatePopupOpen] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveResult, setSolveResult] = useState(null);
  const [solveError, setSolveError] = useState("");
  const [balanceWorkedHours, setBalanceWorkedHours] = useState(false);

  const week = useMemo(() => buildWeekFromToday(), []);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || employees[0] || null;
  const solvedAssignments = useMemo(() => {
    if (!solveResult?.assignments) return {};
    const mapped = {};
    solveResult.assignments.forEach((assignment) => {
      const key = makeShiftKey(assignment.date, assignment.type, assignment.start, assignment.end);
      mapped[key] = assignment.assigned || [];
    });
    return mapped;
  }, [solveResult]);

  useEffect(() => {
    setDefaultErrors({});
    setOverrideErrors({});
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployee) {
      setIsTemplatePopupOpen(false);
    }
  }, [selectedEmployee]);

  useEffect(() => {
    setSolveResult(null);
    setSolveError("");
  }, [employees, selectedEmployeeId, balanceWorkedHours]);

  function updateEmployee(employeeId, updater) {
    setEmployees((prev) =>
      prev.map((employee) => (employee.id === employeeId ? updater(employee) : employee))
    );
  }

  function addEmployee(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    const hadEmployees = employees.length > 0;
    const created = makeEmployee(name, newRole.trim() || "Team member");
    setEmployees((prev) => [...prev, created]);
    if (!hadEmployees) {
      setSelectedEmployeeId(created.id);
    }
    setNewName("");
    setNewRole("");
  }

  function removeEmployee(employeeId) {
    setEmployees((prev) =>
      prev
        .filter((employee) => employee.id !== employeeId)
        .map((employee) => ({
          ...employee,
          defaultShiftsByDay: employee.defaultShiftsByDay.map((shifts) =>
            shifts.map((shift) => {
              const normalized = normalizeShiftConstraints(shift);
              return {
                ...normalized,
                constraints: normalized.constraints.filter(
                  (constraint) => constraint.employeeId !== employeeId
                ),
              };
            })
          ),
          overrides: Object.fromEntries(
            Object.entries(employee.overrides).map(([iso, shifts]) => [
              iso,
              shifts.map((shift) => {
                const normalized = normalizeShiftConstraints(shift);
                return {
                  ...normalized,
                  constraints: normalized.constraints.filter(
                    (constraint) => constraint.employeeId !== employeeId
                  ),
                };
              }),
            ])
          ),
        }))
    );
    if (selectedEmployeeId === employeeId) {
      setSelectedEmployeeId(null);
    }
  }

  function setDefaultDayShifts(day, nextShifts) {
    if (!selectedEmployee) return;
    const normalized = nextShifts.map(normalizeShiftConstraints);
    updateEmployee(selectedEmployee.id, (employee) => ({
      ...employee,
      defaultShiftsByDay: employee.defaultShiftsByDay.map((shifts, idx) =>
        idx === day.dayIndex ? normalized : shifts
      ),
    }));
  }

  function setOverrideDayShifts(day, nextShifts) {
    if (!selectedEmployee) return;
    const normalized = nextShifts.map(normalizeShiftConstraints);
    updateEmployee(selectedEmployee.id, (employee) => ({
      ...employee,
      overrides: {
        ...employee.overrides,
        [day.iso]: normalized,
      },
    }));
  }

  function getDefaultError(day) {
    return defaultErrors[day.dayIndex] || "";
  }

  function getOverrideError(day) {
    return overrideErrors[day.iso] || "";
  }

  function addDefaultShift(day) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.defaultShiftsByDay[day.dayIndex];
    const nextShift = findNextAvailableShift(current);
    if (!nextShift) {
      setErrorKey(
        setDefaultErrors,
        day.dayIndex,
        `No room left to create another default shift for ${day.label}.`
      );
      return;
    }

    const next = [...current, nextShift];
    const validation = validateShiftSet(next);
    if (!validation.ok) {
      setErrorKey(setDefaultErrors, day.dayIndex, validation.error);
      return;
    }

    removeErrorKey(setDefaultErrors, day.dayIndex);
    setDefaultDayShifts(day, next);
  }

  function updateDefaultShift(day, shiftId, patch) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.defaultShiftsByDay[day.dayIndex];
    const next = current.map((shift) => (shift.id === shiftId ? { ...shift, ...patch } : shift));
    const validation = validateShiftSet(next);
    if (!validation.ok) {
      setErrorKey(setDefaultErrors, day.dayIndex, validation.error);
      return;
    }

    removeErrorKey(setDefaultErrors, day.dayIndex);
    setDefaultDayShifts(day, next);
  }

  function removeDefaultShift(day, shiftId) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.defaultShiftsByDay[day.dayIndex];
    const next = current.filter((shift) => shift.id !== shiftId);
    removeErrorKey(setDefaultErrors, day.dayIndex);
    setDefaultDayShifts(day, next);
  }

  function toggleOverride(day, enabled) {
    if (!selectedEmployee) return;
    updateEmployee(selectedEmployee.id, (employee) => {
      const nextOverrides = { ...employee.overrides };
      if (!enabled) {
        delete nextOverrides[day.iso];
      } else {
        nextOverrides[day.iso] = cloneShifts(employee.defaultShiftsByDay[day.dayIndex]);
      }
      return { ...employee, overrides: nextOverrides };
    });
    removeErrorKey(setOverrideErrors, day.iso);
  }

  function copyDefaultDay(day) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.defaultShiftsByDay[day.dayIndex];
    setShiftClipboard({
      sourceLabel: `Default ${day.label}`,
      shifts: current.map((shift) => ({
        ...shift,
        constraints: (shift.constraints || []).map((constraint) => ({ ...constraint })),
      })),
    });
  }

  function pasteDefaultDay(day) {
    if (!selectedEmployee || !shiftClipboard) return;
    const pasted = cloneShifts(shiftClipboard.shifts);
    const validation = validateShiftSet(pasted);
    if (!validation.ok) {
      setErrorKey(setDefaultErrors, day.dayIndex, validation.error);
      return;
    }
    removeErrorKey(setDefaultErrors, day.dayIndex);
    setDefaultDayShifts(day, pasted);
  }

  function copyWeekDay(day) {
    if (!selectedEmployee) return;
    const current = getDayShifts(selectedEmployee, day);
    setShiftClipboard({
      sourceLabel: `${day.label} ${day.dateText}`,
      shifts: current.map((shift) => ({
        ...shift,
        constraints: (shift.constraints || []).map((constraint) => ({ ...constraint })),
      })),
    });
  }

  function pasteToWeekOverride(day) {
    if (!selectedEmployee || !shiftClipboard) return;
    const pasted = cloneShifts(shiftClipboard.shifts);
    const validation = validateShiftSet(pasted);
    if (!validation.ok) {
      setErrorKey(setOverrideErrors, day.iso, validation.error);
      return;
    }
    removeErrorKey(setOverrideErrors, day.iso);
    setOverrideDayShifts(day, pasted);
  }

  function updateShiftBySource(source, shiftId, updater) {
    if (!selectedEmployee) return;

    updateEmployee(selectedEmployee.id, (employee) => {
      if (source.usesOverride) {
        const current = employee.overrides[source.dayIso];
        if (!current) return employee;
        return {
          ...employee,
          overrides: {
            ...employee.overrides,
            [source.dayIso]: current.map((shift) => {
              if (shift.id !== shiftId) return shift;
              return normalizeShiftConstraints(updater(normalizeShiftConstraints(shift)));
            }),
          },
        };
      }

      return {
        ...employee,
        defaultShiftsByDay: employee.defaultShiftsByDay.map((shifts, idx) =>
          idx === source.dayIndex
            ? shifts.map((shift) => {
                if (shift.id !== shiftId) return shift;
                return normalizeShiftConstraints(updater(normalizeShiftConstraints(shift)));
              })
            : shifts
        ),
      };
    });
  }

  function addShiftConstraint(source, shiftId) {
    if (!selectedEmployee) return;
    updateShiftBySource(source, shiftId, (shift) => {
      const used = new Set((shift.constraints || []).map((constraint) => constraint.employeeId));
      const nextEmployee = employees.find((worker) => !used.has(worker.id));
      if (!nextEmployee) return shift;
      return {
        ...shift,
        constraints: [
          ...(shift.constraints || []),
          { employeeId: nextEmployee.id, preference: PREFERENCE_KEYS[0] },
        ],
      };
    });
  }

  function updateShiftConstraint(source, shiftId, constraintIndex, patch) {
    updateShiftBySource(source, shiftId, (shift) => ({
      ...shift,
      constraints: (shift.constraints || []).map((constraint, index) =>
        index === constraintIndex ? { ...constraint, ...patch } : constraint
      ),
    }));
  }

  function removeShiftConstraint(source, shiftId, constraintIndex) {
    updateShiftBySource(source, shiftId, (shift) => ({
      ...shift,
      constraints: (shift.constraints || []).filter((_, index) => index !== constraintIndex),
    }));
  }

  function addOverrideShift(day) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.overrides[day.iso];
    if (!current) return;

    const nextShift = findNextAvailableShift(current);
    if (!nextShift) {
      setErrorKey(setOverrideErrors, day.iso, `No room left to create another shift for ${day.label}.`);
      return;
    }

    const next = [...current, nextShift];
    const validation = validateShiftSet(next);
    if (!validation.ok) {
      setErrorKey(setOverrideErrors, day.iso, validation.error);
      return;
    }

    removeErrorKey(setOverrideErrors, day.iso);
    setOverrideDayShifts(day, next);
  }

  function updateOverrideShift(day, shiftId, patch) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.overrides[day.iso];
    if (!current) return;

    const next = current.map((shift) => (shift.id === shiftId ? { ...shift, ...patch } : shift));
    const validation = validateShiftSet(next);
    if (!validation.ok) {
      setErrorKey(setOverrideErrors, day.iso, validation.error);
      return;
    }

    removeErrorKey(setOverrideErrors, day.iso);
    setOverrideDayShifts(day, next);
  }

  function removeOverrideShift(day, shiftId) {
    if (!selectedEmployee) return;
    const current = selectedEmployee.overrides[day.iso];
    if (!current) return;

    const next = current.filter((shift) => shift.id !== shiftId);
    removeErrorKey(setOverrideErrors, day.iso);
    setOverrideDayShifts(day, next);
  }

  function buildSolvePayload() {
    if (!selectedEmployee) return null;

    const plannedShifts = week.flatMap((day) => {
      const dayShifts = getDayShifts(selectedEmployee, day);
      const usesOverride = Boolean(selectedEmployee.overrides[day.iso]);
      return dayShifts.map((shift, index) => ({
        day: day.label,
        date: day.iso,
        type: shift.name?.trim() || defaultShiftName(index),
        start: shift.start,
        end: shift.end,
        required: 1,
        source: usesOverride ? "override" : "default",
        constraints: shift.constraints || [],
      }));
    });

    const hard = [];
    const soft = [];

    plannedShifts.forEach((shift) => {
      shift.constraints.forEach((constraint) => {
        const base = {
          employee_id: constraint.employeeId,
          day: shift.day,
          date: shift.date,
          shift_type: shift.type,
        };

        if (constraint.preference === "undesired") {
          hard.push({ type: "forbid_shift", ...base });
        } else if (constraint.preference === "desired") {
          hard.push({ type: "require_shift", ...base });
        } else if (constraint.preference === "unpreferred") {
          soft.push({ type: "avoid_assignment", ...base, weight: 5 });
        } else if (constraint.preference === "preferred") {
          soft.push({ type: "prefer_assignment", ...base, weight: 3 });
        }
      });
    });

    return {
      horizon: {
        start: week[0]?.iso || "",
        days: week.length,
      },
      employees: employees.map((emp) => {
        const skills = roleToSkills(emp.role);
        return skills.length
          ? { id: emp.id, name: emp.name, skills }
          : { id: emp.id, name: emp.name };
      }),
      shifts: plannedShifts.map(({ constraints, ...rest }) => rest),
      constraints: {
        hard,
        soft,
      },
      feature_toggles: {
        balance_worked_hours: balanceWorkedHours,
        balance_worked_hours_max_span_multiplier: 1.5,
      },
    };
  }

  async function onSolveClick() {
    const payload = buildSolvePayload();
    if (!payload) {
      console.warn("No selected employee. Cannot build solve payload.");
      return;
    }

    console.log("Solve payload:");
    console.log(JSON.stringify(payload, null, 2));
    setIsSolving(true);
    setSolveError("");
    setSolveResult(null);
    try {
      const resp = await fetch(`${API_URL}/solve/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Solve failed (${resp.status}): ${detail}`);
      }
      const result = await resp.json();
      setSolveResult(result);
      console.log("Solver response:");
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      const text = String(err);
      setSolveError(text);
      console.error("Solve request error:", err);
    } finally {
      setIsSolving(false);
    }
  }

  return (
    <main className="app-shell single">
      <header className="panel app-header">
        <div>
          <h1>Employee Scheduler</h1>
          <p className="subtle">Manage shifts, assignments, and preferences for the week.</p>
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            disabled={!selectedEmployee}
            className={isSolving ? "quiet" : ""}
            onClick={onSolveClick}
          >
            {isSolving ? "Solving..." : "Solve"}
          </button>
          <button type="button" className="quiet" onClick={() => setIsEmployeePanelOpen(true)}>
            Employees
          </button>
          <button
            type="button"
            className="quiet"
            disabled={!selectedEmployee}
            onClick={() => setIsTemplatePopupOpen(true)}
          >
            Default Template
          </button>
          <label className="checkbox dense">
            <input
              type="checkbox"
              checked={balanceWorkedHours}
              onChange={(e) => setBalanceWorkedHours(e.target.checked)}
            />
            Balance Hours
          </label>
        </div>
      </header>

      <section className="content">
        {solveError ? (
          <div className="panel">
            <p className="error-text">{solveError}</p>
          </div>
        ) : null}
        {solveResult ? <SolveDiagnostics solveResult={solveResult} /> : null}
        {solveResult ? <SolveStats solveResult={solveResult} employees={employees} /> : null}
        {!selectedEmployee ? (
          <div className="panel">
            <h2>No employee selected</h2>
            <p>Open Employees from the top toolbar and select one.</p>
          </div>
        ) : (
          <>
            <WeekCalendar
              week={week}
              employee={selectedEmployee}
              employees={employees}
              onToggleOverride={toggleOverride}
              onAddOverrideShift={addOverrideShift}
              onRemoveOverrideShift={removeOverrideShift}
              onUpdateOverrideShift={updateOverrideShift}
              getOverrideError={getOverrideError}
              onCopyDay={copyWeekDay}
              onPasteDay={pasteToWeekOverride}
              clipboardLabel={shiftClipboard?.sourceLabel || ""}
              onAddShiftConstraint={addShiftConstraint}
              onUpdateShiftConstraint={updateShiftConstraint}
              onRemoveShiftConstraint={removeShiftConstraint}
              solvedAssignments={solvedAssignments}
            />
          </>
        )}
      </section>

      {isEmployeePanelOpen ? (
        <div className="modal-backdrop" onClick={() => setIsEmployeePanelOpen(false)}>
          <section
            className="modal-panel modal-panel-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Employees</h3>
              <button type="button" className="quiet mini-btn" onClick={() => setIsEmployeePanelOpen(false)}>
                Close
              </button>
            </div>
            <EmployeeSidebar
              newName={newName}
              newRole={newRole}
              onNameChange={setNewName}
              onRoleChange={setNewRole}
              onAddEmployee={addEmployee}
              employees={employees}
              selectedEmployeeId={selectedEmployee?.id || null}
              onSelectEmployee={(employeeId) => {
                setSelectedEmployeeId(employeeId);
                setIsEmployeePanelOpen(false);
              }}
              onRemoveEmployee={removeEmployee}
              showTop={false}
            />
          </section>
        </div>
      ) : null}

      {isTemplatePopupOpen && selectedEmployee ? (
        <div className="modal-backdrop" onClick={() => setIsTemplatePopupOpen(false)}>
          <section className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Default Template (Mon-Sun)</h3>
              <button type="button" className="quiet mini-btn" onClick={() => setIsTemplatePopupOpen(false)}>
                Close
              </button>
            </div>
            <TemplateGrid
              week={week}
              employee={selectedEmployee}
              onAddShift={addDefaultShift}
              onRemoveShift={removeDefaultShift}
              onUpdateShift={updateDefaultShift}
              getErrorMessage={getDefaultError}
              onCopyDay={copyDefaultDay}
              onPasteDay={pasteDefaultDay}
              clipboardLabel={shiftClipboard?.sourceLabel || ""}
              showTitle={false}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}
