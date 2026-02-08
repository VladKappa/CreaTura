import { Box, Paper, Stack, Switch, TextField, Typography } from "@mui/material";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ConfigSection({ title, description, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.2}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

function EnabledSwitch({ checked, onChange, label }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}

export default function ConstraintsConfig({ t, config, onChange }) {
  function setConfig(key, value) {
    onChange((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Stack spacing={1.2}>
      <Typography variant="body2" color="text.secondary">
        {t(
          "constraints.description",
          {},
          "Configure solver feature toggles and preference weights used when building solve requests."
        )}
      </Typography>

      <ConfigSection
        title={t("constraints.maxWorktimeTitle", {}, "Max Worktime In A Row")}
        description={t(
          "constraints.maxWorktimeDesc",
          {},
          "Hard rule. Limits continuous back-to-back assignment time for each employee."
        )}
      >
        <EnabledSwitch
          checked={config.maxWorktimeInRowEnabled}
          onChange={(value) => setConfig("maxWorktimeInRowEnabled", value)}
          label={t("common.enabled", {}, "Enabled")}
        />
        <TextField
          type="number"
          label={t("constraints.maxWorktimeInput", {}, "Maximum continuous work (hours)")}
          inputProps={{ min: 1, max: 24, step: 1 }}
          disabled={!config.maxWorktimeInRowEnabled}
          value={config.maxWorktimeInRowHours}
          size="small"
          onChange={(e) =>
            setConfig(
              "maxWorktimeInRowHours",
              Math.round(Math.max(1, Math.min(24, toNumber(e.target.value, 8))))
            )
          }
        />
      </ConfigSection>

      <ConfigSection
        title={t(
          "constraints.restGapHardTitle",
          {},
          "Minimum Rest Gap After Configured Max Worktime In A Row (Hard)"
        )}
        description={t(
          "constraints.restGapHardDesc",
          {},
          "Hard rule. Enforces minimum rest after reaching the max-worktime-in-a-row chain."
        )}
      >
        <EnabledSwitch
          checked={config.restGapHardEnabled}
          onChange={(value) => setConfig("restGapHardEnabled", value)}
          label={t("common.enabled", {}, "Enabled")}
        />
        <TextField
          type="number"
          label={t("constraints.restGapHardHours", {}, "Minimum hard rest (hours)")}
          inputProps={{ min: 1, max: 24, step: 1 }}
          disabled={!config.restGapHardEnabled}
          value={config.restGapHardHours}
          size="small"
          onChange={(e) =>
            setConfig(
              "restGapHardHours",
              Math.round(Math.max(1, Math.min(24, toNumber(e.target.value, 10))))
            )
          }
        />
      </ConfigSection>

      <ConfigSection
        title={t(
          "constraints.restGapSoftTitle",
          {},
          "Minimum Rest Gap After Configured Max Worktime In A Row (Soft)"
        )}
        description={t(
          "constraints.restGapSoftDesc",
          {},
          "Soft rule. Penalizes assignments where rest after a shift chain is below the configured hours."
        )}
      >
        <EnabledSwitch
          checked={config.restGapSoftEnabled}
          onChange={(value) => setConfig("restGapSoftEnabled", value)}
          label={t("common.enabled", {}, "Enabled")}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            gap: 1,
          }}
        >
          <TextField
            type="number"
            label={t("constraints.restGapSoftHours", {}, "Minimum preferred rest (hours)")}
            inputProps={{ min: 1, max: 24, step: 1 }}
            disabled={!config.restGapSoftEnabled}
            value={config.restGapSoftHours}
            size="small"
            onChange={(e) =>
              setConfig(
                "restGapSoftHours",
                Math.round(Math.max(1, Math.min(24, toNumber(e.target.value, 10))))
              )
            }
          />
          <TextField
            type="number"
            label={t("constraints.restGapSoftWeight", {}, "Penalty weight")}
            inputProps={{ min: 1, max: 100, step: 1 }}
            disabled={!config.restGapSoftEnabled}
            value={config.restGapSoftWeight}
            size="small"
            onChange={(e) =>
              setConfig(
                "restGapSoftWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 5))))
              )
            }
          />
        </Box>
      </ConfigSection>

      <ConfigSection
        title={t("constraints.balanceTitle", {}, "Balance Worked Hours")}
        description={t(
          "constraints.balanceDesc",
          {},
          "Soft rule. Penalizes imbalance above allowed span derived from avg shift duration."
        )}
      >
        <EnabledSwitch
          checked={config.balanceWorkedHoursEnabled}
          onChange={(value) => setConfig("balanceWorkedHoursEnabled", value)}
          label={t("common.enabled", {}, "Enabled")}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            gap: 1,
          }}
        >
          <TextField
            type="number"
            label={t("constraints.balanceWeight", {}, "Penalty weight")}
            inputProps={{ min: 1, max: 100, step: 1 }}
            disabled={!config.balanceWorkedHoursEnabled}
            value={config.balanceWorkedHoursWeight}
            size="small"
            onChange={(e) =>
              setConfig(
                "balanceWorkedHoursWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 2))))
              )
            }
          />
          <TextField
            type="number"
            label={t("constraints.balanceMultiplier", {}, "Allowed span multiplier")}
            inputProps={{ min: 0.1, max: 10, step: 0.1 }}
            disabled={!config.balanceWorkedHoursEnabled}
            value={config.balanceWorkedHoursMaxSpanMultiplier}
            size="small"
            onChange={(e) =>
              setConfig(
                "balanceWorkedHoursMaxSpanMultiplier",
                Math.max(0.1, Math.min(10, toNumber(e.target.value, 1.5)))
              )
            }
          />
        </Box>
      </ConfigSection>

      <ConfigSection
        title={t("constraints.prefTitle", {}, "Preference Mapping Weights")}
        description={t(
          "constraints.prefDesc",
          {},
          "Weights for preferences assigned in Shift Inspector and sent as soft constraints."
        )}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            gap: 1,
          }}
        >
          <TextField
            type="number"
            label={t("constraints.prefPreferred", {}, "Preferred weight")}
            inputProps={{ min: 1, max: 100, step: 1 }}
            value={config.preferredWeight}
            size="small"
            onChange={(e) =>
              setConfig(
                "preferredWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 3))))
              )
            }
          />
          <TextField
            type="number"
            label={t("constraints.prefUnpreferred", {}, "Unpreferred weight")}
            inputProps={{ min: 1, max: 100, step: 1 }}
            value={config.unpreferredWeight}
            size="small"
            onChange={(e) =>
              setConfig(
                "unpreferredWeight",
                Math.round(Math.max(1, Math.min(100, toNumber(e.target.value, 4))))
              )
            }
          />
        </Box>
      </ConfigSection>
    </Stack>
  );
}
