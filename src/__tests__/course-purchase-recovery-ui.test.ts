// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/actions/course-purchase-intent", () => ({
  prepareCoursePurchaseIntent: vi.fn(), getCoursePurchaseIntent: vi.fn(),
  getPendingCoursePurchaseIntent: vi.fn(), cancelCoursePurchaseIntent: vi.fn(),
  acknowledgeCoursePurchaseIntent: vi.fn(),
}));
import { CoursePurchaseIntentProvider, CoursePurchaseRecoveryNotice, useCoursePurchaseRecovery } from "@/app/(dashboard)/dashboard/courses/purchase-recovery";
import type { PurchaseIntentTransport } from "@/lib/purchase-intent-coordinator";

const key = "9ff0de58-4872-4eaf-8642-218f8d995e85";
const prepared = { status: "PREPARED" as const, requestKey: key, purchaseId: null };
const committed = { status: "COMMITTED" as const, requestKey: key, purchaseId: "purchase-1" };
const cancelled = { status: "CANCELLED" as const, requestKey: key, purchaseId: null };
let host: HTMLDivElement, root: Root;
const api = {
  prepare: vi.fn(), get: vi.fn(), getPending: vi.fn(), cancel: vi.fn(), acknowledge: vi.fn(),
} satisfies PurchaseIntentTransport<{customerId:string;requestKey:string;amount:number}>;
const send = vi.fn();
function Body({ customerId }: { customerId: string }) {
  const recovery = useCoursePurchaseRecovery(customerId, true);
  const [error, setError] = useState("");
  return createElement("div", null,
    createElement(CoursePurchaseRecoveryNotice, { recovery, disabled: false, onCommitted: () => {} }),
    createElement("p", { role: "alert" }, error),
    createElement("button", { disabled: recovery.blocked, onClick: () => void recovery.submit({ customerId, requestKey: "unused", amount: 1000 }, send).then(result => setError(result.error ?? "")) }, "購買"),
  );
}
function render(customerId: string) {
  return createElement(CoursePurchaseIntentProvider, { enabled: true, storeId: "test-store", family: "test", transport: api }, createElement(Body, { customerId }));
}
function button(label: string) { const result = [...host.querySelectorAll("button")].find(b => b.textContent === label); expect(result).toBeTruthy(); return result!; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => key });
  sessionStorage.clear(); vi.clearAllMocks();
  api.getPending.mockResolvedValue({ success: true, data: null });
  api.prepare.mockResolvedValue({ success: true, data: prepared });
  api.get.mockResolvedValue({ success: true, data: prepared });
  api.cancel.mockResolvedValue({ success: true, data: cancelled });
  api.acknowledge.mockResolvedValue({ success: true, data: committed });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});

it("shows a business error while retaining the unconfirmed purchase warning", async () => {
  send.mockResolvedValue({ success: false, error: "請選擇所屬店長" });
  await act(async () => root.render(render("student-a")));
  await act(async () => button("購買").click());
  expect(host.textContent).toContain("請選擇所屬店長");
  expect(host.textContent).toContain("收款結果尚未確認，請勿再次收款");
  expect(host.textContent).toContain("待確認購買");
  expect(sessionStorage.length).toBe(1);
  expect(api.acknowledge).not.toHaveBeenCalled();
});

it("warns about an unknown network outcome without inventing a business error", async () => {
  send.mockRejectedValue(new Error("network"));
  await act(async () => root.render(render("student-a")));
  await act(async () => button("購買").click());
  expect(host.textContent).toContain("收款結果尚未確認，請勿再次收款");
  expect(host.textContent).not.toContain("請選擇所屬店長");
  expect(sessionStorage.length).toBe(1);
  expect(api.acknowledge).not.toHaveBeenCalled();
});

