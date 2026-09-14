import { describe, expect, it, vi } from "vitest";
import { createBookingRefresh } from "@/lib/booking-refresh";

function setup() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  let paused = false;
  const load = vi.fn(() => new Promise<string>((yes, no) => { resolve = yes; reject = no; }));
  const apply = vi.fn();
  const onError = vi.fn();
  const onBusy = vi.fn();
  const controller = createBookingRefresh({ load, apply, onError, onBusy, paused: () => paused });
  return { controller, load, apply, onError, onBusy, resolve: (v: string) => resolve(v),
    reject: () => reject(new Error("offline")), pause: () => { paused = true; } };
}

describe("booking background refresh", () => {
  it("deduplicates overlapping timer, focus and manual requests", async () => {
    const s = setup();
    const request = s.controller.refresh();
    await s.controller.refresh();
    await s.controller.refresh();
    expect(s.load).toHaveBeenCalledTimes(1);
    s.resolve("complete server snapshot");
    await request;
    expect(s.apply).toHaveBeenCalledWith("complete server snapshot");
    expect(s.onBusy).toHaveBeenLastCalledWith(false);
  });

  it("never applies an old date/store response after disposal", async () => {
    const s = setup();
    const request = s.controller.refresh();
    s.controller.dispose();
    s.resolve("old store");
    await request;
    expect(s.apply).not.toHaveBeenCalled();
    await s.controller.refresh();
    expect(s.load).toHaveBeenCalledTimes(1);
  });

  it("does not load while editing, hidden or offline", async () => {
    const s = setup();
    s.pause();
    await s.controller.refresh();
    expect(s.load).not.toHaveBeenCalled();
  });

  it("discards a response when editing starts during the request", async () => {
    const s = setup();
    const request = s.controller.refresh();
    s.pause();
    s.resolve("would overwrite current state");
    await request;
    expect(s.apply).not.toHaveBeenCalled();
  });

  it("retains the displayed data after failure and allows retry", async () => {
    const s = setup();
    const request = s.controller.refresh();
    s.reject();
    await request;
    expect(s.apply).not.toHaveBeenCalled();
    expect(s.onError).toHaveBeenCalledOnce();
    const retry = s.controller.refresh();
    s.resolve("recovered");
    await retry;
    expect(s.apply).toHaveBeenCalledWith("recovered");
  });
});
