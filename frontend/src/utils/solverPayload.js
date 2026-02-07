import { defaultShiftName, getDayShifts } from "./schedule";

function roleToSkills(role) {
  const value = (role || "").trim();
  if (!value || value.toLowerCase() === "team member") {
    return [];
  }
  return [value.toLowerCase().replace(/\s+/g, "_")];
}

export function makeShiftKey(date, type, start, end) {
  return `${date}__${type}__${start}__${end}`;
}

export function buildSolvePayload({ selectedEmployee, week, employees, constraintsConfig }) {
  if (!selectedEmployee) return null;

  // Motivatie:
  // UI gestioneaza constrangeri la nivel de "shift card", dar solverul
  // primeste reguli separate hard/soft. Facem maparea aici intr-un loc unic,
  // ca sa nu duplicam logica in componente.
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
        soft.push({ type: "avoid_assignment", ...base, weight: constraintsConfig.unpreferredWeight });
      } else if (constraint.preference === "preferred") {
        soft.push({ type: "prefer_assignment", ...base, weight: constraintsConfig.preferredWeight });
      }
    });
  });

  return {
    horizon: {
      start: week[0]?.iso || "",
      days: week.length,
    },
    employees: employees.map((employee) => {
      const skills = roleToSkills(employee.role);
      return skills.length
        ? { id: employee.id, name: employee.name, skills }
        : { id: employee.id, name: employee.name };
    }),
    shifts: plannedShifts.map(({ constraints, ...rest }) => rest),
    constraints: {
      hard,
      soft,
    },
    feature_toggles: {
      max_worktime_in_row_enabled: constraintsConfig.maxWorktimeInRowEnabled,
      max_worktime_in_row_hours: constraintsConfig.maxWorktimeInRowHours,
      min_rest_after_shift_enabled: constraintsConfig.restGapEnabled,
      min_rest_after_shift_hours: constraintsConfig.restGapHours,
      min_rest_after_shift_weight: constraintsConfig.restGapWeight,
      balance_worked_hours: constraintsConfig.balanceWorkedHoursEnabled,
      balance_worked_hours_weight: constraintsConfig.balanceWorkedHoursWeight,
      balance_worked_hours_max_span_multiplier:
        constraintsConfig.balanceWorkedHoursMaxSpanMultiplier,
    },
  };
}
