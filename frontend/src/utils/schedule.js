import {
  DAY_LABELS,
  DEFAULT_SHIFT_DURATION_MINUTES,
  MINUTES_IN_DAY,
  SHIFT_COLORS,
} from "../constants/schedule";

let shiftSeed = 0;

export function nextShiftId() {
  shiftSeed += 1;
  return `shift-${shiftSeed}`;
}

export function defaultShiftName(index) {
  if (index === 0) return "Morning";
  if (index === 1) return "Evening";
  if (index === 2) return "Night";
  return `Shift ${index + 1}`;
}

export function makeShift(start = "09:00", end = "17:00", name = "") {
  return {
    id: nextShiftId(),
    start,
    end,
    name,
    constraints: [],
  };
}

export const PREFERENCE_META = {
  desired: { label: "Desired", emoji: "⭐" },
  undesired: { label: "Undesired", emoji: "🚫" },
  preferred: { label: "Preferred", emoji: "👍" },
  unpreferred: { label: "Unpreferred", emoji: "👎" },
};

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_META);

export function timeToMinutes(text) {
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes) {
  const normalized = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export function isOvernight(shift) {
  return timeToMinutes(shift.end) < timeToMinutes(shift.start);
}

export function isFullDayShift(shift) {
  return timeToMinutes(shift.end) === timeToMinutes(shift.start);
}

export function shiftDurationMinutes(shift) {
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  if (end > start) return end - start;
  if (end < start) return end + MINUTES_IN_DAY - start;
  return MINUTES_IN_DAY;
}

export function shiftText(shift) {
  if (isFullDayShift(shift)) return "24h shift";
  return isOvernight(shift) ? `${shift.start} - ${shift.end} (+1d)` : `${shift.start} - ${shift.end}`;
}

export function formatTime12(text) {
  const [hoursRaw, minutesRaw] = text.split(":").map(Number);
  const suffix = hoursRaw >= 12 ? "PM" : "AM";
  const hours12 = hoursRaw % 12 === 0 ? 12 : hoursRaw % 12;
  return `${hours12}:${minutesRaw.toString().padStart(2, "0")} ${suffix}`;
}

export function formatShiftRange12(shift) {
  if (isFullDayShift(shift)) return "12:00 AM - 12:00 AM (24h)";
  const suffix = isOvernight(shift) ? " (+1d)" : "";
  return `${formatTime12(shift.start)} - ${formatTime12(shift.end)}${suffix}`;
}

export function cloneShifts(shifts) {
  return shifts.map((shift) => ({
    ...shift,
    id: nextShiftId(),
    constraints: (shift.constraints || []).map((constraint) => ({ ...constraint })),
  }));
}

export function normalizeShiftConstraints(shift) {
  const raw = Array.isArray(shift.constraints) ? shift.constraints : [];
  const legacy =
    shift.assignedEmployeeId && raw.length === 0
      ? [{ employeeId: shift.assignedEmployeeId, preference: shift.preference || PREFERENCE_KEYS[0] }]
      : [];
  const merged = [...raw, ...legacy];
  const used = new Set();
  const constraints = [];

  merged.forEach((constraint) => {
    const employeeId = constraint?.employeeId || "";
    if (!employeeId || used.has(employeeId)) return;
    const preference = PREFERENCE_KEYS.includes(constraint?.preference)
      ? constraint.preference
      : PREFERENCE_KEYS[0];
    used.add(employeeId);
    constraints.push({ employeeId, preference });
  });

  return {
    ...shift,
    constraints,
    assignedEmployeeId: "",
    preference: "",
  };
}

export function buildWeekFromToday() {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return DAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const dateText = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return { label, dayIndex: index, iso, dateText };
  });
}

export function newDefaultShifts() {
  return DAY_LABELS.map(() => [
    makeShift("07:30", "15:30", "Morning"),
    makeShift("15:30", "23:30", "Evening"),
    makeShift("23:30", "07:30", "Night"),
  ]);
}

export function makeEmployee(name, role) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    role,
    defaultShiftsByDay: newDefaultShifts(),
    overrides: {},
  };
}

function shiftIntervals(shift) {
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);

  if (end > start) {
    return [[start, end]];
  }
  if (end < start) {
    return [
      [start, MINUTES_IN_DAY],
      [0, end],
    ];
  }
  return [[0, MINUTES_IN_DAY]];
}

function intervalsOverlap(left, right) {
  return left[0] < right[1] && right[0] < left[1];
}

