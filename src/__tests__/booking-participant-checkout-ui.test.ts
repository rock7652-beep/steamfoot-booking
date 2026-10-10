// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
const h = vi.hoisted(() => ({ collect: vi.fn(), resolve: vi.fn(), plan: vi.fn() }));
vi.mock("@/server/actions/booking-participants", () => ({ collectBookingParticipantTrial: h.collect, resolveBookingParticipant: h.resolve, completeBookingParticipantPlan: h.plan }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form", () => ({
  AssignPlanForm: ({ customerId, onSuccess, onPendingChange }: { customerId: string; onSuccess: () => void; onPendingChange: (pending: boolean) => void }) =>
    createElement("div", { "data-plan-customer": customerId }, "本人方案表單", createElement("button", {
      onClick: () => { onPendingChange(true); onSuccess(); },
    }, "模擬方案成功")),
}));
import { BookingParticipantCheckout } from "@/app/(dashboard)/dashboard/bookings/booking-participant-checkout";

let root: Root; let container: HTMLDivElement;
const updated = vi.fn(); const onBusy = vi.fn();
const checkout = (): NonNullable<BookingDrawerPayload["participantCheckout"]> => ({
  canCollect: true, canResolve: true, canSell: true, canDiscount: false,
  settings: { allowEdit: true, defaultPrice: 499, minPrice: 0, maxPrice: 3000 },
  plans: [{ id: "plan", name: "十堂", price: 5990, category: "PACKAGE", sessionCount: 10, validityDays: 90 }],
  slots: [
    { id: "primary-slot", position: 1, revision: 1, customerId: "primary", name: "預約者", service: "FIRST_TRIAL", status: "PENDING", collectedAmount: null },
    { id: "guest-slot", position: 2, revision: 2, customerId: "guest", name: "朋友", service: "FIRST_TRIAL", status: "PENDING", collectedAmount: null },
  ],
});
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  h.collect.mockResolvedValue({ success: true, data: { transactionId: "receipt" } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(data = checkout(), readOnly = false) {
  await act(async () => root.render(createElement(BookingParticipantCheckout, {
    bookingId: "booking", checkout: data, readOnly, blocked: false, onUpdated: updated, onBusy,
  })));
}
async function click(button: HTMLElement) { await act(async () => button.click()); }
const buttons = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.textContent === label);

describe("actual participant checkout component", () => {
  it("uses only this person's own wallet without recording a trial fee", async () => {
    const data = checkout(); data.slots[0].wallets = [{ id: "own", name: "本人十堂", available: 9 }];
    h.plan.mockResolvedValue({ success: true });
    await render(data); await click(buttons("使用本人方案")[0]);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(h.plan).toHaveBeenCalledWith({ bookingId: "booking", position: 1, revision: 1, walletId: "own" });
    expect(h.collect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("完成 1／2 · 已收 NT$ 0");
    expect(buttons("收體驗費")).toHaveLength(1);
  });

  it("collects one named slot in one submit, leaving the friend pending", async () => {
    await render(); await click(buttons("收體驗費")[0]);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(h.collect).toHaveBeenCalledWith({ bookingId: "booking", position: 1, revision: 1, amount: 499, paymentMethod: "CASH", note: "" });
    expect(container.textContent).toContain("已完成 · 體驗費 NT$ 499");
    expect(container.textContent).toContain("完成 1／2 · 已收 NT$ 499");
    expect(buttons("收體驗費")).toHaveLength(1); expect(updated).toHaveBeenCalledTimes(1);
    expect(onBusy.mock.calls.map(call => call[0])).toEqual([true, false]);
  });
  it("shows an error in the same row without completing anybody", async () => {
    h.collect.mockResolvedValue({ success: false, error: "金額不正確" });
    await render(); await click(buttons("收體驗費")[0]);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("金額不正確");
    expect(container.textContent).not.toContain("已完成"); expect(updated).not.toHaveBeenCalled();
  });
  it("a completed friend opens a plan for the friend, never for the booker", async () => {
    const data = checkout(); data.slots[1].status = "COMPLETED"; data.slots[1].collectedAmount = 499;
    await render(data); await click(buttons("購買本人方案")[0]);
    expect(container.querySelector('[data-plan-customer="guest"]')).not.toBeNull();
    expect(container.querySelector('[data-plan-customer="primary"]')).toBeNull();
  });
  it("unknown companion has no payment button and read-only view has no writes", async () => {
    const data = checkout(); data.slots[1].customerId = null; data.slots[1].name = null;
    await render(data); expect(buttons("收體驗費")).toHaveLength(1);
    expect(container.textContent).toContain("待建檔");
    await render(data, true); expect(container.querySelectorAll("button")).toHaveLength(0);
  });
  it("releases the group busy lock before unmounting a successful plan form", async () => {
    const data = checkout(); data.slots[0].status = "COMPLETED";
    await render(data); await click(buttons("購買本人方案")[0]);
    await click(buttons("模擬方案成功")[0]);
    expect(onBusy.mock.calls.map(call => call[0])).toEqual([true, false]);
    expect(container.querySelector('[data-plan-customer="primary"]')).toBeNull();
    expect(updated).toHaveBeenCalledTimes(1);
    expect(buttons("收體驗費")[0].disabled).toBe(false);
  });
  it("removes an already opened payment form when switched to read-only or collection permission is revoked", async () => {
    await render(); await click(buttons("收體驗費")[0]); expect(container.querySelector("form")).not.toBeNull();
    await render(checkout(), true); expect(container.querySelector("form")).toBeNull();
    const data = checkout(); data.canCollect = false;
    await render(data); expect(container.querySelector("form")).toBeNull();
    expect(h.collect).not.toHaveBeenCalled();
  });
  it("cancels only one place, without charging or requiring companion identity", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    h.resolve.mockResolvedValue({ success: true });
    const data = checkout(); data.slots[1].customerId = null; data.slots[1].name = null;
    await render(data); await click(buttons("取消名額")[1]);
    expect(h.resolve).toHaveBeenCalledWith({ bookingId: "booking", position: 2, revision: 2, status: "CANCELLED" });
    expect(container.textContent).toContain("已取消"); expect(buttons("收體驗費")).toHaveLength(1);
    expect(h.collect).not.toHaveBeenCalled(); confirm.mockRestore();
  });
  it("blocks a double submit while the receipt result is still pending", async () => {
    let finish!: (value: { success: boolean }) => void;
    h.collect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); await click(buttons("收體驗費")[0]);
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(h.collect).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true }));
  });
  it("uses refreshed authoritative amounts instead of the older local receipt", async () => {
    await render(); await click(buttons("收體驗費")[0]);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const data = checkout(); data.slots[0].revision = 2; data.slots[0].status = "COMPLETED"; data.slots[0].collectedAmount = 399;
    await render(data);
    expect(container.textContent).toContain("完成 1／2 · 已收 NT$ 399");
  });
});
