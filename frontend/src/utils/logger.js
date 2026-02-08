const SERVICE_NAME = "frontend";

function nowEpochMicros() {
  if (
    typeof performance !== "undefined" &&
    Number.isFinite(performance.timeOrigin) &&
    typeof performance.now === "function"
  ) {
    return Math.round((performance.timeOrigin + performance.now()) * 1000);
  }
  return Date.now() * 1000;
}

function timestampUtcMicros() {
  const epochMicros = nowEpochMicros();
  const epochMillis = Math.floor(epochMicros / 1000);
  const microsWithinSecond = epochMicros % 1_000_000;
  const isoBase = new Date(epochMillis).toISOString().slice(0, 19);
  return `${isoBase}.${microsWithinSecond.toString().padStart(6, "0")}Z`;
}

function serializeValue(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function formatLogLine(level, event, fields = {}) {
  const parts = [
    timestampUtcMicros(),
    `service=${SERVICE_NAME}`,
    `level=${String(level || "").toUpperCase()}`,
    `event=${event}`,
  ];
  Object.entries(fields).forEach(([key, value]) => {
    parts.push(`${key}=${serializeValue(value)}`);
  });
  return parts.join(" | ");
}

export function logInfo(event, fields = {}) {
  console.info(formatLogLine("INFO", event, fields));
}

export function logWarn(event, fields = {}) {
  console.warn(formatLogLine("WARN", event, fields));
}

export function logError(event, fields = {}) {
  console.error(formatLogLine("ERROR", event, fields));
}
