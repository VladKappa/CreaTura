function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ConstraintsConfig({ config, onChange }) {
  function setConfig(key, value) {
    onChange((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="constraints-config">
      <p className="subtle">
        Configure default solver rules and preference weights used when building solve requests.
      </p>

      <div className="constraint-config-item">
        <div>
          <h4>Max Worktime In A Row</h4>
          <p className="subtle">
            Hard rule. Limits continuous back-to-back assignment time for each employee.
            Applies to shift chains (not a single shift): with 8h max, two 4h shifts in a row are
            allowed, two 8h shifts are not.
          </p>
        </div>
        <label className="checkbox dense">
          <input
            type="checkbox"
            checked={config.maxWorktimeInRowEnabled}
            onChange={(e) => setConfig("maxWorktimeInRowEnabled", e.target.checked)}
          />
          Enabled
        </label>
        <label>
          Maximum continuous work (hours)
          <input
            type="number"
            min="1"
            max="24"
            step="1"
            disabled={!config.maxWorktimeInRowEnabled}
            value={config.maxWorktimeInRowHours}
            onChange={(e) =>
              setConfig(
                "maxWorktimeInRowHours",
                Math.round(Math.max(1, Math.min(24, toNumber(e.target.value, 8))))
              )
            }
          />
        </label>
      </div>

      <div className="constraint-config-item">
        <div>
          <h4>Minimum Rest Gap After Configured Max Worktime In A Row</h4>
          <p className="subtle">
            Soft rule. Penalizes assignments where rest after a shift chain is below the configured
            hours once the max worktime-in-a-row chain is reached.
          </p>
        </div>
        <label className="checkbox dense">
          <input
            type="checkbox"
            checked={config.restGapEnabled}
            onChange={(e) => setConfig("restGapEnabled", e.target.checked)}
          />
          Enabled
        </label>
        <label>
          Minimum rest (hours)
          <input
            type="number"
            min="1"
            max="24"
            step="1"
            disabled={!config.restGapEnabled}
            value={config.restGapHours}
            onChange={(e) =>
              setConfig(
                "restGapHours",
                Math.round(Math.max(1, Math.min(24, toNumber(e.target.value, 10))))
              )
            }
          />
        </label>
        <label>
          Penalty weight
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            disabled={!config.restGapEnabled}
            value={config.restGapWeight}
            onChange={(e) =>
              setConfig(
                "restGapWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 5))))
              )
            }
          />
        </label>
      </div>

      <div className="constraint-config-item">
        <div>
          <h4>Balance Worked Hours</h4>
          <p className="subtle">
            Soft rule. Penalizes imbalance above allowed span derived from avg shift duration.
          </p>
        </div>
        <label className="checkbox dense">
          <input
            type="checkbox"
            checked={config.balanceWorkedHoursEnabled}
            onChange={(e) => setConfig("balanceWorkedHoursEnabled", e.target.checked)}
          />
          Enabled
        </label>
        <label>
          Penalty weight
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            disabled={!config.balanceWorkedHoursEnabled}
            value={config.balanceWorkedHoursWeight}
            onChange={(e) =>
              setConfig(
                "balanceWorkedHoursWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 2))))
              )
            }
          />
        </label>
        <label>
          Allowed span multiplier
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            disabled={!config.balanceWorkedHoursEnabled}
            value={config.balanceWorkedHoursMaxSpanMultiplier}
            onChange={(e) =>
              setConfig(
                "balanceWorkedHoursMaxSpanMultiplier",
                Math.max(0.1, Math.min(10, toNumber(e.target.value, 1.5)))
              )
            }
          />
        </label>
      </div>

      <div className="constraint-config-item">
        <div>
          <h4>Preference Mapping Weights</h4>
          <p className="subtle">
            Weights for preferences assigned in Shift Inspector and sent as soft constraints.
          </p>
        </div>
        <label>
          Preferred weight
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={config.preferredWeight}
            onChange={(e) =>
              setConfig(
                "preferredWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 3))))
              )
            }
          />
        </label>
        <label>
          Unpreferred weight
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={config.unpreferredWeight}
            onChange={(e) =>
              setConfig(
                "unpreferredWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 4))))
              )
            }
          />
        </label>
      </div>
    </section>
  );
}
