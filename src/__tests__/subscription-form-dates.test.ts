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
it("preserves cycle autofill and permits a subsequent manual override", async () => {
  const fill = Array.from(host.querySelectorAll("button")).find(b => b.textContent === "依週期帶入")!;
  await act(async () => fill.click());
  expect(date("expiresAt").value).toBe("2026-10-19");
  date("expiresAt").value = "2026-11-02";
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: "2026-11-02" }));
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
