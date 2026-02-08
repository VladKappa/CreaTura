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

function describeUnsatisfied(item) {
  const employee = item.employee_name || item.employee_id || "Unknown employee";
  if (item.constraint_type === "prefer_assignment") {
    return `${employee}: preferred assignment not met for ${formatShift(item.shift)} (+${item.weight} available).`;
  }
  if (item.constraint_type === "avoid_assignment") {
    return `${employee}: avoid assignment was violated on ${formatShift(item.shift)} (-${item.weight}).`;
  }
  if (item.constraint_type === "min_rest_after_shift") {
    return `${employee}: rest gap ${formatHours(item.rest_minutes)}h after ${formatShift(
      item.left_shift
    )} before ${formatShift(item.right_shift)} (required ${formatHours(
      item.required_rest_minutes
    )}h, -${item.weight}).`;
  }
  if (item.constraint_type === "balance_worked_hours") {
    const avgShiftHours = Number(item.average_shift_duration_minutes || 0) / 60;
    return `Workload imbalance: min ${item.min_employee_hours ?? 0}h vs max ${
      item.max_employee_hours ?? 0
    }h (span ${item.hours_span ?? 0}h, allowed ${item.allowed_span_hours ?? 0}h = ${
      Number(item.span_multiplier || 0).toFixed(1)
    }x avg shift ${avgShiftHours.toFixed(1)}h, excess ${item.excess_hours ?? 0}h, weight ${
      item.weight
    }).`;
  }
  return `${employee}: ${item.constraint_type} (${item.status}).`;
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
              {solveResult.reason ||
                t(
                  "solve.infeasibleReason",
                  {},
                  "Current hard constraints and required shift coverage cannot be satisfied together."
                )}
            </Typography>
          </Alert>

          {solveResult.infeasibility_reasons?.length ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t("solve.likelyCauses", {}, "Likely infeasibility causes")}
              </Typography>
              <List dense sx={{ p: 0 }}>
                {solveResult.infeasibility_reasons.map((reason, index) => (
                  <ListItem key={`${reason}-${index}`} sx={{ py: 0.2 }}>
                    <ListItemText
                      primaryTypographyProps={{ variant: "body2" }}
                      primary={reason}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : null}

          {solveResult.applied_defaults?.length ? (
            <Typography variant="body2" color="text.secondary">
              {t(
                "solve.defaultRules",
                { rules: solveResult.applied_defaults.join(", ") },
                `Default rules: ${solveResult.applied_defaults.join(", ")}`
              )}
            </Typography>
          ) : null}
          {solveResult.enabled_feature_toggles?.length ? (
            <Typography variant="body2" color="text.secondary">
              {t(
                "solve.toggles",
                { toggles: solveResult.enabled_feature_toggles.join(", ") },
                `Enabled feature toggles: ${solveResult.enabled_feature_toggles.join(", ")}`
              )}
            </Typography>
          ) : null}
          {solveResult.warnings?.length ? (
            <Stack spacing={0.8}>
              {solveResult.warnings.map((warning, idx) => (
                <Alert key={`${warning}-${idx}`} severity="warning" sx={{ py: 0 }}>
                  {warning}
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

        {solveResult.applied_defaults?.length ? (
          <Typography variant="body2" color="text.secondary">
            {t(
              "solve.defaultRules",
              { rules: solveResult.applied_defaults.join(", ") },
              `Default rules: ${solveResult.applied_defaults.join(", ")}`
            )}
          </Typography>
        ) : null}
        {solveResult.enabled_feature_toggles?.length ? (
          <Typography variant="body2" color="text.secondary">
            {t(
              "solve.toggles",
              { toggles: solveResult.enabled_feature_toggles.join(", ") },
              `Enabled feature toggles: ${solveResult.enabled_feature_toggles.join(", ")}`
            )}
          </Typography>
        ) : null}
        {solveResult.warnings?.length ? (
          <Stack spacing={0.8}>
            {solveResult.warnings.map((warning, idx) => (
              <Alert key={`${warning}-${idx}`} severity="warning" sx={{ py: 0 }}>
                {warning}
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
                    primary={describeUnsatisfied(item)}
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
