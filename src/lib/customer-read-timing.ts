/** Opt-in numeric diagnostics. Never log URLs, IDs, payloads, errors or headers. */
const selections = new WeakMap<Promise<unknown>, { started: number; reported: boolean }>();
function enabled() {
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("customerReadTiming") === "1";
}
function report(value: Record<string, string | number | undefined>) {
  try { console.info("[customer-read-timing]", JSON.stringify(value)); } catch { /* Diagnostics must not affect reads. */ }
}
function handlerDuration(header: string | null | undefined) {
  const match = header?.match(/(?:^|,)\s*(?:total|summary);dur=(\d+(?:\.\d+)?)(?:\s*(?:,|$))/);
  const value = match ? Number(match[1]) : undefined;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** Read only known numeric durations, never log the raw response header. */
function proxyDurations(header: string | null | undefined): Record<string, number> {
  if (!header || header.length > 4096) return {};
  try {
    const value: unknown = JSON.parse(header);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, number> = {};
    for (const [source, target] of [
      ["total", "proxyMs"], ["proxy.authentication", "proxyAuthMs"],
      ["session.staffState", "proxyStaffStateMs"], ["proxy.retiredStore", "proxyRetiredStoreMs"],
    ]) {
      const duration = (value as Record<string, unknown>)[source];
      if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) result[target] = duration;
    }
    return result;
  } catch { return {}; }
}

export async function readTimedCustomerJson<T>(
  operation: "primary" | "summary", url: string, init: RequestInit, errorMessage: string,
): Promise<T> {
  const trace = enabled();
  const started = performance.now();
  let headersMs: number | undefined, bodyMs: number | undefined, handlerMs: number | undefined;
  let proxy: Record<string, number> = {};
  let outcome = "request-error";
  try {
    const response = await fetch(url, init);
    headersMs = Math.round(performance.now() - started);
    handlerMs = handlerDuration(response.headers?.get("Server-Timing"));
    if (trace) proxy = proxyDurations(response.headers?.get("X-Customer-Proxy-Timing"));
    if (!response.ok) throw new Error(errorMessage);
    const bodyStarted = performance.now();
    const result = await response.json();
    bodyMs = Math.round(performance.now() - bodyStarted);
    outcome = result?.success === false ? "application-error" : "success";
    return result as T;
  } finally {
    if (trace) report({ event: "request", operation, outcome,
      elapsedMs: Math.round(performance.now() - started), headersMs, bodyMs, handlerMs, ...proxy });
  }
}

export function observeSummarySelection<T>(promise: Promise<T>, started: number): Promise<T> {
  if (enabled()) selections.set(promise, { started, reported: false });
  return promise;
}

/** Called after summary data commits; distinct from request time and paint time. */
export function reportSummaryCommit(promise: Promise<unknown> | undefined) {
  const selection = promise && selections.get(promise);
  if (!selection || selection.reported || !enabled()) return;
  selection.reported = true;
  report({ event: "summary-commit", selectionToCommitMs: Math.round(performance.now() - selection.started) });
}
