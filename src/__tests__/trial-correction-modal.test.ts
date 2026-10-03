// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), save: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: h.success, error: h.error } }));
vi.mock("@/server/actions/trial-booking", () => ({ correctTrialCollection: h.save }));
import { CorrectTrialCollectionModal } from "@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const corrected = vi.fn();
const reconcile = vi.fn();
const confirm = () => [...container.querySelectorAll("button")].at(-1)!;
beforeEach(async () => {
  vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(React.createElement(CorrectTrialCollectionModal, {
    open: true, onClose: vi.fn(), bookingId: "b", originalTransactionId: "old",
    customerName: "測試", dateLabel: "2026-09-28", originalAmount: 499,
    originalMethod: "CASH", originalDate: null, people: 1, attendedPeople: null,
    settings: { allowEdit: true, defaultPrice: 499, minPrice: 0, maxPrice: 3000 },
    saveAction: h.save, onCorrected: corrected, onReconcile: reconcile,
  })));
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "金額更正");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
it("blocks rapid duplicate clicks and only reports success after the authoritative response", async () => {
  let resolve!: (value: { success: boolean }) => void;
  h.save.mockImplementation(() => new Promise(r => { resolve = r; }));
  await act(async () => { confirm().click(); confirm().click(); });
  expect(h.save).toHaveBeenCalledTimes(1);
  expect(confirm().disabled).toBe(true);
  expect(h.success).not.toHaveBeenCalled();
  await act(async () => resolve({ success: true }));
  expect(corrected).toHaveBeenCalledTimes(1);
  expect(reconcile).not.toHaveBeenCalled();
});
it("preserves the partial-failure message and requests fresh detail", async () => {
  const error = "原收款已作廢，但新收款建立失敗";
  h.save.mockResolvedValue({ success: false, error });
  await act(async () => confirm().click());
  expect(h.error).toHaveBeenCalledWith(error);
  expect(corrected).not.toHaveBeenCalled();
  expect(reconcile).toHaveBeenCalledTimes(1);
});
it("handles a disconnected response without replaying or announcing success", async () => {
  h.save.mockRejectedValue(new TypeError("Failed to fetch"));
  await act(async () => confirm().click());
  expect(h.save).toHaveBeenCalledTimes(1);
  expect(h.error).toHaveBeenCalledWith(expect.stringContaining("結果待確認"));
  expect(h.success).not.toHaveBeenCalled();
  expect(corrected).not.toHaveBeenCalled();
  expect(reconcile).toHaveBeenCalledTimes(1);
});
