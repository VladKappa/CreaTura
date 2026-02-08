const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function readErrorBody(resp) {
  const text = await resp.text();
  return text || "Unknown backend error";
}

export async function fetchScheduleState() {
  const resp = await fetch(`${API_URL}/state/schedule`);
  if (!resp.ok) {
    const detail = await readErrorBody(resp);
    throw new Error(`Load failed (${resp.status}): ${detail}`);
  }
  return resp.json();
}

export async function saveScheduleState(payload, signal) {
  const resp = await fetch(`${API_URL}/state/schedule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const detail = await readErrorBody(resp);
    throw new Error(`Save failed (${resp.status}): ${detail}`);
  }
  return resp.json();
}

export async function solveSchedule(payload, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.requestId) {
    headers["X-Request-Id"] = String(options.requestId);
  }
  const resp = await fetch(`${API_URL}/solve/schedule`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const detail = await readErrorBody(resp);
    throw new Error(`Solve failed (${resp.status}): ${detail}`);
  }
  return resp.json();
}
