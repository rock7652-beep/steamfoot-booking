// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/actions/spa-resources", () => ({ saveSpaLocation: m.save }));
vi.mock("next/navigation", () => ({ usePathname:()=>"/s/spa/admin/dashboard/spa-resources",useRouter: () => ({ refresh: m.refresh }) }));
import { LocationWorkspace } from "@/app/(dashboard)/dashboard/spa-resources/workspace";
let root: Root, host: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();vi.stubGlobal("fetch",m.save);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(LocationWorkspace, { storeId:"store",locations: [], treatments: [{ id: "t1", name: "服務" }] })));
  await act(async () => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "新增位置")!.click());
  const input = host.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "新位置"); input.dispatchEvent(new Event("input", { bubbles: true })); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove();vi.unstubAllGlobals(); });
it("sends only one save for same-tick submits and does not issue a second refresh", async () => {
  let resolve!: (value: { success: boolean }) => void;
  m.save.mockReturnValue(new Promise(r => { resolve = r; }));
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
  await act(async () => resolve({json:async()=>({success:true,storeId:"store",data:{id:"L",name:"新位置",isActive:true,treatmentIds:[],revision:"r"}})} as never));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(m.refresh).not.toHaveBeenCalled();
});
it("retains failed draft and unlocks a retry after a definite rejection", async () => {
  m.save.mockResolvedValue({json:async()=>({ success: false, error: "名稱不可重複" })});
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(host.querySelector<HTMLInputElement>('input[maxlength="60"]')!.value).toBe("新位置");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("名稱不可重複");
  expect(host.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(false);
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(m.save).toHaveBeenCalledTimes(2);
});
