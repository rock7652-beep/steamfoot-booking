// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerInstantSearch } from "@/components/customer-instant-search";

let host: HTMLDivElement;
let root: Root;
const onChange = vi.fn();
const onSelect = vi.fn();
const rows = [{ id: "a", name: "黃彥陸", phone: "0912345678", lineName: "Yen" }];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scope: "u:s", rows, complete: true }) }));
  onChange.mockReset(); onSelect.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(storeId = "s") {
  await act(async () => { root.render(createElement(CustomerInstantSearch, { key: storeId, storeId, value: "", onChange, onSelect })); });
}
async function input(value: string) {
  await act(async () => {
    const field = host.querySelector("input")!;
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows a matching customer immediately without a timer or another request", async () => {
  await render(); await input("黃");
  expect(host.textContent).toContain("黃彥陸");
  expect(onChange).toHaveBeenCalledWith("黃");
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector("button")!.click());
  expect(onSelect).toHaveBeenCalledWith(rows[0]);
});
it("does not search unfinished Chinese composition", async () => {
  await render();
  await act(async () => host.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await input("ㄏ");
  expect(onChange).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("沒有符合");
  await input("黃");
  await act(async () => host.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "黃" })));
  expect(onChange).toHaveBeenCalledWith("黃");
  expect(host.textContent).toContain("黃彥陸");
});
it("shows loading rather than no results before the index is ready", async () => {
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  await render(); await input("黃");
  expect(host.textContent).toContain("載入顧客搜尋資料中");
  expect(host.textContent).not.toContain("沒有符合");
});
it("clears suggestions when the query is cleared", async () => {
  await render(); await input("黃"); await input("");
  expect(host.querySelector("button")).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith("");
});
it("does not retain the previous store index on store change", async () => {
  await render(); await input("黃");
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  await render("other"); await input("黃");
  expect(host.textContent).not.toContain("黃彥陸");
  expect(host.textContent).toContain("載入顧客搜尋資料中");
});
it("refreshes after a customer mutation without retaining old results", async () => {
  await render(); await input("黃");
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ scope: "u:s", rows: [], complete: true }) } as Response);
  await act(async () => window.dispatchEvent(new Event("customer-search-invalidated")));
  expect(host.textContent).not.toContain("黃彥陸");
  expect(host.textContent).toContain("沒有符合");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("shows a retry action rather than a false no-results message on load failure", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  await render(); await input("黃");
  expect(host.textContent).toContain("載入失敗");
  expect(host.textContent).not.toContain("沒有符合");
});
it("keeps matching candidates on Enter without selecting or submitting", async () => {
  await render(); await input("黃");
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => host.querySelector("input")!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(onSelect).not.toHaveBeenCalled();
  expect(host.textContent).toContain("黃彥陸");
});
it("drops old candidates while a changed list filter loads, retaining the input", async () => {
  await render(); await input("黃");
  let finish: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  await act(async () => root.render(createElement(CustomerInstantSearch, {
    key: "s", storeId: "s", value: "黃", onChange, onSelect, filterQuery: "staff=partner&status=linked",
  })));
  expect(host.querySelector("input")!.value).toBe("黃");
  expect(host.textContent).not.toContain("黃彥陸");
  expect(host.textContent).toContain("載入顧客搜尋資料中");
  await act(async () => host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(onSelect).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenLastCalledWith("/api/customers/search-index?storeId=s&staff=partner&status=linked", expect.anything());
  await act(async () => finish!({ ok: true, json: async () => ({ scope: "u:s", rows: [], complete: true }) } as Response));
  expect(host.textContent).toContain("沒有符合");
});
it("preserves list filters when searching beyond a truncated index", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ scope: "u:s", rows: [], complete: false }) } as Response);
  await act(async () => root.render(createElement(CustomerInstantSearch, {
    storeId: "s", value: "", onChange, onSelect, filterQuery: "staff=partner",
  })));
  await input("黃");
  expect(fetch).toHaveBeenLastCalledWith("/api/customers/search-index?storeId=s&staff=partner&q=%E9%BB%83", expect.anything());
});
it("cashbook defaults to the whole store without list filters", async () => {
  await render(); await input("黃");
  expect(fetch).toHaveBeenCalledWith("/api/customers/search-index?storeId=s", expect.anything());
  expect(host.textContent).toContain("黃彥陸");
});
it("reopens suggestions when typing again after selecting a customer", async () => {
  await render(); await input("黃");
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("button")).toBeNull();
  await input("091");
  expect(host.textContent).toContain("黃彥陸");
});

it("does not select after compositionend followed by Safari Enter", async () => {
  await render();
  await act(async () => host.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await input("黃");
  await act(async () => host.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "黃" })));
  const event = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true });
  await act(async () => host.querySelector("input")!.dispatchEvent(event));
  expect(onSelect).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
  expect(host.textContent).toContain("黃彥陸");
});
it("requires explicit candidate focus before keyboard selection", async () => {
  await render(); await input("黃");
  await act(async () => host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(host.querySelector("button"));
  expect(onSelect).not.toHaveBeenCalled();
  // Native button activation from Enter produces a click.
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(onSelect).toHaveBeenCalledWith(rows[0]);
});
