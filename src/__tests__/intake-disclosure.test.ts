// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntakeDisclosure } from "@/app/hq/dashboard/trial-applications/intake-disclosure";

let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const escape = (target: HTMLElement) => act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
async function render() {
  await act(async () => root.render(createElement(IntakeDisclosure, { open: true, "aria-label": "申請資料" },
    createElement("summary", {}, "詳情"),
    createElement(IntakeDisclosure, { open: true }, createElement("summary", {}, "新增紀錄"),
      createElement("textarea", { defaultValue: "未儲存草稿" })),
    createElement("select", {}, createElement("option", {}, "待聯繫")))));
}
describe("native intake disclosure keyboard behavior", () => {
  it("closes only the nearest disclosure, restores focus and retains mounted edits", async () => {
    await render();
    const [outer, inner] = [...host.querySelectorAll("details")];
    const text = host.querySelector("textarea")!; text.focus();
    await escape(text);
    expect(inner.open).toBe(false); expect(outer.open).toBe(true);
    expect(document.activeElement).toBe(inner.querySelector("summary"));
    expect(text.value).toBe("未儲存草稿");
    await escape(inner.querySelector("summary")!);
    expect(outer.open).toBe(false); expect(document.activeElement).toBe(outer.querySelector("summary"));
    expect(text.isConnected).toBe(true);
  });
  it("does not consume the native select's Escape or force an already dismissed row open", async () => {
    await render();
    await escape(host.querySelector("select")!);
    expect(host.querySelector("details")!.open).toBe(true);
    const outer = host.querySelector("details")!;
    outer.open = false;
    await escape(outer.querySelector("summary")!);
    expect(outer.open).toBe(false);
  });
});
