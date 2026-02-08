import { useCallback, useEffect, useMemo, useState } from "react";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import ViewWeekOutlinedIcon from "@mui/icons-material/ViewWeekOutlined";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Stack,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import { fetchScheduleState, saveScheduleState, solveSchedule } from "./api/scheduleApi";
import ConstraintsConfig from "./components/ConstraintsConfig";
import EmployeeSidebar from "./components/EmployeeSidebar";
import SolveDiagnostics from "./components/SolveDiagnostics";
import SolveStats from "./components/SolveStats";
import TemplateGrid from "./components/TemplateGrid";
import WeekCalendar from "./components/WeekCalendar";
import DEFAULT_CONSTRAINTS_CONFIG from "./config/constraintsConfig";
import { SUPPORTED_LANGUAGES, translate } from "./i18n/messages";
import {
  buildWeekFromToday,
  cloneShifts,
  findNextAvailableShift,
  getDayShifts,
  makeEmployee,
  normalizeShiftConstraints,
  PREFERENCE_KEYS,
  validateShiftSet,
} from "./utils/schedule";
import {
  buildInitialEmployees,
  cleanErrorText,
  hydratePersistedState,
} from "./utils/persistedWorkspace";
import { buildSolvePayload, makeShiftKey } from "./utils/solverPayload";

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

function normalizeThemeMode(value) {
  return value === "light" ? "light" : "dark";
}

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.some((item) => item.code === value) ? value : "en";
}

