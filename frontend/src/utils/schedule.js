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
  return `Shift ${index + 1}`;
}

function hashShiftName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getShiftColor(shiftName, fallbackIndex = 0) {
  const safeName = String(shiftName || "").trim() || defaultShiftName(fallbackIndex);
  const index = hashShiftName(safeName.toLowerCase()) % SHIFT_COLORS.length;
  return SHIFT_COLORS[index];
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
  desired: { label: "Desired", emoji: "\u2B50" },
  undesired: { label: "Undesired", emoji: "\uD83D\uDEAB" },
  preferred: { label: "Preferred", emoji: "\uD83D\uDC4D" },
  unpreferred: { label: "Unpreferred", emoji: "\uD83D\uDC4E" },
};

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_META);

export function timeToMinutes(text) {
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

export function sortShiftsByStart(shifts) {
  return [...shifts].sort((left, right) => {
    const startDiff = timeToMinutes(left.start) - timeToMinutes(right.start);
    if (startDiff !== 0) return startDiff;
    const endDiff = timeToMinutes(left.end) - timeToMinutes(right.end);
    if (endDiff !== 0) return endDiff;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
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
  const used = new Set();
  const constraints = [];

  raw.forEach((constraint) => {
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
  };
}

export function buildWeekFromToday(firstDayOfWeek = "mon") {
  const today = new Date();
  const jsDay = today.getDay();
  const startOffset = firstDayOfWeek === "sun" ? -jsDay : jsDay === 0 ? -6 : 1 - jsDay;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + startOffset);

  return Array.from({ length: DAY_LABELS.length }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const weekdayIndex = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const iso = date.toISOString().slice(0, 10);
    const dateText = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return {
      label: DAY_LABELS[weekdayIndex],
      dayIndex: weekdayIndex,
      orderIndex: index,
      iso,
      dateText,
    };
  });
}

export function newDefaultShifts() {
  return DAY_LABELS.map(() => [
    makeShift("07:30", "15:30", defaultShiftName(0)),
    makeShift("15:30", "23:30", defaultShiftName(1)),
    makeShift("23:30", "07:30", defaultShiftName(2)),
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

function intervalsOverlap(left, right) {
  return left[0] < right[1] && right[0] < left[1];
}

export function hasShiftOverlap(shifts) {
  for (let i = 0; i < shifts.length; i += 1) {
    const currentIntervals = currentDayIntervals(shifts[i]);
    for (let j = i + 1; j < shifts.length; j += 1) {
      const nextIntervals = currentDayIntervals(shifts[j]);
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

function carryInIntervals(previousDayShifts) {
  const intervals = [];
  previousDayShifts.forEach((shift) => {
    if (!isOvernight(shift)) return;
    const end = timeToMinutes(shift.end);
    if (end <= 0) return;
    intervals.push([0, end]);
  });
  return intervals;
}

function currentDayIntervals(shift) {
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  if (end > start) return [[start, end]];
  if (end < start) {
    // Pentru o tura overnight din ziua curenta, in ziua curenta conteaza doar
    // segmentul [start, 24:00). Segmentul [00:00, end) apartine zilei urmatoare.
    return [[start, MINUTES_IN_DAY]];
  }
  return [[0, MINUTES_IN_DAY]];
}

function carryOutIntervals(shifts) {
  const intervals = [];
  shifts.forEach((shift) => {
    if (!isOvernight(shift)) return;
    const end = timeToMinutes(shift.end);
    if (end <= 0) return;
    intervals.push([0, end]);
  });
  return intervals;
}

export function hasCarryInOverlap(shifts, previousDayShifts = []) {
  const carryIntervals = carryInIntervals(previousDayShifts);
  if (carryIntervals.length === 0) return false;

  for (const shift of shifts) {
    const currentIntervals = currentDayIntervals(shift);
    for (const current of currentIntervals) {
      for (const carry of carryIntervals) {
        if (intervalsOverlap(current, carry)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function hasCarryOutOverlap(shifts, nextDayShifts = []) {
  const carryOut = carryOutIntervals(shifts);
  if (carryOut.length === 0 || nextDayShifts.length === 0) return false;

  const nextDayIntervals = nextDayShifts.flatMap((shift) => currentDayIntervals(shift));
  if (nextDayIntervals.length === 0) return false;

  for (const left of carryOut) {
    for (const right of nextDayIntervals) {
      if (intervalsOverlap(left, right)) {
        return true;
      }
    }
  }
  return false;
}

export function validateShiftSetWithCarryIn(
  shifts,
  previousDayShifts = [],
  nextDayShifts = []
) {
  const baseValidation = validateShiftSet(shifts);
  if (!baseValidation.ok) return baseValidation;
  if (hasCarryInOverlap(shifts, previousDayShifts)) {
    return {
      ok: false,
      error: "Shifts cannot overlap with overnight carry-over from the previous day.",
    };
  }
  if (hasCarryOutOverlap(shifts, nextDayShifts)) {
    return {
      ok: false,
      error: "Shifts cannot overlap with the next day schedule.",
    };
  }
  return { ok: true };
}

function buildOccupiedMinutes(shifts) {
  const occupied = new Array(MINUTES_IN_DAY).fill(false);
  for (const shift of shifts) {
    const intervals = currentDayIntervals(shift);
    for (const [start, end] of intervals) {
      for (let minute = start; minute < end; minute += 1) {
        occupied[minute] = true;
      }
    }
  }
  return occupied;
}

function markCarryInOccupied(occupied, previousDayShifts = []) {
  previousDayShifts.forEach((shift) => {
    if (!isOvernight(shift)) return;
    const end = timeToMinutes(shift.end);
    for (let minute = 0; minute < end; minute += 1) {
      occupied[minute] = true;
    }
  });
}

function isFreeWindow(occupied, startMinute, duration) {
  for (let i = 0; i < duration; i += 1) {
    const minute = (startMinute + i) % MINUTES_IN_DAY;
    if (occupied[minute]) return false;
  }
  return true;
}

function freeWindowLengthFromStart(occupied, startMinute) {
  if (occupied[startMinute]) return 0;
  let length = 0;
  while (length < MINUTES_IN_DAY) {
    const minute = (startMinute + length) % MINUTES_IN_DAY;
    if (occupied[minute]) break;
    length += 1;
  }
  return length;
}

function firstFreeMinute(occupied) {
  for (let minute = 0; minute < MINUTES_IN_DAY; minute += 1) {
    if (!occupied[minute]) return minute;
  }
  return -1;
}

function nextDayPrefixFreeMinutes(nextDayShifts = []) {
  if (!nextDayShifts.length) return MINUTES_IN_DAY;
  const occupied = new Array(MINUTES_IN_DAY).fill(false);
  nextDayShifts.forEach((shift) => {
    const intervals = currentDayIntervals(shift);
    intervals.forEach(([start, end]) => {
      for (let minute = start; minute < end; minute += 1) {
        occupied[minute] = true;
      }
    });
  });
  let free = 0;
  while (free < MINUTES_IN_DAY && !occupied[free]) {
    free += 1;
  }
  return free;
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

export function findNextAvailableShift(shifts, previousDayShifts = [], nextDayShifts = []) {
  const occupied = buildOccupiedMinutes(shifts);
  markCarryInOccupied(occupied, previousDayShifts);
  const anchor = latestShiftAnchor(shifts);
  const searchAnchorStart =
    shifts.length === 0 ? firstFreeMinute(occupied) : anchor.start;
  if (searchAnchorStart < 0) return null;
  const preferredDuration = Math.min(Math.max(anchor.duration, 1), MINUTES_IN_DAY - 1);
  const nextDayFreePrefix = nextDayPrefixFreeMinutes(nextDayShifts);

  for (let offset = 0; offset < MINUTES_IN_DAY; offset += 1) {
    const candidateStart = (searchAnchorStart + offset) % MINUTES_IN_DAY;
    if (occupied[candidateStart]) continue;
    const freeLength = freeWindowLengthFromStart(occupied, candidateStart);
    if (freeLength <= 0) continue;
    const untilMidnight = MINUTES_IN_DAY - candidateStart;
    const maxDurationByNextDay = untilMidnight + nextDayFreePrefix;
    const duration = Math.min(
      preferredDuration,
      freeLength,
      maxDurationByNextDay,
      MINUTES_IN_DAY - 1
    );
    if (duration <= 0) continue;
    if (!isFreeWindow(occupied, candidateStart, duration)) continue;
    const candidateEnd = (candidateStart + duration) % MINUTES_IN_DAY;
    const name = defaultShiftName(shifts.length);
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
    const shiftName = shift.name?.trim() || defaultShiftName(index);
    const color = getShiftColor(shiftName, index);

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
      color: getShiftColor(shiftName, index),
      label: `${shiftName}: ${shiftText(shift)}`,
      shiftId: shift.id,
      shiftIndex: index,
    });
  });
  return segments;
}
