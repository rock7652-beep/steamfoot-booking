// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CashDrawerHomeStatus, CashDrawerShortcut } from "@/components/cash-drawer-shortcut";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(createElement("div", null,
    createElement("input", { defaultValue: "背景草稿", "aria-label": "備註" }),
    createElement(CashDrawerShortcut, { storeId: "a", prefix: "/hq" }),
    createElement(CashDrawerHomeStatus, { storeId: "a", initialStatus: "未開店" }))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function click(label: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent === label); expect(button).toBeTruthy(); act(() => button!.click()); }
function message(data: object, overrides: MessageEventInit = {}) {
  const frame = document.querySelector("iframe")!;
  act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: frame.contentWindow, data: { type: "steamfoot:cash-drawer-panel", storeId: "a", ...data }, ...overrides })));
}
describe("cash drawer shortcut", () => {
  it("opens the existing store workspace from home without remounting a draft", () => {
    const input = host.querySelector("input")!; input.value = "尚未儲存";
    click("開啟現金抽屜 →");
    const src = document.querySelector("iframe")!.getAttribute("src")!;
    expect(src).toContain("/hq/dashboard/cash-drawer?"); expect(src).toContain("panelStoreId=a");
    expect(document.body.textContent).toContain("讀取現金抽屜");
    message({ status: "營業中", dirty: false, busy: false });
    expect(host.textContent).toContain("營業中");
    click("關閉");
    expect(document.querySelector("iframe")).toBeNull(); expect(host.querySelector("input")).toBe(input); expect(input.value).toBe("尚未儲存");
  });
  it("ignores messages from a different store, origin or frame", () => {
    click("現金抽屜");
    message({ storeId: "b", status: "已結帳" });
    message({ status: "已結帳" }, { origin: "https://other.example" });
    message({ status: "已結帳" }, { source: window });
    expect(document.body.textContent).toContain("讀取現金抽屜"); expect(host.textContent).not.toContain("已結帳");
  });
  it("protects an unsaved cash form and blocks closing during submission", () => {
    click("現金抽屜");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    message({ dirty: true, busy: false }); click("關閉");
    expect(confirm).toHaveBeenCalledTimes(1); expect(document.querySelector("iframe")).not.toBeNull();
    message({ dirty: true, busy: true }); click("處理中…");
    expect(confirm).toHaveBeenCalledTimes(1); expect(document.querySelector("iframe")).not.toBeNull();
    message({ dirty: true, busy: false }); confirm.mockReturnValue(true); click("關閉");
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("drops the embedded document on a store switch", () => {
    click("現金抽屜");
    act(() => root.render(createElement(CashDrawerShortcut, { key: "b", storeId: "b", prefix: "/hq" })));
    expect(document.querySelector("iframe")).toBeNull(); click("現金抽屜");
    expect(document.querySelector("iframe")!.getAttribute("src")).toContain("panelStoreId=b");
  });
});
