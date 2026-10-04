// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SlotAvailability } from "@/types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/server/actions/slots", () => ({ fetchDaySlots: mocks.fetch }));
import { RescheduleModal } from "@/app/(dashboard)/dashboard/bookings/reschedule-modal";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const confirm = vi.fn();
const pending = new Map<string, { resolve: (data: { slots: SlotAvailability[] }) => void; reject: (error: Error) => void }>();
const slot = (time: string, available = 2) => ({ startTime: time, available, isEnabled: true, isPast: false } as SlotAvailability);
const button = (text: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent === text)!;
async function date(value: string) {
  await act(async () => {
    const input = document.body.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function resolve(day: string, slots: SlotAvailability[]) {
  await act(async () => { pending.get(day)!.resolve({ slots }); });
}
beforeEach(async () => {
  vi.clearAllMocks(); pending.clear();
  mocks.fetch.mockImplementation((day: string) => new Promise((resolve, reject) => { pending.set(day, { resolve, reject }); }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(React.createElement(RescheduleModal, { open: true, onClose: vi.fn(), currentDate: "2026-10-01", currentSlotTime: "10:00", people: 1, onConfirm: confirm })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
it("shows loading immediately and ignores an older date response", async () => {
  expect(document.body.querySelector('[role="status"]')).not.toBeNull();
  await date("2026-10-02");
  expect(button("確認").disabled).toBe(true);
  await resolve("2026-10-02", [slot("11:00")]);
  act(() => button("11:00").click());
  expect(button("確認").disabled).toBe(false);
  await resolve("2026-10-01", [slot("10:00")]);
  expect(button("11:00")).toBeDefined();
  expect(button("10:00")).toBeUndefined();
  act(() => button("確認").click());
  expect(confirm).toHaveBeenCalledWith("2026-10-02", "11:00");
});
it("clears the old selection and blocks confirmation until a new usable slot is selected", async () => {
  await resolve("2026-10-01", [slot("11:00")]);
  act(() => button("11:00").click());
  expect(button("確認").disabled).toBe(false);
  await date("2026-10-02");
  expect(button("確認").disabled).toBe(true);
  await resolve("2026-10-02", [slot("11:00", 0), slot("12:00")]);
  expect(button("11:00").disabled).toBe(true);
  expect(button("確認").disabled).toBe(true);
  act(() => button("12:00").click());
  expect(button("確認").disabled).toBe(false);
});
it("ignores stale failures and keeps confirmation blocked on the current date's failure", async () => {
  await date("2026-10-02");
  await act(async () => pending.get("2026-10-01")!.reject(new Error("old failure")));
  expect(document.body.textContent).not.toContain("old failure");
  expect(document.body.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => pending.get("2026-10-02")!.reject(new Error("讀取失敗")));
  expect(document.body.textContent).toContain("讀取失敗");
  expect(button("確認").disabled).toBe(true);
});
