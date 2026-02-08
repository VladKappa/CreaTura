import { useMemo, useState } from "react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
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

function createConstraintStats(employeeId = "", employeeName = "") {
  return {
    employeeId,
    employeeName,
    hardTotal: 0,
    hardSatisfied: 0,
    hardViolated: 0,
    hardRequire: 0,
    hardRequireSatisfied: 0,
    hardForbid: 0,
    hardForbidSatisfied: 0,
    softTotal: 0,
    softSatisfied: 0,
    softViolated: 0,
    softPrefer: 0,
    softPreferSatisfied: 0,
    softAvoid: 0,
    softAvoidSatisfied: 0,
  };
}

function shiftMatchesRule(shift, rule) {
  if (rule?.date !== undefined && rule?.date !== null && shift.date !== rule.date) return false;
  if (rule?.day !== undefined && rule?.day !== null && shift.day !== rule.day) return false;
  if (rule?.shift_type !== undefined && rule?.shift_type !== null && shift.type !== rule.shift_type) {
    return false;
  }
  return true;
}

function assignmentKey(shift) {
  return `${shift.date}__${shift.day}__${shift.type}__${shift.start}__${shift.end}`;
}

function hasEmployeeAssigned(assignment, employeeId) {
  return (assignment?.assigned || []).some((assigned) => assigned.employee_id === employeeId);
}

function buildConstraintStatsByEmployee({ employees, solvePayload, solveResult }) {
  const byId = {};
  const employeeNameById = Object.fromEntries(
    (employees || []).map((employee) => [employee.id, employee.name])
  );

  function ensure(employeeId) {
    if (!byId[employeeId]) {
      byId[employeeId] = createConstraintStats(
        employeeId,
        employeeNameById[employeeId] || "Unknown employee"
      );
    }
    return byId[employeeId];
  }

  if (!solvePayload?.constraints || !Array.isArray(solvePayload?.shifts)) {
    return byId;
  }

  const assignmentByShift = {};
  (solveResult?.assignments || []).forEach((assignment) => {
    assignmentByShift[assignmentKey(assignment)] = assignment;
  });

  (solvePayload.constraints.hard || []).forEach((hardRule) => {
    const target = ensure(hardRule.employee_id);
    target.hardTotal += 1;
    if (hardRule.type === "require_shift") target.hardRequire += 1;
    if (hardRule.type === "forbid_shift") target.hardForbid += 1;

    const matchingShifts = solvePayload.shifts.filter((shift) => shiftMatchesRule(shift, hardRule));
    if (matchingShifts.length === 0) return;

    const satisfied = matchingShifts.every((shift) => {
      const assignment = assignmentByShift[assignmentKey(shift)];
      if (!assignment) return false;
      const assigned = hasEmployeeAssigned(assignment, hardRule.employee_id);
      if (hardRule.type === "require_shift") return assigned;
      return !assigned;
    });

    if (satisfied) {
      target.hardSatisfied += 1;
      if (hardRule.type === "require_shift") target.hardRequireSatisfied += 1;
      if (hardRule.type === "forbid_shift") target.hardForbidSatisfied += 1;
    } else {
      target.hardViolated += 1;
    }
  });

  (solvePayload.constraints.soft || []).forEach((softRule) => {
    const target = ensure(softRule.employee_id);
    target.softTotal += 1;
    if (softRule.type === "prefer_assignment") target.softPrefer += 1;
    if (softRule.type === "avoid_assignment") target.softAvoid += 1;

    const matchingShifts = solvePayload.shifts.filter((shift) => shiftMatchesRule(shift, softRule));
    if (matchingShifts.length === 0) return;

    const satisfied = matchingShifts.every((shift) => {
      const assignment = assignmentByShift[assignmentKey(shift)];
      if (!assignment) return false;
      const assigned = hasEmployeeAssigned(assignment, softRule.employee_id);
      if (softRule.type === "prefer_assignment") return assigned;
      return !assigned;
    });

    if (satisfied) {
      target.softSatisfied += 1;
      if (softRule.type === "prefer_assignment") target.softPreferSatisfied += 1;
      if (softRule.type === "avoid_assignment") target.softAvoidSatisfied += 1;
    } else {
      target.softViolated += 1;
    }
  });

  return byId;
}

