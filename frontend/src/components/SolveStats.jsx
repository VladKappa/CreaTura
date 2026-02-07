import { useMemo, useState } from "react";
import { SHIFT_COLORS } from "../constants/schedule";

const DAY_MINUTES = 24 * 60;

function toMinutes(value) {
  const [hours, minutes] = String(value || "00:00")
    .split(":")
    .map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

function durationHours(start, end) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  let duration = endMinutes - startMinutes;
  if (duration <= 0) duration += DAY_MINUTES;
  return duration / 60;
}

function formatRange(start, end) {
  const overnight = toMinutes(end) <= toMinutes(start);
  return `${start} - ${end}${overnight ? " (+1d)" : ""}`;
}

function PieChart({
  title,
  items,
  valueKey,
  formatValue,
  formatTotal,
  activeEmployeeId,
  onSelectEmployee,
}) {
  const size = 156;
  const radius = 52;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  const chartItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          value: Number(item[valueKey] || 0),
        }))
        .filter((item) => item.value > 0),
    [items, valueKey]
  );

  const total = useMemo(
    () => chartItems.reduce((sum, item) => sum + item.value, 0),
    [chartItems]
  );

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let cumulative = 0;
    return chartItems.map((item) => {
      const length = (item.value / total) * circumference;
      const segment = {
        ...item,
        length,
        offset: cumulative,
      };
      cumulative += length;
      return segment;
    });
  }, [chartItems, total, circumference]);

  return (
    <article className="solve-pie-card">
      <h4>{title}</h4>
      {total <= 0 ? (
        <p className="subtle">No assigned data yet.</p>
      ) : (
        <div className="solve-pie-body">
          <svg className="solve-pie-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e7efe9"
              strokeWidth={strokeWidth}
            />
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {segments.map((segment) => (
                <circle
                  key={`${segment.employeeId}-${valueKey}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${segment.length} ${circumference}`}
                  strokeDashoffset={-segment.offset}
                  className={`solve-pie-segment${
                    activeEmployeeId === segment.employeeId ? " active" : ""
                  }`}
                  onClick={() => onSelectEmployee(segment.employeeId)}
                >
                  <title>
                    {segment.employeeName}: {formatValue(segment.value)} (
                    {((segment.value / total) * 100).toFixed(1)}%)
                  </title>
                </circle>
              ))}
            </g>
            <text x="50%" y="48%" textAnchor="middle" className="solve-pie-total">
              Total
            </text>
            <text x="50%" y="58%" textAnchor="middle" className="solve-pie-total-value">
              {formatTotal(total)}
            </text>
          </svg>

          <ul className="solve-pie-legend">
            {chartItems.map((item) => {
              const share = total <= 0 ? 0 : (item.value / total) * 100;
              const isActive = activeEmployeeId === item.employeeId;
              return (
                <li key={`${item.employeeId}-${valueKey}`}>
                  <button
                    type="button"
                    className={`solve-pie-legend-btn${isActive ? " active" : ""}`}
                    onClick={() => onSelectEmployee(item.employeeId)}
                    title={`${item.employeeName}: ${formatValue(item.value)} (${share.toFixed(1)}%)`}
                  >
                    <i className="solve-pie-dot" style={{ backgroundColor: item.color }} />
                    <span className="solve-pie-name">{item.employeeName}</span>
                    <span className="solve-pie-value">
                      {formatValue(item.value)} ({share.toFixed(1)}%)
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function SolveStats({ solveResult, employees }) {
  const [metric, setMetric] = useState("hours");
  const [sortDirection, setSortDirection] = useState("desc");
  const [activeEmployeeId, setActiveEmployeeId] = useState("");

  const stats = useMemo(() => {
    const byId = {};
    employees.forEach((employee) => {
      byId[employee.id] = {
        employeeId: employee.id,
        employeeName: employee.name,
        shiftCount: 0,
        totalHours: 0,
        shifts: [],
      };
    });

    (solveResult?.assignments || []).forEach((assignment) => {
      const hours = durationHours(assignment.start, assignment.end);
      (assignment.assigned || []).forEach((assigned) => {
        if (!byId[assigned.employee_id]) {
          byId[assigned.employee_id] = {
            employeeId: assigned.employee_id,
            employeeName: assigned.employee_name || "Unknown employee",
            shiftCount: 0,
            totalHours: 0,
            shifts: [],
          };
        }
        const target = byId[assigned.employee_id];
        target.shiftCount += 1;
        target.totalHours += hours;
        target.shifts.push({
          id: `${assignment.date}-${assignment.type}-${assignment.start}-${assignment.end}`,
          label: `${assignment.day} ${assignment.type}`,
          range: formatRange(assignment.start, assignment.end),
          hours,
        });
      });
    });

    if (solveResult?.employee_load?.length) {
      solveResult.employee_load.forEach((load) => {
        if (!byId[load.employee_id]) {
          byId[load.employee_id] = {
            employeeId: load.employee_id,
            employeeName: load.employee_name || "Unknown employee",
            shiftCount: 0,
            totalHours: 0,
            shifts: [],
          };
        }
        if (byId[load.employee_id].shiftCount === 0 && Number.isFinite(load.assigned_count)) {
          byId[load.employee_id].shiftCount = load.assigned_count;
        }
      });
    }

    return Object.values(byId);
  }, [employees, solveResult]);
  const statsWithColors = useMemo(
    () =>
      stats.map((entry, index) => ({
        ...entry,
        color: SHIFT_COLORS[index % SHIFT_COLORS.length],
      })),
    [stats]
  );

  const maxHours = useMemo(
    () => Math.max(1, ...stats.map((entry) => entry.totalHours)),
    [stats]
  );
  const maxShifts = useMemo(
    () => Math.max(1, ...stats.map((entry) => entry.shiftCount)),
    [stats]
  );

  const sortedStats = useMemo(() => {
    const key = metric === "hours" ? "totalHours" : "shiftCount";
    const direction = sortDirection === "desc" ? -1 : 1;
    return [...stats].sort((left, right) => {
      const diff = (left[key] - right[key]) * direction;
      if (diff !== 0) return diff;
      return left.employeeName.localeCompare(right.employeeName);
    });
  }, [metric, sortDirection, stats]);

  const activeEntry =
    sortedStats.find((entry) => entry.employeeId === activeEmployeeId) || null;

  return (
    <section className="panel solve-stats">
      <div className="solve-stats-head">
        <h3>Employee Workload</h3>
        <p className="subtle">Interactive breakdown of solved shifts and total scheduled hours.</p>
      </div>

      <div className="solve-stats-controls">
        <div className="metric-toggle">
          <button
            type="button"
            className={`quiet mini-btn${metric === "hours" ? " active" : ""}`}
            onClick={() => setMetric("hours")}
          >
            Sort by Hours
          </button>
          <button
            type="button"
            className={`quiet mini-btn${metric === "shifts" ? " active" : ""}`}
            onClick={() => setMetric("shifts")}
          >
            Sort by Shifts
          </button>
        </div>
        <button
          type="button"
          className="quiet mini-btn"
          onClick={() =>
            setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))
          }
        >
          {sortDirection === "desc" ? "High to Low" : "Low to High"}
        </button>
      </div>

      <div className="solve-pies">
        <PieChart
          title="Shift Count Distribution"
          items={statsWithColors}
          valueKey="shiftCount"
          formatValue={(value) => `${Math.round(value)}`}
          formatTotal={(value) => `${Math.round(value)}`}
          activeEmployeeId={activeEmployeeId}
          onSelectEmployee={setActiveEmployeeId}
        />
        <PieChart
          title="Worked Hours Distribution"
          items={statsWithColors}
          valueKey="totalHours"
          formatValue={(value) => `${value.toFixed(1)}h`}
          formatTotal={(value) => `${value.toFixed(1)}h`}
          activeEmployeeId={activeEmployeeId}
          onSelectEmployee={setActiveEmployeeId}
        />
      </div>

      <div className="solve-stats-list">
        {sortedStats.map((entry) => {
          const hoursPct = Math.max(4, (entry.totalHours / maxHours) * 100);
          const shiftsPct = Math.max(4, (entry.shiftCount / maxShifts) * 100);
          const isActive = activeEmployeeId === entry.employeeId;
          return (
            <button
              key={entry.employeeId}
              type="button"
              className={`solve-stats-row${isActive ? " active" : ""}`}
              onClick={() => setActiveEmployeeId(entry.employeeId)}
              title={`${entry.employeeName}: ${entry.shiftCount} shifts, ${entry.totalHours.toFixed(1)}h`}
            >
              <div className="solve-stats-row-head">
                <strong>{entry.employeeName}</strong>
                <span>
                  {entry.shiftCount} shifts | {entry.totalHours.toFixed(1)}h
                </span>
              </div>

              <div className="solve-stats-bars">
                <div className={`solve-stats-bar${metric === "hours" ? " focus" : ""}`}>
                  <span>Hours</span>
                  <div className="solve-stats-track">
                    <div className="solve-stats-fill hours" style={{ width: `${hoursPct}%` }} />
                  </div>
                  <b>{entry.totalHours.toFixed(1)}h</b>
                </div>
                <div className={`solve-stats-bar${metric === "shifts" ? " focus" : ""}`}>
                  <span>Shifts</span>
                  <div className="solve-stats-track">
                    <div className="solve-stats-fill shifts" style={{ width: `${shiftsPct}%` }} />
                  </div>
                  <b>{entry.shiftCount}</b>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeEntry ? (
        <div className="solve-stats-detail">
          <p>
            <strong>{activeEntry.employeeName}</strong> assignments:
          </p>
          {activeEntry.shifts.length === 0 ? (
            <p className="subtle">No assigned shifts.</p>
          ) : (
            <ul className="solve-stats-shifts">
              {activeEntry.shifts.map((shift) => (
                <li key={shift.id}>
                  {shift.label} | {shift.range} | {shift.hours.toFixed(1)}h
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="subtle">Click an employee row to inspect assigned shifts.</p>
      )}
    </section>
  );
}
