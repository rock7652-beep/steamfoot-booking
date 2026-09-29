export function createBookingRefreshGate() {
  return { pending: false, nextAutomaticAt: 0 };
}

/** Cadence survives effect recreation; only explicit manual reads show a loader. */
export function createBookingRefresh<T>(options: {
  load: () => Promise<T>;
  apply: (value: T) => void;
  paused: () => boolean;
  onError: () => void;
  onBusy: (busy: boolean) => void;
  gate?: ReturnType<typeof createBookingRefreshGate>;
}) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = options.gate ?? createBookingRefreshGate();

  async function refresh(manual = false) {
    if (disposed || gate.pending || options.paused()) return;
    if (!manual && Date.now() < gate.nextAutomaticAt) return;
    gate.pending = true;
    gate.nextAutomaticAt = Date.now() + 60_000;
    if (manual) options.onBusy(true);
    try {
      const value = await options.load();
      if (!disposed && !options.paused()) options.apply(value);
    } catch {
      if (!disposed && !options.paused()) options.onError();
    } finally {
      gate.pending = false;
      if (!disposed && manual) options.onBusy(false);
    }
  }

  // Coalesce mutations until the trailing quiet period. Effect recreation
  // cancels the old timer while the shared gate retains the latest deadline.
  function schedule() {
    if (timer) clearTimeout(timer);
    if (disposed || options.paused()) return;
    const delay = Math.max(gate.pending ? 250 : 0, gate.nextAutomaticAt - Date.now());
    if (delay > 0) {
      timer = setTimeout(schedule, delay);
      return;
    }
    void refresh();
  }
  return { refresh, schedule, dispose: () => {
    disposed = true;
    if (timer) clearTimeout(timer);
  } };

}