function PieChart({
  t,
  title,
  items,
  valueKey,
  formatValue,
  formatTotal,
  activeEmployeeId,
  onSelectEmployee,
}) {
  const size = 160;
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
    <Paper variant="outlined" sx={{ p: 1.2 }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {total <= 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("stats.noAssigned", {}, "No assigned data yet.")}
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "160px minmax(0, 1fr)" },
              gap: 1.2,
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "grid", justifyItems: "center" }}>
              <svg viewBox={`0 0 ${size} ${size}`} width={160} height={160} role="img" aria-label={title}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#8fa0be44"
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
                      opacity={activeEmployeeId && activeEmployeeId !== segment.employeeId ? 0.45 : 1}
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelectEmployee(segment.employeeId)}
                    >
                      <title>
                        {segment.employeeName}: {formatValue(segment.value)} (
                        {((segment.value / total) * 100).toFixed(1)}%)
                      </title>
                    </circle>
                  ))}
                </g>
                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  style={{ fontSize: 10, fill: "#8FA0BF", fontWeight: 600 }}
                >
                  {t("stats.total", {}, "Total")}
                </text>
                <text
                  x="50%"
                  y="59%"
                  textAnchor="middle"
                  style={{ fontSize: 11, fill: "#C9D1E6", fontWeight: 700 }}
                >
                  {formatTotal(total)}
                </text>
              </svg>
            </Box>

            <Stack spacing={0.7} sx={{ maxHeight: 164, overflow: "auto" }}>
              {chartItems.map((item) => {
                const share = total <= 0 ? 0 : (item.value / total) * 100;
                const isActive = activeEmployeeId === item.employeeId;
                return (
                  <Button
                    key={`${item.employeeId}-${valueKey}`}
                    variant={isActive ? "contained" : "outlined"}
                    color={isActive ? "primary" : "inherit"}
                    size="small"
                    onClick={() => onSelectEmployee(item.employeeId)}
                    sx={{
                      justifyContent: "space-between",
                      textTransform: "none",
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="caption" noWrap title={item.employeeName}>
                        {item.employeeName}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap", ml: 1 }}>
                      {formatValue(item.value)} ({share.toFixed(1)}%)
                    </Typography>
                  </Button>
                );
              })}
            </Stack>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

export default function SolveStats({ t, solveResult, employees, solvePayload }) {
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
        ...createConstraintStats(employee.id, employee.name),
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
            ...createConstraintStats(assigned.employee_id, assigned.employee_name || "Unknown employee"),
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
            ...createConstraintStats(load.employee_id, load.employee_name || "Unknown employee"),
          };
        }
        if (byId[load.employee_id].shiftCount === 0 && Number.isFinite(load.assigned_count)) {
          byId[load.employee_id].shiftCount = load.assigned_count;
        }
      });
    }

    const constraintStatsByEmployee = buildConstraintStatsByEmployee({
      employees,
      solvePayload,
      solveResult,
    });

    Object.values(constraintStatsByEmployee).forEach((constraintStats) => {
      if (!byId[constraintStats.employeeId]) {
        byId[constraintStats.employeeId] = {
          employeeId: constraintStats.employeeId,
          employeeName: constraintStats.employeeName || "Unknown employee",
          shiftCount: 0,
          totalHours: 0,
          shifts: [],
          ...createConstraintStats(constraintStats.employeeId, constraintStats.employeeName),
        };
      }
      byId[constraintStats.employeeId] = {
        ...byId[constraintStats.employeeId],
        ...constraintStats,
      };
    });

    return Object.values(byId);
  }, [employees, solvePayload, solveResult]);

  const statsWithColors = useMemo(
    () =>
      stats.map((entry, index) => ({
        ...entry,
        color: SHIFT_COLORS[index % SHIFT_COLORS.length],
        constraintCount: Number(entry.hardTotal || 0) + Number(entry.softTotal || 0),
      })),
    [stats]
  );

  const maxHours = useMemo(() => Math.max(1, ...stats.map((entry) => entry.totalHours)), [stats]);
  const maxShifts = useMemo(() => Math.max(1, ...stats.map((entry) => entry.shiftCount)), [stats]);

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
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("stats.title", {}, "Employee Workload")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "stats.subtitle",
              {},
              "Interactive breakdown of solved shifts and total scheduled hours."
            )}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            type="button"
            variant={metric === "hours" ? "contained" : "outlined"}
            onClick={() => setMetric("hours")}
          >
            {t("stats.sortHours", {}, "Sort by Hours")}
          </Button>
          <Button
            type="button"
            variant={metric === "shifts" ? "contained" : "outlined"}
            onClick={() => setMetric("shifts")}
          >
            {t("stats.sortShifts", {}, "Sort by Shifts")}
          </Button>
          <Button
            type="button"
            variant="outlined"
            onClick={() => setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))}
          >
            {sortDirection === "desc"
              ? t("stats.highToLow", {}, "High to Low")
              : t("stats.lowToHigh", {}, "Low to High")}
          </Button>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 1.2,
          }}
        >
          <PieChart
            t={t}
            title={t("stats.constraintPie", {}, "Constraint Count Distribution")}
            items={statsWithColors}
            valueKey="constraintCount"
            formatValue={(value) => `${Math.round(value)}`}
            formatTotal={(value) => `${Math.round(value)}`}
            activeEmployeeId={activeEmployeeId}
            onSelectEmployee={setActiveEmployeeId}
          />
          <PieChart
            t={t}
            title={t("stats.shiftPie", {}, "Shift Count Distribution")}
            items={statsWithColors}
            valueKey="shiftCount"
            formatValue={(value) => `${Math.round(value)}`}
            formatTotal={(value) => `${Math.round(value)}`}
            activeEmployeeId={activeEmployeeId}
            onSelectEmployee={setActiveEmployeeId}
          />
          <PieChart
            t={t}
            title={t("stats.hoursPie", {}, "Worked Hours Distribution")}
            items={statsWithColors}
            valueKey="totalHours"
            formatValue={(value) => `${value.toFixed(1)}h`}
            formatTotal={(value) => `${value.toFixed(1)}h`}
            activeEmployeeId={activeEmployeeId}
            onSelectEmployee={setActiveEmployeeId}
          />
        </Box>

        <Stack spacing={1}>
          {sortedStats.map((entry) => {
            const hoursPct = Math.max(4, (entry.totalHours / maxHours) * 100);
            const shiftsPct = Math.max(4, (entry.shiftCount / maxShifts) * 100);
            const isActive = activeEmployeeId === entry.employeeId;
            const constraintCount = entry.hardTotal + entry.softTotal;
            return (
              <Paper
                key={entry.employeeId}
                variant="outlined"
                sx={{
                  p: 1.1,
                  borderColor: isActive ? "primary.main" : "divider",
                  backgroundColor: isActive ? "action.selected" : "background.paper",
                }}
              >
                <Stack spacing={1}>
                  <Button
                    type="button"
                    variant="text"
                    color="inherit"
                    onClick={() => setActiveEmployeeId(entry.employeeId)}
                    sx={{ justifyContent: "space-between", textTransform: "none", px: 0 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={entry.employeeName}>
                      {entry.employeeName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.shiftCount} {t("stats.shifts", {}, "Shifts").toLowerCase()} |{" "}
                      {entry.totalHours.toFixed(1)}h |{" "}
                      {t("stats.constraints", { count: constraintCount }, `${constraintCount} constraints`)}
                    </Typography>
                  </Button>

                  <Box sx={{ display: "grid", gap: 0.8 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" sx={{ width: 48 }}>
                        {t("stats.hours", {}, "Hours")}
                      </Typography>
                      <Box
                        sx={{
                          flex: 1,
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: "action.hover",
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            height: "100%",
                            width: `${hoursPct}%`,
                            background: "linear-gradient(90deg, #2D8F6A 0%, #6EC59F 100%)",
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ minWidth: 44 }}>
                        {entry.totalHours.toFixed(1)}h
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" sx={{ width: 48 }}>
                        {t("stats.shifts", {}, "Shifts")}
                      </Typography>
                      <Box
                        sx={{
                          flex: 1,
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: "action.hover",
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            height: "100%",
                            width: `${shiftsPct}%`,
                            background: "linear-gradient(90deg, #2F76BB 0%, #7FB0E0 100%)",
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ minWidth: 44 }}>
                        {entry.shiftCount}
                      </Typography>
                    </Stack>
                  </Box>

                  <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      color={entry.hardViolated > 0 ? "error" : "success"}
                      label={t(
                        "stats.hard",
                        { satisfied: entry.hardSatisfied, total: entry.hardTotal },
                        `Hard ${entry.hardSatisfied}/${entry.hardTotal}`
                      )}
                    />
                    <Chip
                      size="small"
                      color={entry.softViolated > 0 ? "warning" : "success"}
                      label={t(
                        "stats.soft",
                        { satisfied: entry.softSatisfied, total: entry.softTotal },
                        `Soft ${entry.softSatisfied}/${entry.softTotal}`
                      )}
                    />
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>

        {activeEntry ? (
          <Paper variant="outlined" sx={{ p: 1.2 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t(
                  "stats.constraintStats",
                  { name: activeEntry.employeeName },
                  `${activeEntry.employeeName} constraint statistics:`
                )}
              </Typography>
              {activeEntry.hardTotal + activeEntry.softTotal === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t(
                    "stats.noConstraintForEmployee",
                    {},
                    "No user hard/soft constraints configured for this employee."
                  )}
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                    gap: 1,
                  }}
                >
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t("stats.hardConstraints", {}, "Hard constraints")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.satisfied",
                          { satisfied: activeEntry.hardSatisfied, total: activeEntry.hardTotal },
                          `Satisfied ${activeEntry.hardSatisfied} / ${activeEntry.hardTotal}`
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.requireMet",
                          {
                            satisfied: activeEntry.hardRequireSatisfied,
                            total: activeEntry.hardRequire,
                          },
                          `Require met ${activeEntry.hardRequireSatisfied} / ${activeEntry.hardRequire}`
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.forbidRespected",
                          {
                            satisfied: activeEntry.hardForbidSatisfied,
                            total: activeEntry.hardForbid,
                          },
                          `Forbid respected ${activeEntry.hardForbidSatisfied} / ${activeEntry.hardForbid}`
                        )}
                      </Typography>
                    </Stack>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t("stats.softConstraints", {}, "Soft constraints")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.satisfied",
                          { satisfied: activeEntry.softSatisfied, total: activeEntry.softTotal },
                          `Satisfied ${activeEntry.softSatisfied} / ${activeEntry.softTotal}`
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.preferredMet",
                          {
                            satisfied: activeEntry.softPreferSatisfied,
                            total: activeEntry.softPrefer,
                          },
                          `Preferred met ${activeEntry.softPreferSatisfied} / ${activeEntry.softPrefer}`
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          "stats.unpreferredRespected",
                          {
                            satisfied: activeEntry.softAvoidSatisfied,
                            total: activeEntry.softAvoid,
                          },
                          `Unpreferred respected ${activeEntry.softAvoidSatisfied} / ${activeEntry.softAvoid}`
                        )}
                      </Typography>
                    </Stack>
                  </Paper>
                </Box>
              )}

              <Typography variant="subtitle2" sx={{ mt: 0.5 }}>
                {t(
                  "stats.assignments",
                  { name: activeEntry.employeeName },
                  `${activeEntry.employeeName} assignments:`
                )}
              </Typography>
              {activeEntry.shifts.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("stats.noAssignments", {}, "No assigned shifts.")}
                </Typography>
              ) : (
                <Stack component="ul" sx={{ m: 0, pl: 2, gap: 0.4 }}>
                  {activeEntry.shifts.map((shift) => (
                    <Typography component="li" key={shift.id} variant="body2" color="text.secondary">
                      {shift.label} | {shift.range} | {shift.hours.toFixed(1)}h
                    </Typography>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("stats.inspectHint", {}, "Click an employee row to inspect assigned shifts.")}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
