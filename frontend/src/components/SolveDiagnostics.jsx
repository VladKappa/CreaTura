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
  if (item.constraint_type === "min_rest_10h_after_shift") {
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

export default function SolveDiagnostics({ solveResult }) {
  if (!solveResult) return null;

  const breakdown = solveResult.objective_breakdown || {};
  const unsatisfied = solveResult.unsatisfied_soft_constraints || [];
  const reward = Number(breakdown.reward_points || 0);
  const penalty = Number(breakdown.penalty_points || 0);
  const total = Number(solveResult.objective || 0);

  return (
    <section className="panel solve-diagnostics">
      <h3>Solve Diagnostics</h3>
      <div className="solve-diag-summary">
        <span>Total objective: {total}</span>
        <span>Rewards: +{reward}</span>
        <span>Penalties: {penalty}</span>
        <span>Unsatisfied soft constraints: {unsatisfied.length}</span>
      </div>
      {solveResult.applied_defaults?.length ? (
        <p className="subtle">Default rules: {solveResult.applied_defaults.join(", ")}</p>
      ) : null}
      {solveResult.enabled_feature_toggles?.length ? (
        <p className="subtle">
          Enabled feature toggles: {solveResult.enabled_feature_toggles.join(", ")}
        </p>
      ) : null}
      {solveResult.warnings?.length ? (
        <div className="solve-diag-warnings">
          {solveResult.warnings.map((warning, idx) => (
            <p key={`${warning}-${idx}`} className="error-text">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {unsatisfied.length === 0 ? (
        <p className="subtle">No soft constraints were violated or left unmet.</p>
      ) : (
        <details className="solve-diag-details" open>
          <summary>Why objective is not higher</summary>
          <ul className="solve-diag-list">
            {unsatisfied.map((item, index) => (
              <li key={`${item.constraint_type}-${item.employee_id}-${index}`}>
                {describeUnsatisfied(item)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
