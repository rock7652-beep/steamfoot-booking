// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ unlink: vi.fn(), generate: vi.fn(), create: vi.fn(), cancel: vi.fn(), check: vi.fn(), execute: vi.fn(), updated: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/reminder", () => ({ unlinkLineAccount: h.unlink, generateLineBindingCode: h.generate }));
vi.mock("@/server/actions/line-rebind", () => ({ createLineRebindCaptureRequest: h.create, cancelLineRebindCaptureRequest: h.cancel, dryRunLineRebind: h.check, executeLineRebindAction: h.execute }));
import { LineBindingSection } from "@/app/(dashboard)/dashboard/customers/[id]/line-binding-section";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: Root;
const base = { compact: true, customerId: "a", lineLinkStatus: "LINKED", lineUserId: "private", lineLinkedAt: null, lineBindingCode: null, lineBindingCodeCreatedAt: null, canManageLineRebind: true, canRunLineRebindDryRun: true, activeLineRebindRequest: null, onUpdated: h.updated };
beforeEach(() => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(props: Partial<React.ComponentProps<typeof LineBindingSection>> = {}) { await act(async () => root.render(React.createElement(LineBindingSection, { ...base, ...props, key: props.customerId ?? "a" }))); }
function button(name: string) { return [...host.querySelectorAll("button")].find(node => node.textContent === name)!; }
async function click(name: string) { await act(async () => button(name).click()); }
async function type(selector: string, value: string) {
  const element = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(selector === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("confirms unlink in place, prevents duplicate writes and shows the confirmed unlinked status", async () => {
  let resolve!: (value: unknown) => void;
  h.unlink.mockReturnValue(new Promise(done => { resolve = done; }));
  await render(); await click("⋯ 管理"); await click("取消 LINE 綁定");
  expect(h.unlink).not.toHaveBeenCalled();
  await act(async () => { button("確認取消綁定").click(); button("確認取消綁定")?.click(); });
  expect(h.unlink).toHaveBeenCalledExactlyOnceWith("a");
  await act(async () => resolve({ success: true }));
  expect(host.textContent).toContain("未綁定");
  expect(host.textContent).toContain("預約、方案及消費紀錄均保留");
  expect(h.updated).toHaveBeenCalledOnce();
});
it("keeps the binding and permits retry after an unlink error", async () => {
  h.unlink.mockRejectedValue(new Error("offline"));
  await render(); await click("⋯ 管理"); await click("取消 LINE 綁定"); await click("確認取消綁定");
  expect(host.textContent).toContain("已綁定"); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(button("確認取消綁定").disabled).toBe(false); expect(h.updated).not.toHaveBeenCalled();
});
it("starts a real controlled request from the inline reason form", async () => {
  h.create.mockResolvedValue({ success: true, data: { status: "created" } });
  await render(); await click("⋯ 管理"); await click("開始重新綁定");
  await type("textarea", "顧客已出示本人資料，確認更換 LINE 帳號並由負責人核對完成。");
  await click("確認開始重新綁定");
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: "a" }));
  expect(h.updated).toHaveBeenCalledOnce();
});
it("checks the captured identity, requires explicit confirmation and executes the backend transaction", async () => {
  const request = { id: "request-a", status: "CANDIDATE_CAPTURED", capturedAt: null, expiresAt: new Date(Date.now() + 60000).toISOString(), userIdHashPrefix: null };
  h.check.mockResolvedValue({ success: true, data: { requestId: request.id, overall: "READY_FOR_REBIND", checks: {} } });
  h.execute.mockResolvedValue({ success: true });
  await render({ activeLineRebindRequest: request }); await click("⋯ 管理"); await click("檢查綁定資料");
  expect(h.check).toHaveBeenCalledWith("request-a"); await click("確認重新綁定");
  expect(h.execute).not.toHaveBeenCalled(); await type("input", "確認重新綁定");
  await act(async () => [...host.querySelectorAll("button")].filter(node => node.textContent === "確認重新綁定").at(-1)!.click());
  expect(h.execute).toHaveBeenCalledExactlyOnceWith("request-a"); expect(h.updated).toHaveBeenCalledOnce();
});
it("does not offer privileged writes without authorization", async () => {
  await render({ canManageLineRebind: false }); await click("⋯ 管理");
  expect(button("取消 LINE 綁定")).toBeUndefined(); expect(button("開始重新綁定")).toBeUndefined();
});
it("resets confirmation and private drafts on a customer switch", async () => {
  await render(); await click("⋯ 管理"); await click("開始重新綁定"); await type("textarea", "顧客 A 的尚未送出核對原因");
  await render({ customerId: "b" });
  expect(host.textContent).not.toContain("顧客 A"); expect(host.querySelector("textarea")).toBeNull();
  expect(h.create).not.toHaveBeenCalled();
});
