// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingOperationHelp } from "../components/booking-operation-help";
import { searchBookingGuides } from "../lib/operation-guide";

let host: HTMLDivElement;
let root: Root;
function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  act(() => button!.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no native modal implementation; this verifies React state only.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement("div", null,
    createElement("textarea", { "aria-label": "既有未儲存內容", defaultValue: "草稿保留" }),
    createElement(BookingOperationHelp))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("operation guide preview", () => {
  it("finds common scenario synonyms and handles unmatched queries", () => {
    expect(searchBookingGuides("改期").map((item) => item.id)).toEqual(["A01"]);
    expect(searchBookingGuides("  退費 ").map((item) => item.id)).toEqual(["A02"]);
    expect(searchBookingGuides("晚到").map((item) => item.id)).toEqual(["A03"]);
    expect(searchBookingGuides("不存在的情境")).toEqual([]);
  });
  it("opens questions first, expands cancellation consequences, and preserves page drafts", () => {
    const draft = host.querySelector("textarea")!;
    click("操作說明");
    expect(host.textContent).toContain("你想處理什麼");
    click("顧客取消預約怎麼處理");
    expect(host.querySelectorAll("ol li")).toHaveLength(3);
    click("查看完整說明");
    expect(host.textContent).toContain("取消預約不等於退費");
    click("關閉");
    expect(host.querySelector("dialog")!.open).toBe(false);
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("草稿保留");
    click("操作說明");
    expect(host.textContent).toContain("你想處理什麼");
    expect(host.querySelectorAll("ol li")).toHaveLength(0);
  });
  it("returns from an article without navigating away", () => {
    click("操作說明"); click("如何新增或修改本次預約備註");
    expect(host.textContent).toContain("已儲存本次備註");
    click("返回問題列表");
    expect(host.textContent).toContain("如何幫顧客改預約時間");
    expect(host.querySelector("dialog")!.open).toBe(true);
  });
  it("does not send Escape to the underlying booking drawer", () => {
    const outerListener = vi.fn();
    document.addEventListener("keydown", outerListener);
    try {
      click("操作說明");
      host.querySelector("dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(outerListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outerListener);
    }
  });
});
