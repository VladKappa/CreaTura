import DEFAULT_CONSTRAINTS_CONFIG, {
  normalizeConstraintsConfig,
} from "../config/constraintsConfig";
import {
  defaultShiftName,
  makeEmployee,
  nextShiftId,
  normalizeShiftConstraints,
} from "./schedule";

export function cleanErrorText(err) {
  return String(err).replace(/^Error:\s*/, "");
}

export function buildInitialEmployees() {
  return [
    makeEmployee("Alice Martin", "Cashier"),
    makeEmployee("Victor Hall", "Stock"),
    makeEmployee("Nina Carter", "Customer Service"),
    makeEmployee("Marcus Reed", "Manager"),
  ];
}

function normalizeLoadedShift(rawShift, shiftIndex) {
  const safeShift = rawShift && typeof rawShift === "object" ? rawShift : {};
  return normalizeShiftConstraints({
    id: typeof safeShift.id === "string" && safeShift.id ? safeShift.id : nextShiftId(),
    start: typeof safeShift.start === "string" ? safeShift.start : "09:00",
    end: typeof safeShift.end === "string" ? safeShift.end : "17:00",
    name: typeof safeShift.name === "string" ? safeShift.name : defaultShiftName(shiftIndex),
    constraints: Array.isArray(safeShift.constraints) ? safeShift.constraints : [],
    assignedEmployeeId:
      typeof safeShift.assignedEmployeeId === "string" ? safeShift.assignedEmployeeId : "",
    preference: typeof safeShift.preference === "string" ? safeShift.preference : "",
  });
}

export function hydratePersistedState(rawState) {
  // Motivatie:
  // Datele din DB sunt "snapshot" JSON si pot proveni din versiuni mai vechi.
  // Hidratarea normalizeaza structura si aplica fallback-uri ca UI-ul sa ramana
  // functional chiar daca schema a evoluat intre deploy-uri.
  if (!rawState || typeof rawState !== "object") return null;
  if (!Array.isArray(rawState.employees) || rawState.employees.length === 0) return null;

  const hydratedEmployees = rawState.employees.map((rawEmployee, employeeIndex) => {
    const fallback = makeEmployee(`Employee ${employeeIndex + 1}`, "Team member");
    const sourceDefaults = Array.isArray(rawEmployee?.defaultShiftsByDay)
      ? rawEmployee.defaultShiftsByDay
      : fallback.defaultShiftsByDay;
    const defaultShiftsByDay = fallback.defaultShiftsByDay.map((fallbackDayShifts, dayIndex) => {
      const sourceDayShifts = Array.isArray(sourceDefaults[dayIndex])
        ? sourceDefaults[dayIndex]
        : fallbackDayShifts;
      return sourceDayShifts.map((shift, shiftIndex) => normalizeLoadedShift(shift, shiftIndex));
    });

    const overrides = {};
    if (rawEmployee?.overrides && typeof rawEmployee.overrides === "object") {
      Object.entries(rawEmployee.overrides).forEach(([iso, shifts]) => {
        if (!Array.isArray(shifts)) return;
        overrides[iso] = shifts.map((shift, shiftIndex) => normalizeLoadedShift(shift, shiftIndex));
      });
    }

    return {
      id:
        typeof rawEmployee?.id === "string" && rawEmployee.id
          ? rawEmployee.id
          : fallback.id,
      name:
        typeof rawEmployee?.name === "string" && rawEmployee.name.trim()
          ? rawEmployee.name
          : fallback.name,
      role: typeof rawEmployee?.role === "string" ? rawEmployee.role : fallback.role,
      defaultShiftsByDay,
      overrides,
    };
  });

  const selectedCandidate =
    typeof rawState.selectedEmployeeId === "string" ? rawState.selectedEmployeeId : null;
  const selectedEmployeeId = hydratedEmployees.some((employee) => employee.id === selectedCandidate)
    ? selectedCandidate
    : hydratedEmployees[0]?.id || null;

  const clipboard =
    rawState.shiftClipboard &&
    typeof rawState.shiftClipboard === "object" &&
    typeof rawState.shiftClipboard.sourceLabel === "string" &&
    Array.isArray(rawState.shiftClipboard.shifts)
      ? {
          sourceLabel: rawState.shiftClipboard.sourceLabel,
          shifts: rawState.shiftClipboard.shifts.map((shift, index) =>
            normalizeLoadedShift(shift, index)
          ),
        }
      : null;

  const rawUiPrefs =
    rawState.uiPreferences && typeof rawState.uiPreferences === "object"
      ? rawState.uiPreferences
      : {};
  const uiPreferences = {
    themeMode: rawUiPrefs.themeMode === "light" ? "light" : "dark",
    language: rawUiPrefs.language === "ro" ? "ro" : "en",
  };

  return {
    employees: hydratedEmployees,
    selectedEmployeeId,
    constraintsConfig: normalizeConstraintsConfig(
      rawState.constraintsConfig,
      Boolean(rawState.balanceWorkedHours)
    ),
    shiftClipboard: clipboard,
    uiPreferences,
  };
}