export default function App() {
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [employees, setEmployees] = useState(() => buildInitialEmployees());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [defaultErrors, setDefaultErrors] = useState({});
  const [overrideErrors, setOverrideErrors] = useState({});
  const [shiftClipboard, setShiftClipboard] = useState(null);
  const [isEmployeePanelOpen, setIsEmployeePanelOpen] = useState(false);
  const [isTemplatePopupOpen, setIsTemplatePopupOpen] = useState(false);
  const [isConstraintsPopupOpen, setIsConstraintsPopupOpen] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveResult, setSolveResult] = useState(null);
  const [lastSolvePayload, setLastSolvePayload] = useState(null);
  const [solveError, setSolveError] = useState("");
  const [constraintsConfig, setConstraintsConfig] = useState(DEFAULT_CONSTRAINTS_CONFIG);
  const [isStateHydrating, setIsStateHydrating] = useState(true);
  const [persistMessage, setPersistMessage] = useState("Loading saved workspace...");
  const [persistError, setPersistError] = useState("");
  const [themeMode, setThemeMode] = useState("dark");
  const [language, setLanguage] = useState("en");

  const t = useCallback(
    (key, variables = {}, fallback = "") => translate(language, key, variables, fallback),
    [language]
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: themeMode,
          primary: {
            main: themeMode === "dark" ? "#5CC8FF" : "#0D47A1",
          },
          secondary: {
            main: themeMode === "dark" ? "#80CBC4" : "#00695C",
          },
          background: {
            default: themeMode === "dark" ? "#0F1726" : "#EEF2F8",
            paper: themeMode === "dark" ? "#182132" : "#FFFFFF",
          },
        },
        shape: {
          borderRadius: 12,
        },
        typography: {
          fontFamily: '"IBM Plex Sans", "Segoe UI", "Roboto", sans-serif',
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
              },
            },
          },
          MuiButton: {
            defaultProps: {
              size: "small",
            },
          },
        },
      }),
    [themeMode]
  );

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
  const hasFeasibleSolve = Boolean(solveResult && solveResult.status !== "infeasible");
  const persistedStatePayload = useMemo(
    () => ({
      version: 2,
      employees,
      selectedEmployeeId: selectedEmployeeId || employees[0]?.id || null,
      constraintsConfig,
      shiftClipboard,
      uiPreferences: {
        themeMode,
        language,
      },
    }),
    [employees, selectedEmployeeId, constraintsConfig, shiftClipboard, themeMode, language]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedState() {
      try {
        const payload = await fetchScheduleState();
        if (cancelled) return;
        const restored = hydratePersistedState(payload?.state);
        if (payload?.exists && restored) {
          setEmployees(restored.employees);
          setSelectedEmployeeId(restored.selectedEmployeeId);
          setConstraintsConfig(restored.constraintsConfig);
          setShiftClipboard(restored.shiftClipboard);
          setThemeMode(normalizeThemeMode(restored.uiPreferences?.themeMode));
          setLanguage(normalizeLanguage(restored.uiPreferences?.language));
          setPersistMessage(
            payload?.updated_at
              ? `Loaded saved workspace (${new Date(payload.updated_at).toLocaleString()})`
              : "Loaded saved workspace."
          );
        } else {
          setPersistMessage("No saved workspace yet. Changes will be auto-saved.");
        }
        setPersistError("");
      } catch (err) {
        if (cancelled) return;
        setPersistError(cleanErrorText(err));
        setPersistMessage("Workspace persistence unavailable.");
      } finally {
        if (!cancelled) setIsStateHydrating(false);
      }
    }

    loadPersistedState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isStateHydrating) return;

    const controller = new AbortController();
    const saveDelay = setTimeout(async () => {
      try {
        // Motivatie:
        // Salvam debounced intreg workspace-ul, nu pe campuri separate.
        // Asa evitam "partial writes" in timpul editarii rapide si
        // mentinem o singura versiune consistenta a starii din UI.
        const payload = await saveScheduleState(persistedStatePayload, controller.signal);
        if (controller.signal.aborted) return;
        const savedAt = payload?.updated_at
          ? new Date(payload.updated_at).toLocaleTimeString()
          : "just now";
        setPersistMessage(`Saved at ${savedAt}`);
        setPersistError("");
      } catch (err) {
        if (controller.signal.aborted) return;
        setPersistError(cleanErrorText(err));
      }
    }, 500);

    return () => {
      clearTimeout(saveDelay);
      controller.abort();
    };
  }, [isStateHydrating, persistedStatePayload]);

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
    setLastSolvePayload(null);
  }, [employees, selectedEmployeeId, constraintsConfig]);

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
        t("week.defaultAddError", { day: day.label }, `No room left to create another default shift for ${day.label}.`)
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
      setErrorKey(
        setOverrideErrors,
        day.iso,
        t("week.overrideAddError", { day: day.label }, `No room left to create another shift for ${day.label}.`)
      );
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

  async function onSolveClick() {
    const payload = buildSolvePayload({
      selectedEmployee,
      week,
      employees,
      constraintsConfig,
    });
    if (!payload) {
      console.warn("No selected employee. Cannot build solve payload.");
      return;
    }

    console.log("Solve payload:");
    console.log(JSON.stringify(payload, null, 2));
    setIsSolving(true);
    setSolveError("");
    setSolveResult(null);
    setLastSolvePayload(payload);
    try {
      const result = await solveSchedule(payload);
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

  const persistenceLine = isStateHydrating
    ? t("app.persistence.loading", {}, "Workspace persistence: loading...")
    : persistError
      ? t("app.persistence.error", { error: persistError }, `Workspace persistence error: ${persistError}`)
      : t("app.persistence.status", { message: persistMessage }, `Workspace persistence: ${persistMessage}`);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh" }}>
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            backdropFilter: "blur(8px)",
            backgroundColor: (muiTheme) =>
              muiTheme.palette.mode === "dark"
                ? "rgba(15, 23, 38, 0.82)"
                : "rgba(238, 242, 248, 0.84)",
          }}
        >
          <Toolbar
            sx={{
              alignItems: "flex-start",
              gap: 2,
              flexWrap: "wrap",
              py: 1.5,
            }}
          >
            <Box sx={{ flex: "1 1 380px", minWidth: 260 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
                CreaTura
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(
                  "app.subtitle",
                  {},
                  "Employee scheduling workspace for shifts, assignments, and preferences."
                )}
              </Typography>
              <Typography
                variant="caption"
                color={persistError ? "error.main" : "text.secondary"}
                sx={{ display: "block", mt: 0.75 }}
              >
                {persistenceLine}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Chip
                label={`${t("header.language", {}, "Language")}: ${language.toUpperCase()}`}
                size="small"
                variant="outlined"
              />
              <ToggleButtonGroup
                size="small"
                exclusive
                value={language}
                onChange={(_, next) => {
                  if (!next) return;
                  setLanguage(next);
                }}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <ToggleButton key={lang.code} value={lang.code}>
                    {lang.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Tooltip
                title={
                  themeMode === "dark"
                    ? t("header.themeDark", {}, "Dark")
                    : t("header.themeLight", {}, "Light")
                }
              >
                <IconButton
                  color="primary"
                  onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                >
                  {themeMode === "dark" ? <DarkModeRoundedIcon /> : <LightModeRoundedIcon />}
                </IconButton>
              </Tooltip>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              sx={{ width: "100%", justifyContent: "flex-end", flexWrap: "wrap" }}
            >
              <Button
                variant="contained"
                startIcon={<AutoFixHighOutlinedIcon />}
                onClick={onSolveClick}
                disabled={!selectedEmployee || isSolving}
              >
                {isSolving ? t("app.solving", {}, "Solving...") : t("app.solve", {}, "Solve")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<PeopleAltOutlinedIcon />}
                onClick={() => setIsEmployeePanelOpen(true)}
              >
                {t("app.employees", {}, "Employees")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ViewWeekOutlinedIcon />}
                onClick={() => setIsTemplatePopupOpen(true)}
                disabled={!selectedEmployee}
              >
                {t("app.defaultTemplate", {}, "Default Template")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<SettingsSuggestOutlinedIcon />}
                onClick={() => setIsConstraintsPopupOpen(true)}
              >
                {t("app.constraintsConfig", {}, "Constraints Configure")}
              </Button>
            </Stack>
          </Toolbar>
        </AppBar>

        <Container maxWidth={false} sx={{ px: { xs: 1.2, md: 2.2 }, py: 2.2 }}>
          <Stack spacing={1.5}>
            {solveError ? <Alert severity="error">{solveError}</Alert> : null}

            {!selectedEmployee ? (
              <Alert severity="info">
                <Typography variant="subtitle2">
                  {t("app.noEmployeeTitle", {}, "No employee selected")}
                </Typography>
                <Typography variant="body2">
                  {t(
                    "app.noEmployeeHint",
                    {},
                    "Open Employees from the top toolbar and select one."
                  )}
                </Typography>
              </Alert>
            ) : (
              <WeekCalendar
                t={t}
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
            )}

            {solveResult ? <SolveDiagnostics t={t} solveResult={solveResult} /> : null}
            {hasFeasibleSolve ? (
              <SolveStats
                t={t}
                solveResult={solveResult}
                employees={employees}
                solvePayload={lastSolvePayload}
              />
            ) : null}
          </Stack>
        </Container>

        <Drawer
          anchor="left"
          open={isEmployeePanelOpen}
          onClose={() => setIsEmployeePanelOpen(false)}
          PaperProps={{
            sx: {
              width: { xs: "100%", sm: 420 },
              p: 2,
            },
          }}
        >
          <Stack spacing={1.5} sx={{ height: "100%" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">
                {t("app.employeeDialogTitle", {}, "Employees")}
              </Typography>
              <Button size="small" onClick={() => setIsEmployeePanelOpen(false)}>
                {t("common.close", {}, "Close")}
              </Button>
            </Stack>
            <Divider />
            <EmployeeSidebar
              t={t}
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
          </Stack>
        </Drawer>

        <Dialog
          open={isTemplatePopupOpen && selectedEmployee !== null}
          onClose={() => setIsTemplatePopupOpen(false)}
          maxWidth="xl"
          fullWidth
        >
          <DialogTitle>{t("app.templateDialogTitle", {}, "Default Template (Mon-Sun)")}</DialogTitle>
          <DialogContent dividers sx={{ overflowX: "hidden", px: { xs: 1, sm: 2 } }}>
            {selectedEmployee ? (
              <TemplateGrid
                t={t}
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
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={isConstraintsPopupOpen}
          onClose={() => setIsConstraintsPopupOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            {t("app.constraintsDialogTitle", {}, "Constraints Configure")}
          </DialogTitle>
          <DialogContent dividers>
            <ConstraintsConfig t={t} config={constraintsConfig} onChange={setConstraintsConfig} />
          </DialogContent>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
