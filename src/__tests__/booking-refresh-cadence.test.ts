import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookingRefresh, createBookingRefreshGate } from "@/lib/booking-refresh";

afterEach(() => vi.useRealTimers());

describe("60 second booking refresh cadence", () => {
  it("limits three-second resume events even when effects are recreated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const gate = createBookingRefreshGate();
    const load = vi.fn().mockResolvedValue([]);
    const onBusy = vi.fn();
    const options = { gate, load, onBusy, apply: vi.fn(), onError: vi.fn(), paused: () => false };
    for (let seconds = 0; seconds < 60; seconds += 3) {
      vi.setSystemTime(seconds * 1000);
      const controller = createBookingRefresh(options);
      await controller.refresh();
      controller.dispose();
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(onBusy).not.toHaveBeenCalled();
    vi.setSystemTime(60_000);
    await createBookingRefresh(options).refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("deduplicates an in-flight request across effect recreation", async () => {
    const gate = createBookingRefreshGate();
    let resolve!: () => void;
    const load = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const apply = vi.fn();
    const options = { gate, load, apply, onBusy: vi.fn(), onError: vi.fn(), paused: () => false };
    const old = createBookingRefresh(options);
    const pending = old.refresh();
    old.dispose();
    await createBookingRefresh(options).refresh(true);
    expect(load).toHaveBeenCalledTimes(1);
    resolve();
    await pending;
    expect(apply).not.toHaveBeenCalled();
  });

  it("allows an explicit manual update before 60 seconds and shows its loader", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const load = vi.fn().mockResolvedValue([]);
    const onBusy = vi.fn();
    const controller = createBookingRefresh({ load, onBusy, apply: vi.fn(), onError: vi.fn(), paused: () => false });
    await controller.refresh();
    vi.setSystemTime(3000);
    await controller.refresh(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    vi.setSystemTime(60_000);
    await controller.refresh();
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(63_000);
    await controller.refresh();
    expect(load).toHaveBeenCalledTimes(3);
  });
});
