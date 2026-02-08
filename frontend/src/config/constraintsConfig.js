const DEFAULT_CONSTRAINTS_CONFIG = {
  maxWorktimeInRowEnabled: true,
  maxWorktimeInRowHours: 8,
  restGapHardEnabled: true,
  restGapHardHours: 10,
  restGapSoftEnabled: true,
  restGapSoftHours: 10,
  restGapSoftWeight: 5,
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

export function normalizeConstraintsConfig(rawConfig) {
  const raw = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  return {
    maxWorktimeInRowEnabled:
      raw.maxWorktimeInRowEnabled === undefined
        ? DEFAULT_CONSTRAINTS_CONFIG.maxWorktimeInRowEnabled
        : Boolean(raw.maxWorktimeInRowEnabled),
    maxWorktimeInRowHours: Math.round(
      clamp(raw.maxWorktimeInRowHours, 1, 24, DEFAULT_CONSTRAINTS_CONFIG.maxWorktimeInRowHours)
    ),
    restGapHardEnabled:
      raw.restGapHardEnabled === undefined
        ? DEFAULT_CONSTRAINTS_CONFIG.restGapHardEnabled
        : Boolean(raw.restGapHardEnabled),
    restGapHardHours: Math.round(
      clamp(raw.restGapHardHours, 1, 24, DEFAULT_CONSTRAINTS_CONFIG.restGapHardHours)
    ),
    restGapSoftEnabled:
      raw.restGapSoftEnabled === undefined
        ? DEFAULT_CONSTRAINTS_CONFIG.restGapSoftEnabled
        : Boolean(raw.restGapSoftEnabled),
    restGapSoftHours: Math.round(
      clamp(raw.restGapSoftHours, 1, 24, DEFAULT_CONSTRAINTS_CONFIG.restGapSoftHours)
    ),
    restGapSoftWeight: Math.round(
      clamp(raw.restGapSoftWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.restGapSoftWeight)
    ),
    preferredWeight: Math.round(
      clamp(raw.preferredWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.preferredWeight)
    ),
    unpreferredWeight: Math.round(
      clamp(raw.unpreferredWeight, 1, 100, DEFAULT_CONSTRAINTS_CONFIG.unpreferredWeight)
    ),
    balanceWorkedHoursEnabled:
      raw.balanceWorkedHoursEnabled === undefined
        ? DEFAULT_CONSTRAINTS_CONFIG.balanceWorkedHoursEnabled
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
