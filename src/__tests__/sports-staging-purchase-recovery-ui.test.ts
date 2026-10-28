// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SportsSnapshot } from "@/lib/sports-staging-types";

const m = vi.hoisted(() => ({ prepare: vi.fn(), pending: vi.fn(), get: vi.fn(), cancel: vi.fn(), ack: vi.fn(), command: vi.fn(), load: vi.fn() }));
vi.mock("@/server/actions/sports-staging", () => ({ loadSportsStaging: m.load, saveSportsSubject: vi.fn(), saveSportsFee: vi.fn(), sportsStagingCommand: m.command, prepareSportsStagingPurchaseIntent: m.prepare }));
vi.mock("@/server/actions/course-purchase-intent", () => ({ prepareCoursePurchaseIntent: vi.fn(), getPendingCoursePurchaseIntent: m.pending, getCoursePurchaseIntent: m.get, cancelCoursePurchaseIntent: m.cancel, acknowledgeCoursePurchaseIntent: m.ack }));
import { SportsStagingWorkspace } from "@/components/admin/sports-staging-workspace";

const initial: SportsSnapshot = { storeId: "sports-test", date: "2026-10-28", subjects: [{ id: "subject", name: "舞蹈", category: "舞蹈", active: true, updatedAt: "2026-10-28" }], fees: [{ id: "plan", subject: "subject", name: "十堂", unit: "堂數", amount: 10, price: 1000, days: 90, cost: 1, shared: false, templateId: "template", snapshot: "" }], lessons: [], students: [], customers: [{ id: "customer", name: "測試學員", phone: "0900000000" }], coaches: [], rooms: [] };
let host: HTMLDivElement, root: Root;
let state: { status: "PREPARED" | "COMMITTED"; requestKey: string; purchaseId: string | null } | null;
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent?.trim() === text);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.sessionStorage.clear(); vi.clearAllMocks(); state = null;
  m.pending.mockImplementation(async () => ({ success: true, data: state }));
  m.get.mockImplementation(async () => ({ success: true, data: state }));
  m.prepare.mockImplementation(async (input: { requestKey: string }) => { state = { status: "PREPARED", requestKey: input.requestKey, purchaseId: null }; return { success: true, data: state }; });
  m.command.mockImplementation(async () => { state = { status: "COMMITTED", requestKey: state!.requestKey, purchaseId: "sale" }; return { success: true }; });
  m.ack.mockImplementation(async () => ({ success: true, data: state }));
  m.load.mockResolvedValue({ success: true, data: initial });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.sessionStorage.clear(); });

async function openPurchase() {
  await act(async () => root.render(createElement(SportsStagingWorkspace, { initial, purchaseRecoveryEnabled: true })));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="收費方式"]')!.click());
  await act(async () => button("購買")!.click());
  await act(async () => {});
}

it("registers before checkout and retains the committed blocker until explicit acknowledgement", async () => {
  await openPurchase();
  const form = host.querySelector<HTMLFormElement>("#edit-form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(m.prepare).toHaveBeenCalledOnce();
  expect(m.command).toHaveBeenCalledOnce();
  expect(m.command.mock.calls[0][0].payload.requestKey).toBe(m.prepare.mock.calls[0][0].requestKey);
  expect(m.ack).not.toHaveBeenCalled();
  expect(host.textContent).toContain("這筆購買已完成");
  expect(button("確認完成並繼續購買")).toBeTruthy();
  await act(async () => button("確認完成並繼續購買")!.click());
  expect(m.ack).toHaveBeenCalledOnce();
  expect(window.sessionStorage.length).toBe(0);
});

it("does not submit checkout if the view unmounts before delayed preparation returns", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  m.prepare.mockImplementationOnce(async (input: { requestKey: string }) => { await gate; state = { status: "PREPARED", requestKey: input.requestKey, purchaseId: null }; return { success: true, data: state }; });
  await openPurchase();
  const form = host.querySelector<HTMLFormElement>("#edit-form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(m.prepare).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  await act(async () => { release(); await gate; });
  expect(m.command).not.toHaveBeenCalled();
  // A new mount can recover the same server intent; no payment form is persisted.
  expect(window.sessionStorage.length).toBe(1);
  root = createRoot(host);
});

it("restores the original key after a lost preparation response and page remount", async () => {
  m.prepare.mockImplementationOnce(async (input: { requestKey: string }) => {
    state = { status: "PREPARED", requestKey: input.requestKey, purchaseId: null };
    throw new Error("response lost");
  });
  await openPurchase();
  let form = host.querySelector<HTMLFormElement>("#edit-form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const original = m.prepare.mock.calls[0][0].requestKey;
  expect(m.command).not.toHaveBeenCalled();
  expect(window.sessionStorage.length).toBe(1);
  await act(async () => root.unmount());
  root = createRoot(host);
  await openPurchase();
  expect(host.textContent).toContain("待確認購買");
  form = host.querySelector<HTMLFormElement>("#edit-form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(m.prepare).toHaveBeenCalledTimes(2);
  expect(m.prepare.mock.calls[1][0].requestKey).toBe(original);
  expect(m.command).toHaveBeenCalledOnce();
  expect(m.command.mock.calls[0][0].payload.requestKey).toBe(original);
  expect(m.ack).not.toHaveBeenCalled();
});
