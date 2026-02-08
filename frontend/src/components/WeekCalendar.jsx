import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { HOUR_MARKERS, MINUTES_IN_DAY } from "../constants/schedule";
import {
  buildCarryInSegments,
  buildOwnSegments,
  defaultShiftName,
  getDayShifts,
  getShiftColor,
  PREFERENCE_META,
  PREFERENCE_KEYS,
} from "../utils/schedule";
import ShiftEditor from "./ShiftEditor";

export default function WeekCalendar({
  t,
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
      const name = shift.name?.trim() || defaultShiftName(index);
      const key = name.toLowerCase();
      if (!legendMap.has(key)) {
        legendMap.set(key, {
          key,
          name,
          color: getShiftColor(name, index),
        });
      }
    });
  });
  const legendEntries = Array.from(legendMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const selectedShift = activeSelection
    ? resolveShift(activeSelection.source, activeSelection.segment.shiftId)
    : null;
  const selectedConstraints = selectedShift?.constraints || [];

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("week.title", {}, "Week Calendar")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "week.subtitle",
              {},
              "Click a shift block to manage one or more employee constraints."
            )}
          </Typography>
          {clipboardLabel ? (
            <Typography variant="caption" color="text.secondary">
              {t("week.copyHint", { label: clipboardLabel }, `Clipboard: ${clipboardLabel}`)}
            </Typography>
          ) : null}
        </Box>

        {legendEntries.length > 0 ? (
          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
            {legendEntries.map((entry) => (
              <Chip
                key={entry.key}
                size="small"
                variant="outlined"
                label={entry.name}
                icon={
                  <Box
                    component="span"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: entry.color,
                      display: "inline-block",
                    }}
                  />
                }
              />
            ))}
          </Stack>
        ) : null}

        <Stack direction="row" justifyContent="flex-end">
          <Button
            type="button"
            size="small"
            variant="outlined"
            onClick={() => setIsInspectorVisible((prev) => !prev)}
          >
            {isInspectorVisible
              ? t("week.hideInspector", {}, "Hide Inspector")
              : t("week.showInspector", {}, "Show Inspector")}
          </Button>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: isInspectorVisible
              ? { xs: "1fr", lg: "minmax(0, 1fr) 320px" }
              : "1fr",
            gap: 1.2,
          }}
        >
          <Box
            className="week-scroll"
            sx={{
              width: "100%",
              overflowX: "auto",
              pb: 0.6,
            }}
          >
            <Box
              className="week-grid"
              sx={{
                minWidth: 980,
                display: "grid",
                gridTemplateColumns: `repeat(${week.length}, minmax(138px, 1fr))`,
                gap: 0.8,
              }}
            >
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
                  <Paper key={day.iso} variant="outlined" className="day-card">
                    <Box className="day-header">
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 700, display: "flex", justifyContent: "space-between" }}
                      >
                        {day.label}
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                          {day.dateText}
                        </Box>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {shifts.length === 0
                          ? t("common.off", {}, "Off")
                          : t("common.shifts", { count: shifts.length }, `${shifts.length} shifts`)}
                      </Typography>
                    </Box>

                    <Box className="day-actions">
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={Boolean(override)}
                            onChange={(e) => onToggleOverride(day, e.target.checked)}
                          />
                        }
                        label={t("common.custom", {}, "Custom")}
                        sx={{ m: 0 }}
                      />
                      <Button type="button" size="small" variant="outlined" onClick={() => onCopyDay(day)}>
                        {t("common.copy", {}, "Copy")}
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        variant="outlined"
                        disabled={!clipboardLabel}
                        onClick={() => onPasteDay(day)}
                      >
                        {t("common.paste", {}, "Paste")}
                      </Button>
                      {override ? (
                        <Button type="button" size="small" variant="outlined" onClick={() => toggleEditor(day.iso)}>
                          {expandedEditors[day.iso]
                            ? t("common.hideEdit", {}, "Hide Edit")
                            : t("common.edit", {}, "Edit")}
                        </Button>
                      ) : null}
                    </Box>

                    <Box className="day-card-scroll">
                      <Box className="timeline compact">
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
                              title={
                                segment.carry
                                  ? t("week.carryOver", { label: segment.label }, `Carry-over: ${segment.label}`)
                                  : segment.label
                              }
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
                          const shiftType = shift.name?.trim() || defaultShiftName(segment.shiftIndex || 0);
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
                      </Box>

                      {override && expandedEditors[day.iso] ? (
                        <ShiftEditor
                          t={t}
                          shifts={override}
                          onAdd={() => onAddOverrideShift(day)}
                          onRemove={(shiftId) => onRemoveOverrideShift(day, shiftId)}
                          onChange={(shiftId, patch) => onUpdateOverrideShift(day, shiftId, patch)}
                          errorMessage={getOverrideError(day)}
                        />
                      ) : null}
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>

          {isInspectorVisible ? (
            <Paper
              variant="outlined"
              sx={{
                p: 1.2,
                height: "fit-content",
                position: { lg: "sticky" },
                top: { lg: 86 },
              }}
            >
              <Stack spacing={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t("week.inspectorTitle", {}, "Shift Inspector")}
                </Typography>
                {!activeSelection || !selectedShift ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("week.selectShiftHint", {}, "Select a shift block to edit employee constraints.")}
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    <Typography variant="caption" color="text.secondary">
                      {activeSelection.day.label} {activeSelection.day.dateText}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t(
                        "week.shiftLabel",
                        {
                          name:
                            selectedShift.name?.trim() ||
                            defaultShiftName(activeSelection.segment.shiftIndex || 0),
                        },
                        `Shift: ${
                          selectedShift.name?.trim() ||
                          defaultShiftName(activeSelection.segment.shiftIndex || 0)
                        }`
                      )}
                    </Typography>

                    <Stack spacing={0.8}>
                      {selectedConstraints.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {t("week.noConstraints", {}, "No constraints yet.")}
                        </Typography>
                      ) : (
                        selectedConstraints.map((constraint, index) => {
                          const usedByOthers = new Set(
                            selectedConstraints
                              .filter((_, candidateIndex) => candidateIndex !== index)
                              .map((candidate) => candidate.employeeId)
                          );
                          return (
                            <Paper key={`${constraint.employeeId}-${index}`} variant="outlined" sx={{ p: 0.8 }}>
                              <Stack spacing={0.8}>
                                <Select
                                  size="small"
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
                                  <MenuItem value="">
                                    {t("week.selectEmployee", {}, "Select employee")}
                                  </MenuItem>
                                  {employees.map((worker) => (
                                    <MenuItem
                                      key={worker.id}
                                      value={worker.id}
                                      disabled={usedByOthers.has(worker.id)}
                                    >
                                      {worker.name}
                                    </MenuItem>
                                  ))}
                                </Select>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8}>
                                  <Select
                                    size="small"
                                    sx={{ flex: 1 }}
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
                                        <MenuItem key={key} value={key}>
                                          {meta.emoji} {meta.label}
                                        </MenuItem>
                                      );
                                    })}
                                  </Select>
                                  <Button
                                    type="button"
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    onClick={() =>
                                      onRemoveShiftConstraint(
                                        activeSelection.source,
                                        activeSelection.segment.shiftId,
                                        index
                                      )
                                    }
                                  >
                                    {t("week.removeConstraint", {}, "Remove")}
                                  </Button>
                                </Stack>
                              </Stack>
                            </Paper>
                          );
                        })
                      )}
                    </Stack>

                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={selectedConstraints.length >= employees.length}
                      onClick={() =>
                        onAddShiftConstraint(activeSelection.source, activeSelection.segment.shiftId)
                      }
                    >
                      {t("week.addConstraint", {}, "+ Add Constraint")}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Paper>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
}
