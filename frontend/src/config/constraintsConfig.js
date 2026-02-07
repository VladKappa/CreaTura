const DEFAULT_CONSTRAINTS_CONFIG = {
  maxWorktimeInRowEnabled: true,
  maxWorktimeInRowHours: 8,
  restGapEnabled: true,
  restGapHours: 10,
  restGapWeight: 5,
  preferredWeight: 3,
  unpreferredWeight: 4,
  balanceWorkedHoursEnabled: false,
  balanceWorkedHoursWeight: 2,
  balanceWorkedHoursMaxSpanMultiplier: 1.5,
};

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeConstraintsConfig(rawConfig, legacyBalanceWorkedHours = false) {
  const raw = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const legacyNoConsecutive = raw.noConsecutiveShiftsEnabled;
  return {
    maxWorktimeInRowEnabled:
      raw.maxWorktimeInRowEnabled === undefined
        ? legacyNoConsecutive === undefined
          ? DEFAULT_CONSTRAINTS_CONFIG.maxWorktimeInRowEnabled
          : Boolean(legacyNoConsecutive)
        : Boolean(raw.maxWorktimeInRowEnabled),
    maxWorktimeInRowHours: Math.round(
      clamp(raw.maxWorktimeInRowHours, 1, 24, DEFAULT_CONSTRAINTS_CONFIG.maxWorktimeInRowHours)
    ),
    restGapEnabled:
      raw.restGapEnabled === undefined ? DEFAULT_CONSTRAINTS_CONFIG.restGapEnabled : Boolean(raw.restGapEnabled),
    restGapHours: Math.round(
      clamp(raw.restGapHours, 1, 24, DEFAULT_CONSTRAINTS_CONFIG.restGapHours)
    ),
    restGapWeight: Math.round(
      clamp(raw.restGapWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.restGapWeight)
    ),
    preferredWeight: Math.round(
      clamp(raw.preferredWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.preferredWeight)
    ),
    unpreferredWeight: Math.round(
      clamp(raw.unpreferredWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.unpreferredWeight)
    ),
    balanceWorkedHoursEnabled:
      raw.balanceWorkedHoursEnabled === undefined
        ? Boolean(legacyBalanceWorkedHours)
        : Boolean(raw.balanceWorkedHoursEnabled),
    balanceWorkedHoursWeight: Math.round(
      clamp(raw.balanceWorkedHoursWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.balanceWorkedHoursWeight)
    ),
    balanceWorkedHoursMaxSpanMultiplier: clamp(
      raw.balanceWorkedHoursMaxSpanMultiplier,
      0.1,
      10,
      DEFAULT_CONSTRAINTS_CONFIG.balanceWorkedHoursMaxSpanMultiplier
    ),
  };
}

export default DEFAULT_CONSTRAINTS_CONFIG;
