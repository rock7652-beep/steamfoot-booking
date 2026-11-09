/** Visible sports Preview reads only. Writes retain their existing transaction guards. */
export const SPORTS_SYNC_INTERVAL = 3_000;
/** Shared month/week/day calendar cadence; detail readers keep their own lifecycle. */
export const CALENDAR_SYNC_INTERVAL = 60_000;

export function startSportsBackgroundSync(
  read: () => Promise<boolean | null>,
  blocked: () => boolean = () => false,
  intervalMs = SPORTS_SYNC_INTERVAL,
) {
  let stopped = false;
  let reading = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    clear();
    if (!stopped && document.visibilityState === "visible") {
      timer = setTimeout(() => { void refresh(); }, Math.min(60_000, intervalMs * 2 ** failures));
    }
  };
  async function refresh() {
    if (stopped || reading) return;
    clear();
    if (document.visibilityState !== "visible") return;
    if (blocked()) { schedule(); return; }
    reading = true;
    try {
      const success = await read();
      if (success !== null) failures = success ? 0 : Math.min(5, failures + 1);
    } catch { failures = Math.min(5, failures + 1); }
    finally { reading = false; schedule(); }
  }
  const wake = () => { if (document.visibilityState === "visible") void refresh(); else clear(); };
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
  schedule();
  return () => {
    stopped = true;
    clear();
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
