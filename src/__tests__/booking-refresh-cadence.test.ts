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

it("coalesces consecutive mutations across controller recreation into one trailing read", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const gate = createBookingRefreshGate();
  const load = vi.fn().mockResolvedValue([]);
  const options = { gate, load, apply: vi.fn(), onBusy: vi.fn(), onError: vi.fn(), paused: () => false };
  gate.nextAutomaticAt = 2000;
  const first = createBookingRefresh(options); first.schedule();
  await vi.advanceTimersByTimeAsync(1500);
  first.dispose();
  gate.nextAutomaticAt = Date.now() + 2000;
  const second = createBookingRefresh(options); second.schedule();
  await vi.advanceTimersByTimeAsync(1999);
  expect(load).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(1);
  second.dispose();
});
it("allows manual refresh during the quiet period without a second automatic read", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const gate = createBookingRefreshGate(); gate.nextAutomaticAt = 2000;
  const load = vi.fn().mockResolvedValue([]);
  const controller = createBookingRefresh({ gate, load, apply: vi.fn(), onBusy: vi.fn(), onError: vi.fn(), paused: () => false });
  controller.schedule(); await controller.refresh(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it("never applies or starts a trailing read after disposal", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const gate = createBookingRefreshGate(); gate.nextAutomaticAt = 2000;
  const load = vi.fn();
  const controller = createBookingRefresh({ gate, load, apply: vi.fn(), onBusy: vi.fn(), onError: vi.fn(), paused: () => false });
  controller.schedule(); controller.dispose();
  await vi.advanceTimersByTimeAsync(3000);
  expect(load).not.toHaveBeenCalled();
});
