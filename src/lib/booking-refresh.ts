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

  return { refresh, dispose: () => { disposed = true; } };
}