export function hasShiftOverlap(shifts) {
  for (let i = 0; i < shifts.length; i += 1) {
    const currentIntervals = shiftIntervals(shifts[i]);
    for (let j = i + 1; j < shifts.length; j += 1) {
      const nextIntervals = shiftIntervals(shifts[j]);
      for (const left of currentIntervals) {
        for (const right of nextIntervals) {
          if (intervalsOverlap(left, right)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function validateShiftSet(shifts) {
  if (shifts.some(isFullDayShift)) {
    return {
      ok: false,
      error: "A shift cannot be 24 hours (start and end must differ).",
    };
  }
  if (hasShiftOverlap(shifts)) {
    return {
      ok: false,
      error: "Shifts cannot overlap.",
    };
  }
  return { ok: true };
}

function buildOccupiedMinutes(shifts) {
  const occupied = new Array(MINUTES_IN_DAY).fill(false);
  for (const shift of shifts) {
    const intervals = shiftIntervals(shift);
    for (const [start, end] of intervals) {
      for (let minute = start; minute < end; minute += 1) {
        occupied[minute] = true;
      }
    }
  }
  return occupied;
}

function isFreeWindow(occupied, startMinute, duration) {
  for (let i = 0; i < duration; i += 1) {
    const minute = (startMinute + i) % MINUTES_IN_DAY;
    if (occupied[minute]) return false;
  }
  return true;
}

function latestShiftAnchor(shifts) {
  if (shifts.length === 0) {
    return {
      start: 9 * 60,
      duration: DEFAULT_SHIFT_DURATION_MINUTES,
    };
  }

  let latest = null;
  for (const shift of shifts) {
    const start = timeToMinutes(shift.start);
    const duration = shiftDurationMinutes(shift);
    const endAbs = start + duration;
    if (!latest || endAbs > latest.endAbs) {
      latest = { endAbs, duration };
    }
  }
  return {
    start: latest.endAbs % MINUTES_IN_DAY,
    duration: latest.duration,
  };
}

export function findNextAvailableShift(shifts) {
  const occupied = buildOccupiedMinutes(shifts);
  const anchor = latestShiftAnchor(shifts);
  const duration = Math.min(Math.max(anchor.duration, 1), MINUTES_IN_DAY - 1);

  for (let offset = 0; offset < MINUTES_IN_DAY; offset += 1) {
    const candidateStart = (anchor.start + offset) % MINUTES_IN_DAY;
    if (!isFreeWindow(occupied, candidateStart, duration)) continue;
    const candidateEnd = (candidateStart + duration) % MINUTES_IN_DAY;
    const name = defaultShiftName(shifts.length % SHIFT_COLORS.length);
    return makeShift(minutesToTime(candidateStart), minutesToTime(candidateEnd), name);
  }

  return null;
}

export function getDayShifts(employee, day) {
  const override = employee.overrides[day.iso];
  if (override) return override;
  return employee.defaultShiftsByDay[day.dayIndex];
}

export function buildOwnSegments(shifts) {
  const segments = [];
  shifts.forEach((shift, index) => {
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    const color = SHIFT_COLORS[index % SHIFT_COLORS.length];
    const shiftName = shift.name?.trim() || defaultShiftName(index);

    if (end > start) {
      segments.push({
        id: `${shift.id}-main`,
        start,
        end,
        carry: false,
        color,
        label: `${shiftName}: ${shiftText(shift)}`,
        shiftId: shift.id,
        shiftIndex: index,
      });
      return;
    }

    if (end < start) {
      segments.push({
        id: `${shift.id}-overnight`,
        start,
        end: MINUTES_IN_DAY,
        carry: false,
        color,
        label: `${shiftName}: ${shiftText(shift)}`,
        shiftId: shift.id,
        shiftIndex: index,
      });
    }
  });
  return segments;
}

export function buildCarryInSegments(previousDayShifts) {
  const segments = [];
  previousDayShifts.forEach((shift, index) => {
    if (!isOvernight(shift)) return;
    const shiftName = shift.name?.trim() || defaultShiftName(index);
    segments.push({
      id: `${shift.id}-carry`,
      start: 0,
      end: timeToMinutes(shift.end),
      carry: true,
      color: SHIFT_COLORS[index % SHIFT_COLORS.length],
      label: `${shiftName}: ${shiftText(shift)}`,
      shiftId: shift.id,
      shiftIndex: index,
    });
  });
  return segments;
}
