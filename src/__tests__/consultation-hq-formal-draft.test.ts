// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/app/hq/dashboard/trial-applications/actions", () => ({ updateApplication: m.update }));
vi.mock("next/navigation", () => ({ usePathname: () => "/hq/dashboard/trial-applications", useRouter: () => ({ refresh: vi.fn() }) }));
import { OperationScope } from "@/components/operations/operation-scope";
vi.mock("@/app/hq/dashboard/trial-applications/consultation-actions", () => ({ updateConsultationLead: m.update }));
import { ConsultationNoteForm } from "@/app/hq/dashboard/trial-applications/consultation-forms";
import { TrialApplicationStatusForm } from "@/app/hq/dashboard/trial-applications/formal-status-form";
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear(); vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(show = true, scope = "admin:hq", status = "RECEIVED") {
  await act(async () => root.render(React.createElement(OperationScope, { key: scope, scope }, show ? React.createElement(TrialApplicationStatusForm, { id: "synthetic-formal-id", name: "合成店家", status }) : null)));
}
async function change(value: string) {
  await act(async () => { const input = host.querySelector("select")!; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("retains unsaved status across filters and server updates without submitting", async () => {
  await render(); await change("NEEDS_INFO");
  expect(host.querySelector('form[data-intake-dirty="true"]')).not.toBeNull();
  await render(false); await render(true, "admin:hq", "CONFIGURING");
  expect(host.querySelector("select")!.value).toBe("NEEDS_INFO"); expect(host.textContent).toContain("資料已有更新"); expect(m.update).not.toHaveBeenCalled();
  await render(true, "other-admin:hq"); expect(host.querySelector("select")!.value).toBe("RECEIVED");
});
it("keeps a failed edit and clears it only after a successful explicit save", async () => {
  m.update.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  await render(); await change("NEEDS_INFO");
  const submit = async () => { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); };
  await submit(); expect(host.querySelector("select")!.value).toBe("NEEDS_INFO"); expect(host.textContent).toContain("無法更新進度");
  await submit(); expect(host.querySelector('[data-intake-dirty="true"]')).toBeNull();
  expect(m.update.mock.calls[1][0].get("status")).toBe("NEEDS_INFO"); expect(m.update.mock.calls[1][0].get("id")).toBe("synthetic-formal-id");
});

it("a save finishing after filter-away cannot erase a newer remounted draft", async () => {
  let finish!: () => void;
  m.update.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(); await change("NEEDS_INFO");
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await render(false); await render(); await change("CONFIGURING");
  await act(async () => finish());
  expect(host.querySelector("select")!.value).toBe("CONFIGURING");
  expect(host.querySelector('[data-intake-dirty="true"]')).not.toBeNull();
});

it("clears exactly the saved note after filter-away without replaying it on return", async () => {
  let finish!: (value: unknown) => void;
  m.update.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const note = async (show = true) => { await act(async () => root.render(React.createElement(OperationScope, { scope: "admin:hq" }, show ? React.createElement(ConsultationNoteForm, { id: "lead", revision: 1 }) : null))); };
  await note();
  await act(async () => { const input = host.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "已聯繫，等候回覆"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await note(false); await act(async () => finish({ success: true, revision: 2, message: "已儲存" })); await note();
  expect(host.querySelector("textarea")!.value).toBe(""); expect(m.update).toHaveBeenCalledTimes(1);
});
