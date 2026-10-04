// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ form: vi.fn(), slots: vi.fn(), create: vi.fn() }));
vi.mock("@/server/actions/trial-booking", () => ({loadTrialBookingFormData: m.form, createTrialBooking: m.create}));
vi.mock("@/server/actions/slots", () => ({fetchDaySlots: m.slots}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("sonner", () => ({toast: {success: vi.fn(), error: vi.fn()}}));
vi.mock("react-dom", async original => ({...await original<Record<string, unknown>>(), createPortal: (node: React.ReactNode) => node}));
vi.mock("@/components/admin/right-sheet", () => ({RightSheet: ({children}: {children: React.ReactNode}) => React.createElement("div", {role: "dialog"}, children)}));
import { TrialBookingDrawer } from "@/app/(dashboard)/dashboard/_components/trial-booking-drawer";
let host: HTMLDivElement, root: Root;
const settings = {trialEnabled: true, trialDefaultPrice: 350, trialAllowPriceEdit: true, trialMinPrice: 0, trialMaxPrice: 1000};
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => {resolve = r;}); return {resolve, promise}; }
beforeEach(() => {vi.resetAllMocks(); Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true}); host = document.createElement("div"); document.body.append(host); root = createRoot(host); m.form.mockResolvedValue({success: true, data: {settings, staffOptions: []}});});
afterEach(async () => {await act(async () => root.unmount()); host.remove();});
async function open() {await act(async () => root.render(React.createElement(TrialBookingDrawer, {preset: {date: "2026-10-05"}}))); await act(async () => host.querySelector("button")!.click());}
it("prevents a previous date response from replacing the selected date's slots", async () => {
  const first = deferred<{slots: {startTime: string; available: number; isEnabled: boolean}[]}>(), second = deferred<{slots: {startTime: string; available: number; isEnabled: boolean}[]}>();
  m.slots.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await open();
  const input = host.querySelector<HTMLInputElement>('input[type="date"]')!;
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-10-06"); input.dispatchEvent(new Event("input", {bubbles: true})); input.dispatchEvent(new Event("change", {bubbles: true}));});
  expect(m.slots).toHaveBeenCalledWith("2026-10-06");
  await act(async () => second.resolve({slots: [{startTime: "12:00", available: 2, isEnabled: true}]}));
  await act(async () => first.resolve({slots: [{startTime: "09:00", available: 2, isEnabled: true}]}));
  expect(host.textContent).toContain("12:00"); expect(host.textContent).not.toContain("09:00");
});
it("handles a failed preload and allows the next actual open to retry", async () => {
  m.form.mockRejectedValueOnce(new Error("offline"));
  await open(); expect(host.textContent).toContain("載入失敗");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="關閉"]')!.click());
  m.slots.mockResolvedValue({slots: []});
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("form")).not.toBeNull(); expect(m.form).toHaveBeenCalledTimes(2);
});
