// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/actions/trial-booking", () => ({ collectTrialPayment: vi.fn() }));
vi.mock("@/server/actions/customer", () => ({ updateCustomerAssignment: vi.fn(), searchReferrerCandidates: vi.fn() }));
vi.mock("@/components/admin/payment-split-fields", () => ({ PaymentSplitFields: () => null }));
import { CollectTrialModal } from "@/app/(dashboard)/dashboard/bookings/collect-trial-modal";
import { CustomerAttributionForm } from "@/components/customer-attribution-form";

let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(row => row.textContent === name)!;

it("collects a course trial once, without marking attendance, inside the owning detail panel", async () => {
  let resolve!: (value: { success: boolean; data: { serviceCompleted: boolean } }) => void;
  const save = vi.fn(() => new Promise<{ success: boolean; data: { serviceCompleted: boolean } }>(done => { resolve = done; }));
  const collected = vi.fn();
  await act(async () => root.render(createElement(CollectTrialModal, { embedded: true, open: true, onClose: vi.fn(), bookingId: "booking", customerName: "測試學員", dateLabel: "2026-10-12 15:00", expectedAmount: 300, people: 1, attendedPeople: null, settings: { allowEdit: false, defaultPrice: 300, minPrice: 300, maxPrice: 300 }, courseMode: true, saveAction: save, onCollected: collected })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { button("確認已收款").click(); button("確認已收款")?.click(); });
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "booking", amount: 300, completeService: false }));
  expect(collected).not.toHaveBeenCalled();
  await act(async () => resolve({ success: true, data: { serviceCompleted: false } }));
  expect(collected).toHaveBeenCalledWith(false);
});

it("allows music referral changes without inventing a staff assignment", async () => {
  const save = vi.fn().mockResolvedValue({ success: true });
  const saved = vi.fn();
  await act(async () => root.render(createElement(CustomerAttributionForm, { customerId: "music-member", currentStaffId: null, currentSponsor: { id: "referrer", name: "原推薦人" }, staffOptions: [], hideStaff: true, canAssign: true, saveAction: save, onSaved: saved })));
  await act(async () => button("清除").click());
  expect(button("儲存歸屬").disabled).toBe(false);
  await act(async () => button("儲存歸屬").click());
  expect(save).toHaveBeenCalledWith({ customerId: "music-member", assignedStaffId: "", referredByCustomerId: null });
  expect(saved).toHaveBeenCalledOnce();
});
