// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@/server/actions/store-subscription", () => ({ upsertStoreSubscription: mocks.save }));
import { SubscriptionForm } from "@/app/hq/dashboard/stores/subscriptions/[storeId]/subscription-form";

let host: HTMLDivElement, root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ success: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(SubscriptionForm, {
    storeId: "disposable-date-fixture", isEdit: true,
    initial: { subscriptionId: "existing-subscription", plan: "BASIC", status: "ACTIVE", billingCycle: "MONTHLY", startedAt: "2026-09-20", effectiveAt: "", expiresAt: "2026-10-19", billingStatus: "WAIVED", paymentMethod: "", priceAmount: 0, note: "Synthetic fixture" },
  })));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function date(name: string) { return host.querySelector<HTMLInputElement>(`[name="${name}"]`)!; }
async function submit() {
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

it("submits visible native date values even without a React change event", async () => {
  date("startedAt").value = "2026-09-21";
  date("effectiveAt").value = "2026-09-22";
  date("expiresAt").value = "2026-10-25";
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "existing-subscription", storeId: "disposable-date-fixture", startedAt: "2026-09-21", effectiveAt: "2026-09-22", expiresAt: "2026-10-25" }));
});
it("keeps the reviewed service date when the payment cycle changes", async () => {
  expect(host.textContent).not.toContain("依週期帶入");
  const cycle = Array.from(host.querySelectorAll("select")).find(el => el.value === "MONTHLY")!;
  await act(async () => { cycle.value = "YEARLY"; cycle.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(date("expiresAt").value).toBe("2026-10-19");
  date("expiresAt").value = "2026-11-02";
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ billingCycle: "YEARLY", expiresAt: "2026-11-02" }));
});
it.each([2980, 4990, 0, null])("preserves the recorded amount %s on an existing monthly agreement", async amount => {
  await act(async () => root.render(createElement(SubscriptionForm, {
    key: String(amount), storeId: "synthetic-legacy", isEdit: true,
    initial: { subscriptionId: "legacy", plan: "ALLIANCE", status: "ACTIVE", billingCycle: "MONTHLY", startedAt: "2026-09-20", effectiveAt: "", expiresAt: "2026-10-19", billingStatus: "PAID", paymentMethod: "BANK_TRANSFER", priceAmount: amount, note: "原約待核" },
  })));
  expect(host.textContent).toContain("實收金額（NT$）");
  expect(host.textContent).toContain("合約總額與承諾期間：待核原合約");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: amount, expiresAt: "2026-10-19", note: "原約待核" }));
});
it("does not infer new service dates or receipts from the current plan price", async () => {
  await act(async () => root.render(createElement(SubscriptionForm, { key: "new", storeId: "synthetic-new", isEdit: false, initial: null })));
  date("startedAt").value = "2026-10-13";
  expect(date("expiresAt").value).toBe("");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: null, expiresAt: "" }));
});
it("does not silently reuse the initial start date when the user clears it", async () => {
  date("startedAt").value = "";
  await submit();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith("請填起始日");
});
it("submits cleared optional dates instead of stale state", async () => {
  date("expiresAt").value = "";
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ effectiveAt: "", expiresAt: "" }));
});
