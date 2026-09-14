/** One request per page; obsolete responses never reach the visible list. */
export function createBookingRefresh<T>(options: {
  load: () => Promise<T>;
  apply: (value: T) => void;
  paused: () => boolean;
  onError: () => void;
  onBusy: (busy: boolean) => void;
}) {
  let disposed = false;
  let pending = false;

  async function refresh() {
    if (disposed || pending || options.paused()) return;
    pending = true;
    options.onBusy(true);
    try {
      const value = await options.load();
      if (!disposed && !options.paused()) options.apply(value);
    } catch {
      if (!disposed && !options.paused()) options.onError();
    } finally {
      pending = false;
      if (!disposed) options.onBusy(false);
    }
  }

  return { refresh, dispose: () => { disposed = true; } };
}
