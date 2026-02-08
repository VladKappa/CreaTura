import {
  Alert,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

function formatShift(shift) {
  if (!shift) return "Unknown shift";
  return `${shift.day} ${shift.date} ${shift.type} (${shift.start}-${shift.end})`;
}

function formatHours(minutes) {
  return (Number(minutes || 0) / 60).toFixed(1);
}

function describeUnsatisfied(t, item) {
  const employee = item.employee_name || item.employee_id || "Unknown employee";
  if (item.constraint_type === "prefer_assignment") {
    return t(
      "solve.unsat.preferAssignment",
      { employee, shift: formatShift(item.shift), weight: item.weight },
      `${employee}: preferred assignment not met for ${formatShift(item.shift)} (+${item.weight} available).`
    );
  }
  if (item.constraint_type === "avoid_assignment") {
    return t(
      "solve.unsat.avoidAssignment",
      { employee, shift: formatShift(item.shift), weight: item.weight },
      `${employee}: avoid assignment was violated on ${formatShift(item.shift)} (-${item.weight}).`
    );
  }
  if (item.constraint_type === "min_rest_after_shift") {
    return t(
      "solve.unsat.minRestAfterShift",
      {
        employee,
        restHours: formatHours(item.rest_minutes),
        leftShift: formatShift(item.left_shift),
        rightShift: formatShift(item.right_shift),
        requiredHours: formatHours(item.required_rest_minutes),
        weight: item.weight,
      },
      `${employee}: rest gap ${formatHours(item.rest_minutes)}h after ${formatShift(
        item.left_shift
      )} before ${formatShift(item.right_shift)} (required ${formatHours(
        item.required_rest_minutes
      )}h, -${item.weight}).`
    );
  }
  if (item.constraint_type === "balance_worked_hours") {
    const avgShiftHours = Number(item.average_shift_duration_minutes || 0) / 60;
    return t(
      "solve.unsat.balanceWorkedHours",
      {
        minHours: item.min_employee_hours ?? 0,
        maxHours: item.max_employee_hours ?? 0,
        spanHours: item.hours_span ?? 0,
        allowedHours: item.allowed_span_hours ?? 0,
        multiplier: Number(item.span_multiplier || 0).toFixed(1),
        avgShiftHours: avgShiftHours.toFixed(1),
        excessHours: item.excess_hours ?? 0,
        weight: item.weight,
      },
      `Workload imbalance: min ${item.min_employee_hours ?? 0}h vs max ${
        item.max_employee_hours ?? 0
      }h (span ${item.hours_span ?? 0}h, allowed ${item.allowed_span_hours ?? 0}h = ${
        Number(item.span_multiplier || 0).toFixed(1)
      }x avg shift ${avgShiftHours.toFixed(1)}h, excess ${item.excess_hours ?? 0}h, weight ${
        item.weight
      }).`
    );
  }
  return t(
    "solve.unsat.generic",
    { employee, type: item.constraint_type, status: item.status },
    `${employee}: ${item.constraint_type} (${item.status}).`
  );
}

function getToggleLabel(t, toggleKey) {
  return t(`solve.toggle.${toggleKey}`, {}, toggleKey);
}

function describeWarning(t, warning) {
  if (!warning) return "";
  if (typeof warning === "string") return warning;
  if (typeof warning !== "object") return String(warning);

  const code = warning.code || "unknown";
  if (code === "no_matching_shift_for_hard_constraint") {
    return t(
      "solve.warning.noMatchingHard",
      {
        type: warning.constraint_type || "unknown",
        employeeId: warning.employee_id || "unknown",
      },
      `No shifts matched hard constraint (${warning.constraint_type || "unknown"}) for employee_id '${
        warning.employee_id || "unknown"
      }'.`
    );
  }
  if (code === "no_matching_shift_for_soft_constraint") {
    return t(
      "solve.warning.noMatchingSoft",
      {
        type: warning.constraint_type || "unknown",
        employeeId: warning.employee_id || "unknown",
      },
      `No shifts matched soft constraint (${warning.constraint_type || "unknown"}) for employee_id '${
        warning.employee_id || "unknown"
      }'.`
    );
  }
  return t("solve.warning.unknown", { code }, `Solver warning: ${code}`);
}

function describeInfeasibilityReason(t, reason) {
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  if (typeof reason !== "object") return String(reason);

  const code = reason.code || "unknown";
  const fallback = reason.message || `Infeasibility reason: ${code}`;
  if (code === "hard_conflict_required_and_forbidden") {
    return t(
      "solve.infeasibility.hardConflictRequiredAndForbidden",
      {
        shift: formatShift(reason.shift),
        employeeNames: reason.employee_names || "",
      },
      fallback
    );
  }
  if (code === "hard_required_exceeds_shift_coverage") {
    return t(
      "solve.infeasibility.hardRequiredExceedsCoverage",
      {
        shift: formatShift(reason.shift),
        hardRequiredCount: reason.hard_required_count ?? 0,
        requiredCoverage: reason.required_coverage ?? 0,
      },
      fallback
    );
  }
  if (code === "coverage_exceeds_available_after_forbids") {
    return t(
      "solve.infeasibility.coverageExceedsAvailableAfterForbids",
      {
        shift: formatShift(reason.shift),
        requiredCoverage: reason.required_coverage ?? 0,
        availableEmployees: reason.available_employees ?? 0,
      },
      fallback
    );
  }
  if (code === "max_worktime_window_capacity_conflict") {
    return t(
      "solve.infeasibility.maxWorktimeWindowCapacityConflict",
      {
        windowPreview: reason.window_preview || "",
        requiredAssignments: reason.required_assignments ?? 0,
        allowedAssignments: reason.allowed_assignments ?? 0,
      },
      fallback
    );
  }
  if (code === "max_worktime_window_employee_overrequired") {
    return t(
      "solve.infeasibility.maxWorktimeWindowEmployeeOverrequired",
      {
        employeeName: reason.employee_name || reason.employee_id || "",
        hardRequiredCount: reason.hard_required_count ?? 0,
        allowedAssignments: reason.allowed_assignments ?? 0,
        windowPreview: reason.window_preview || "",
      },
      fallback
    );
  }
  if (code === "hard_min_rest_conflict_on_required_chain") {
    return t(
      "solve.infeasibility.hardMinRestConflictOnRequiredChain",
      {
        employeeName: reason.employee_name || reason.employee_id || "",
        leftShift: formatShift(reason.left_shift),
        rightShift: formatShift(reason.right_shift),
        restHours: reason.rest_hours ?? 0,
        minRestHours: reason.min_rest_hours ?? 0,
      },
      fallback
    );
  }
  if (code === "infeasibility_quick_analysis_inconclusive") {
    return t("solve.infeasibility.quickAnalysisInconclusive", {}, fallback);
  }
  return t("solve.infeasibility.unknown", { code }, fallback);
}

export default function SolveDiagnostics({ t, solveResult }) {
  if (!solveResult) return null;

  const isInfeasible = solveResult.status === "infeasible";
  const breakdown = solveResult.objective_breakdown || {};
  const unsatisfied = solveResult.unsatisfied_soft_constraints || [];
  const reward = Number(breakdown.reward_points || 0);
  const penalty = Number(breakdown.penalty_points || 0);
  const total =
    typeof solveResult.objective === "number" && Number.isFinite(solveResult.objective)
      ? solveResult.objective
      : null;

  const toggleLabels = (solveResult.enabled_feature_toggles || []).map((toggle) =>
    getToggleLabel(t, toggle)
  );
  const reasonText =
    solveResult.reason_code && typeof solveResult.reason_code === "string"
      ? t(`solve.reason.${solveResult.reason_code}`, {}, solveResult.reason || "")
      : solveResult.reason ||
        t(
          "solve.infeasibleReason",
          {},
          "Current hard constraints and required shift coverage cannot be satisfied together."
        );

  if (isInfeasible) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1.2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("solve.diagnosticsTitle", {}, "Solve Diagnostics")}
          </Typography>
          <Alert severity="error">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t("solve.infeasibleTitle", {}, "No feasible schedule found")}
            </Typography>
            <Typography variant="body2">
              {reasonText}
            </Typography>
          </Alert>

          {solveResult.infeasibility_reasons?.length ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t("solve.likelyCauses", {}, "Likely infeasibility causes")}
              </Typography>
              <List dense sx={{ p: 0 }}>
                {solveResult.infeasibility_reasons.map((reason, index) => (
                  <ListItem
                    key={`${
                      typeof reason === "string"
                        ? reason
                        : `${reason?.code || "reason"}-${reason?.message || index}`
                    }-${index}`}
                    sx={{ py: 0.2 }}
                  >
                    <ListItemText
                      primaryTypographyProps={{ variant: "body2" }}
                      primary={describeInfeasibilityReason(t, reason)}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : null}

          {toggleLabels.length ? (
            <Typography variant="body2" color="text.secondary">
              {t(
                "solve.toggles",
                { toggles: toggleLabels.join(", ") },
                `Enabled feature toggles: ${toggleLabels.join(", ")}`
              )}
            </Typography>
          ) : null}
          {solveResult.warnings?.length ? (
            <Stack spacing={0.8}>
              {solveResult.warnings.map((warning, idx) => (
                <Alert
                  key={`${typeof warning === "string" ? warning : warning?.code || "warning"}-${idx}`}
                  severity="warning"
                  sx={{ py: 0 }}
                >
                  {describeWarning(t, warning)}
                </Alert>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t("solve.noWarnings", {}, "No additional solver warnings were returned.")}
            </Typography>
          )}

          <List dense sx={{ p: 0 }}>
            <ListItem sx={{ py: 0.2 }}>
              <ListItemText
                primaryTypographyProps={{ variant: "body2" }}
                primary={t(
                  "solve.action.relax",
                  {},
                  "Relax one or more hard constraints (Desired/Undesired assignments)."
                )}
              />
            </ListItem>
            <ListItem sx={{ py: 0.2 }}>
              <ListItemText
                primaryTypographyProps={{ variant: "body2" }}
                primary={t(
                  "solve.action.staff",
                  {},
                  "Increase available employees or reduce required coverage per shift."
                )}
              />
            </ListItem>
            <ListItem sx={{ py: 0.2 }}>
              <ListItemText
                primaryTypographyProps={{ variant: "body2" }}
                primary={t(
                  "solve.action.overrides",
                  {},
                  "Adjust custom day overrides if overnight/default rules create conflicts."
                )}
              />
            </ListItem>
          </List>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.2}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("solve.diagnosticsTitle", {}, "Solve Diagnostics")}
        </Typography>
        <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={t("solve.objectiveTotal", { value: total ?? "-" }, `Total objective: ${total ?? "-"}`)}
          />
          <Chip
            size="small"
            color="success"
            label={t("solve.rewards", { value: reward }, `Rewards: +${reward}`)}
          />
          <Chip
            size="small"
            color="warning"
            label={t("solve.penalties", { value: penalty }, `Penalties: ${penalty}`)}
          />
          <Chip
            size="small"
            color="default"
            label={t(
              "solve.unsatisfiedCount",
              { count: unsatisfied.length },
              `Unsatisfied soft constraints: ${unsatisfied.length}`
            )}
          />
        </Stack>

        {toggleLabels.length ? (
          <Typography variant="body2" color="text.secondary">
            {t(
              "solve.toggles",
              { toggles: toggleLabels.join(", ") },
              `Enabled feature toggles: ${toggleLabels.join(", ")}`
            )}
          </Typography>
        ) : null}
        {solveResult.warnings?.length ? (
          <Stack spacing={0.8}>
            {solveResult.warnings.map((warning, idx) => (
              <Alert
                key={`${typeof warning === "string" ? warning : warning?.code || "warning"}-${idx}`}
                severity="warning"
                sx={{ py: 0 }}
              >
                {describeWarning(t, warning)}
              </Alert>
            ))}
          </Stack>
        ) : null}
        {unsatisfied.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("solve.noUnsatisfied", {}, "No soft constraints were violated or left unmet.")}
          </Typography>
        ) : (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t("solve.whyNotHigher", {}, "Why objective is not higher")}
            </Typography>
            <List dense sx={{ p: 0 }}>
              {unsatisfied.map((item, index) => (
                <ListItem key={`${item.constraint_type}-${item.employee_id}-${index}`} sx={{ py: 0.2 }}>
                  <ListItemText
                    primaryTypographyProps={{ variant: "body2" }}
                    primary={describeUnsatisfied(t, item)}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