it("times out a stuck status read, blocks purchase and permits a fresh check; late reads do not overwrite it", async () => {
  vi.useFakeTimers();
  try {
    let finish!: (result: {success:true;data:null}) => void;
    api.getPending.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(render("student-a")));
    expect(host.textContent).toContain("正在確認購買狀態");
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(host.textContent).toContain("購買結果尚未確認");
    expect(button("購買").disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
    await act(async () => button("重新核對").click());
    expect(button("購買").disabled).toBe(false);
    await act(async () => finish({ success: true, data: null }));
    expect(button("購買").disabled).toBe(false);
    expect(send).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("retains the key when preparation times out and ignores a late preparation result", async () => {
  vi.useFakeTimers();
  try {
    let finish!: (result: {success:true;data:typeof prepared}) => void;
    api.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(render("student-a")));
    act(() => button("購買").click());
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(host.textContent).toContain("購買結果尚未確認");
    expect(button("購買").disabled).toBe(true);
    expect(sessionStorage.length).toBe(1);
    await act(async () => finish({ success: true, data: prepared }));
    expect(button("購買").disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("does not acknowledge a late purchase response and recovers its committed status on manual check", async () => {
  vi.useFakeTimers();
  try {
    let finish!: (result: {success:true}) => void;
    send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(render("student-a")));
    act(() => button("購買").click());
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(host.textContent).toContain("收款結果尚未確認，請勿再次收款");
    expect(sessionStorage.length).toBe(1);
    await act(async () => finish({ success: true }));
    expect(api.acknowledge).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("這筆購買已完成");
    api.get.mockResolvedValue({ success: true, data: committed });
    await act(async () => button("重新核對").click());
    expect(host.textContent).toContain("這筆購買已完成");
    expect(send).toHaveBeenCalledOnce();
    expect(api.acknowledge).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); });

it("shows committed status before the operator confirms; only then acknowledges and permits the next purchase", async () => {
  send.mockImplementation(async () => { api.get.mockResolvedValue({ success: true, data: committed }); return { success: true }; });
  await act(async () => root.render(render("student-a")));
  await act(async () => button("購買").click());
  expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0][0].requestKey).toBe(key);
  expect(host.textContent).toContain("這筆購買已完成"); expect(api.acknowledge).not.toHaveBeenCalled();
  expect(button("購買").disabled).toBe(true);
  await act(async () => button("確認完成並繼續購買").click());
  expect(api.acknowledge).toHaveBeenCalledWith("student-a", key);
  expect(button("購買").disabled).toBe(false); expect(sessionStorage.length).toBe(0);
});

it("keeps the original key after an interrupted purchase and restores it on reopening without storing the payment", async () => {
  send.mockRejectedValue(new Error("network"));
  await act(async () => root.render(render("student-a")));
  await act(async () => button("購買").click());
  expect(host.textContent).toContain("待確認購買"); expect(send).toHaveBeenCalledOnce();
  expect([...Object.keys(sessionStorage)].map(k => sessionStorage.getItem(k)).join()).not.toContain("1000");
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(render("student-a")));
  expect(host.textContent).toContain("待確認購買"); expect(send).toHaveBeenCalledOnce();
  await act(async () => button("安全取消原請求").click());
  expect(api.cancel).toHaveBeenCalledWith("student-a", key); expect(host.textContent).toContain("安全取消");
  api.get.mockResolvedValue({ success: true, data: cancelled });
  await act(async () => button("確認取消").click());
  expect(sessionStorage.length).toBe(0);
});

it("does not send the old purchase when preparation completes after switching learners", async () => {
  let finish!: (result: {success:true;data:typeof prepared}) => void;
  api.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(render("student-a")));
  act(() => button("購買").click());
  await act(async () => { await Promise.resolve(); });
  expect(api.prepare).toHaveBeenCalledOnce();
  await act(async () => root.render(render("student-b")));
  await act(async () => finish({ success: true, data: prepared }));
  expect(send).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("待確認購買");
});

it("keeps the old committed blocker and does not display its late result on another learner", async () => {
  let finish!: (result: {success:true}) => void;
  send.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(render("student-a")));
  act(() => button("購買").click());
  await act(async () => { await Promise.resolve(); });
  expect(send).toHaveBeenCalledOnce();
  await act(async () => root.render(render("student-b")));
  await act(async () => finish({ success: true }));
  expect(host.textContent).not.toContain("這筆購買已完成"); expect(api.acknowledge).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(1);
});

it("recovers an unacknowledged committed purchase from another tab and never sends a second payment", async () => {
  api.getPending.mockResolvedValue({ success: true, data: committed });
  api.get.mockResolvedValue({ success: true, data: committed });
  await act(async () => root.render(render("student-a")));
  expect(host.textContent).toContain("這筆購買已完成"); expect(button("購買").disabled).toBe(true); expect(send).not.toHaveBeenCalled();
  await act(async () => button("確認完成並繼續購買").click());
  expect(api.acknowledge).toHaveBeenCalledWith("student-a", key); expect(send).not.toHaveBeenCalled();
});
