import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Step = "authorization" | "store_scope" | "module_check" | "subscription" | "feature" | "transaction" | "db_lock" | "db_work" | "db_audit" | "cache" | "read_config" | "read_features" | "read_usage" | "read_setup" | "read_waitlist" | "read_permissions" | "read_trial" | "read_plan" | "read_audit" | "read_labels" | "read_scope" | "read_subscription";
type Span = { name: Step; durationMs: number; ok: boolean };
const context = new AsyncLocalStorage<{ spans: Span[] }>();

/** Fixed stage labels only; no payloads, identities, SQL, or error text. */
export async function settingsStep<T>(name: Step, work: () => Promise<T>): Promise<T> {
  const state = context.getStore();
  if (!state) return work();
  const start = performance.now();
  let ok = false;
  try { const value = await work(); ok = true; return value; }
  finally { state.spans.push({ name, durationMs: Math.round((performance.now() - start) * 10) / 10, ok }); }
}

export function settingsSyncStep<T>(name: Step, work: () => T): T {
  const state = context.getStore();
  if (!state) return work();
  const start = performance.now();
  let ok = false;
  try { const value = work(); ok = true; return value; }
  finally { state.spans.push({ name, durationMs: Math.round((performance.now() - start) * 10) / 10, ok }); }
}

export async function traceSettingsSave<T>(work: () => Promise<T>) {
  const traceId = randomUUID(), state = { spans: [] as Span[] }, start = performance.now();
  let result: T | undefined, failed = false;
  await context.run(state, async () => { try { result = await work(); } catch { failed = true; } });
  return { result, failed, traceId, totalMs: Math.round((performance.now() - start) * 10) / 10, spans: state.spans };
}

export function settingsServerTiming(totalMs: number, spans: Span[]) {
  const sums = new Map<string, number>();
  for (const span of spans) sums.set(span.name, (sums.get(span.name) ?? 0) + span.durationMs);
  return [`handler;dur=${totalMs}`, ...[...sums].map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)].join(", ");
}

/** Read traces preserve redirects/errors and never retain request data globally. */
export async function traceSettingsRead<T>(operation: "hub" | "layout", work: () => Promise<T>): Promise<T> {
  const traceId = randomUUID(), state = { spans: [] as Span[] }, start = performance.now();
  let ok = false;
  try { const result = await context.run(state, work); ok = true; return result; }
  finally { console.info("[SETTINGS_READ_PERF]", JSON.stringify({operation,traceId,ok,totalMs:Math.round((performance.now()-start)*10)/10,spans:state.spans})); }
}
