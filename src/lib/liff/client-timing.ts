type Phase = "sdk_init" | "session_exchange" | "home_access" | "home_summary";

/** Local Performance entries only: no tokens, store/member IDs, or extra telemetry requests. */
export async function measureLiffClientPhase<T>(phase: Phase, work: () => Promise<T>): Promise<T> {
  let started: number | null = null;
  try { if (typeof performance !== "undefined") started = performance.now(); }
  catch { /* Timing must never block authentication. */ }
  try { return await work(); }
  finally {
    if (started !== null) {
      try { performance.measure(`liff:${phase}`, { start: started, end: performance.now() }); }
      catch { /* Older embedded browsers may not support measure options. */ }
    }
  }
}
