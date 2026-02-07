import { useMemo, useState } from "react";
import { HOUR_MARKERS, MINUTES_IN_DAY, SHIFT_COLORS } from "../constants/schedule";
import {
  buildCarryInSegments,
  buildOwnSegments,
  defaultShiftName,
  getDayShifts,
  PREFERENCE_META,
  PREFERENCE_KEYS,
} from "../utils/schedule";
import ShiftEditor from "./ShiftEditor";

export default function WeekCalendar({
  week,
  employee,
  employees,
  onToggleOverride,
  onAddOverrideShift,
  onRemoveOverrideShift,
  onUpdateOverrideShift,
  getOverrideError,
  onCopyDay,
  onPasteDay,
  clipboardLabel,
  onAddShiftConstraint,
  onUpdateShiftConstraint,
  onRemoveShiftConstraint,
  solvedAssignments = {},
}) {
  const [activeBlockKey, setActiveBlockKey] = useState("");
  const [activeSelection, setActiveSelection] = useState(null);
  const [expandedEditors, setExpandedEditors] = useState({});
  const [isInspectorVisible, setIsInspectorVisible] = useState(true);

  const employeeMap = useMemo(
    () => Object.fromEntries(employees.map((worker) => [worker.id, worker])),
    [employees]
  );

  function resolveShift(source, shiftId) {
    const sourceShifts = source.usesOverride
      ? employee.overrides[source.dayIso] || []
      : employee.defaultShiftsByDay[source.dayIndex];
    return sourceShifts.find((shift) => shift.id === shiftId) || null;
  }

  function makeShiftKey(date, type, start, end) {
    return `${date}__${type}__${start}__${end}`;
  }

  function toggleEditor(dayIso) {
    setExpandedEditors((prev) => ({ ...prev, [dayIso]: !prev[dayIso] }));
  }

  const legendMap = new Map();
  week.forEach((day) => {
    const shifts = getDayShifts(employee, day);
    shifts.forEach((shift, index) => {
      if (!legendMap.has(index)) {
        legendMap.set(index, {
          index,
          color: SHIFT_COLORS[index % SHIFT_COLORS.length],
          name: shift.name?.trim() || defaultShiftName(index),
        });
      }
    });
  });
  const legendEntries = Array.from(legendMap.values()).sort((a, b) => a.index - b.index);

  const selectedShift = activeSelection
    ? resolveShift(activeSelection.source, activeSelection.segment.shiftId)
    : null;
  const selectedConstraints = selectedShift?.constraints || [];

  return (
    <section className="panel">
      <h2>Week Calendar</h2>
      <p className="subtle">Click a block to manage one or more employee constraints.</p>
      {clipboardLabel ? <p className="subtle">Clipboard: {clipboardLabel}</p> : null}

      {legendEntries.length > 0 ? (
        <div className="shift-color-legend">
          {legendEntries.map((entry) => (
            <span key={entry.index}>
              <i style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="calendar-actions">
        <button
          type="button"
          className="quiet mini-btn"
          onClick={() => setIsInspectorVisible((prev) => !prev)}
        >
          {isInspectorVisible ? "Hide Inspector" : "Show Inspector"}
        </button>
      </div>

      <div className={`week-main${isInspectorVisible ? "" : " no-inspector"}`}>
        <div className="week-scroll">
          <div className="week-grid" style={{ "--week-days": week.length }}>
            {week.map((day, index) => {
              const override = employee.overrides[day.iso] || null;
              const usesOverride = Boolean(override);
              const shifts = getDayShifts(employee, day);
              const previousDay = index > 0 ? week[index - 1] : null;
              const previousUsesOverride = previousDay
                ? Boolean(employee.overrides[previousDay.iso])
                : false;
              const previousShifts = previousDay ? getDayShifts(employee, previousDay) : [];
              const segments = [
                ...buildCarryInSegments(previousShifts).map((segment) => ({
                  ...segment,
                  source: {
                    dayIso: previousDay?.iso || day.iso,
                    dayIndex: previousDay?.dayIndex ?? day.dayIndex,
                    usesOverride: previousUsesOverride,
                  },
                })),
                ...buildOwnSegments(shifts).map((segment) => ({
                  ...segment,
                  source: {
                    dayIso: day.iso,
                    dayIndex: day.dayIndex,
                    usesOverride,
                  },
                })),
              ];

              return (
                <article key={day.iso} className="day-card compact">
                  <header className="day-header">
                    <h3>
                      {day.label} <span>{day.dateText}</span>
                    </h3>
                    <p className="effective">{shifts.length === 0 ? "Off" : `${shifts.length} shifts`}</p>
                  </header>

                  <div className="day-actions">
                    <label className="checkbox dense">
                      <input
                        type="checkbox"
                        checked={Boolean(override)}
                        onChange={(e) => onToggleOverride(day, e.target.checked)}
                      />
                      Custom
                    </label>
                    <button type="button" className="quiet mini-btn" onClick={() => onCopyDay(day)}>
                      Copy
                    </button>
                    <button
                      type="button"
                      className="quiet mini-btn"
                      disabled={!clipboardLabel}
                      onClick={() => onPasteDay(day)}
                    >
                      Paste
                    </button>
                    {override ? (
                      <button type="button" className="quiet mini-btn" onClick={() => toggleEditor(day.iso)}>
                        {expandedEditors[day.iso] ? "Hide Edit" : "Edit"}
                      </button>
                    ) : null}
                  </div>

                  <div className="day-card-scroll">
                    <div className="timeline compact">
                      {HOUR_MARKERS.map((hour, markerIndex) => (
                        <div
                          key={hour}
                          className={`hour-mark${markerIndex === 0 ? " is-start" : ""}${
                            markerIndex === HOUR_MARKERS.length - 1 ? " is-end" : ""
                          }`}
                          style={{ top: `${(hour / 24) * 100}%` }}
                        >
                          <span>{hour.toString().padStart(2, "0")}:00</span>
                        </div>
                      ))}
                      {segments.map((segment) => {
                        const top = (segment.start / MINUTES_IN_DAY) * 100;
                        const height = Math.max(((segment.end - segment.start) / MINUTES_IN_DAY) * 100, 2);
                        const blockKey = `${segment.source.dayIso}:${segment.shiftId}`;
                        const isActive = activeBlockKey === blockKey;

                        return (
                          <div
                            key={segment.id}
                            className={`shift-block${segment.carry ? " carry" : ""}${isActive ? " active" : ""}`}
                            style={{
                              top: `${top}%`,
                              height: `${height}%`,
                              "--shift-color": segment.color,
                            }}
                            title={segment.carry ? `Carry-over: ${segment.label}` : segment.label}
                            onClick={() => {
                              setActiveBlockKey(blockKey);
                              setActiveSelection({ day, source: segment.source, segment });
                            }}
                          />
                        );
                      })}
                      {segments.map((segment) => {
                        const top = (segment.start / MINUTES_IN_DAY) * 100;
                        const shift = resolveShift(segment.source, segment.shiftId);
                        if (!shift) return null;
                        const constraints = shift?.constraints || [];
                        const rows = constraints.map((constraint, constraintIndex) => {
                          const worker = employeeMap[constraint.employeeId];
                          const pref = PREFERENCE_META[constraint.preference];
                          return {
                            id: `${constraint.employeeId || "unknown"}-${constraintIndex}`,
                            text: `${worker ? worker.name : "Unknown"} - ${
                              pref ? `${pref.emoji} ${pref.label}` : "No preference"
                            }`,
                          };
                        });
                        if (rows.length === 0) return null;
                        const title = rows.map((row) => row.text).join("\n");
                        return (
                          <div
                            key={`${segment.id}-label`}
                            className="shift-assignee compact"
                            style={{ top: `${top}%` }}
                            title={title || shift?.name || "Shift"}
                          >
                            {rows.map((row) => (
                              <span key={row.id} className="assignee-line assignee-row">
                                {row.text}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                      {segments.map((segment) => {
                        const shift = resolveShift(segment.source, segment.shiftId);
                        if (!shift) return null;
                        const shiftType =
                          shift.name?.trim() || defaultShiftName(segment.shiftIndex || 0);
                        const key = makeShiftKey(segment.source.dayIso, shiftType, shift.start, shift.end);
                        const solvedAssigned = solvedAssignments[key] || [];
                        if (solvedAssigned.length === 0) return null;
                        const middle = ((segment.start + segment.end) / 2 / MINUTES_IN_DAY) * 100;
                        const solvedNames = solvedAssigned
                          .map((assigned) => assigned.employee_name || "Unknown")
                          .join(", ");
                        return (
                          <div
                            key={`${segment.id}-solved`}
                            className="shift-solved-center"
                            style={{ top: `${middle}%` }}
                            title={solvedNames}
                          >
                            {solvedNames}
                          </div>
                        );
                      })}
                    </div>

                    {override && expandedEditors[day.iso] ? (
                      <ShiftEditor
                        shifts={override}
                        onAdd={() => onAddOverrideShift(day)}
                        onRemove={(shiftId) => onRemoveOverrideShift(day, shiftId)}
                        onChange={(shiftId, patch) => onUpdateOverrideShift(day, shiftId, patch)}
                        errorMessage={getOverrideError(day)}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {isInspectorVisible ? (
          <aside className="shift-inspector">
            <h3>Shift Inspector</h3>
            {!activeSelection || !selectedShift ? (
              <p className="subtle">Select a shift block to edit employee constraints.</p>
            ) : (
              <div className="inspector-body">
                <p className="subtle">
                  {activeSelection.day.label} {activeSelection.day.dateText}
                </p>
                <p className="inspector-shift-name">
                  Shift:{" "}
                  {selectedShift.name?.trim() ||
                    defaultShiftName(activeSelection.segment.shiftIndex || 0)}
                </p>
                <div className="constraint-list">
                  {selectedConstraints.length === 0 ? (
                    <p className="subtle">No constraints yet.</p>
                  ) : (
                    selectedConstraints.map((constraint, index) => {
                      const usedByOthers = new Set(
                        selectedConstraints
                          .filter((_, candidateIndex) => candidateIndex !== index)
                          .map((candidate) => candidate.employeeId)
                      );
                      return (
                        <div key={`${constraint.employeeId}-${index}`} className="constraint-row">
                          <select
                            value={constraint.employeeId}
                            onChange={(e) =>
                              onUpdateShiftConstraint(
                                activeSelection.source,
                                activeSelection.segment.shiftId,
                                index,
                                { employeeId: e.target.value }
                              )
                            }
                          >
                            <option value="">Select employee</option>
                            {employees.map((worker) => (
                              <option
                                key={worker.id}
                                value={worker.id}
                                disabled={usedByOthers.has(worker.id)}
                              >
                                {worker.name}
                              </option>
                            ))}
                          </select>
                          <div className="constraint-actions">
                            <select
                              value={constraint.preference}
                              onChange={(e) =>
                                onUpdateShiftConstraint(
                                  activeSelection.source,
                                  activeSelection.segment.shiftId,
                                  index,
                                  { preference: e.target.value }
                                )
                              }
                            >
                              {PREFERENCE_KEYS.map((key) => {
                                const meta = PREFERENCE_META[key];
                                return (
                                  <option key={key} value={key}>
                                    {meta.emoji} {meta.label}
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              type="button"
                              className="quiet danger mini-btn"
                              onClick={() =>
                                onRemoveShiftConstraint(
                                  activeSelection.source,
                                  activeSelection.segment.shiftId,
                                  index
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  className="quiet mini-btn"
                  disabled={selectedConstraints.length >= employees.length}
                  onClick={() =>
                    onAddShiftConstraint(activeSelection.source, activeSelection.segment.shiftId)
                  }
                >
                  + Add Constraint
                </button>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
