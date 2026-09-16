// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationGuideShell, OperationGuideTrigger, BookingGuideContext } from "../components/operation-guide-shell";
import { searchBookingGuides } from "../lib/operation-guide";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/bookings" }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: (props: Record<string, unknown>) => createElement("a", props) }));

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
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.show = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(OperationGuideShell, { enabled: true, access: { module: "steamfoot", permissions: ["booking.read", "booking.update"], features: {} } }, createElement("div", null,
    createElement("textarea", { "aria-label": "既有未儲存內容", defaultValue: "草稿保留" }),
    createElement(OperationGuideTrigger)))));
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
    click("？操作指南");
    expect(host.textContent).toContain("搜尋操作問題");
    click("取消預約");
    expect(host.querySelectorAll("ol li")).toHaveLength(3);
    expect(host.textContent).toContain("取消預約不等於退費");
    click("查看詳細說明");
    click("關閉");
    expect(host.querySelector("dialog")!.open).toBe(false);
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("草稿保留");
    click("？操作指南");
    expect(host.querySelectorAll("ol li")).toHaveLength(3);
    expect(host.querySelector('input[type="search"]')).toBeNull();
    click("返回問題列表");
    expect(host.querySelector('input[type="search"]')).not.toBeNull();
    expect(host.querySelectorAll("ol li")).toHaveLength(0);
  });
  it("has one header entry and receives the current booking context", () => {
    act(() => root.render(createElement(OperationGuideShell, { enabled: true, access: { module: "steamfoot", permissions: ["booking.read", "booking.update"], features: {} } }, createElement("div", null, createElement(OperationGuideTrigger), createElement(BookingGuideContext, { status: "COMPLETED" })))));
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "？操作指南")).toHaveLength(1);
    click("？操作指南");
    expect(host.textContent).toContain("這筆預約已完成");
    expect(host.querySelector("[data-operation-guide-shell]")?.getAttribute("data-guide-open")).toBe("true");
    click("關閉");
    expect(host.querySelector("[data-operation-guide-shell]")?.getAttribute("data-guide-open")).toBe("false");
  });
  it("prioritizes notes for completed or cancelled bookings while keeping rules searchable", () => {
    expect(searchBookingGuides("", "COMPLETED").map((item) => item.id)).toEqual(["A03", "A01", "A02"]);
    expect(searchBookingGuides("取消", "CANCELLED").map((item) => item.id)).toEqual(["A02"]);
  });
  it("returns from an article without navigating away", () => {
    click("？操作指南"); click("這次預約有事情要交代");
    expect(host.textContent).toContain("已儲存本次備註");
    click("返回問題列表");
    expect(host.textContent).toContain("顧客想改時間");
    expect(host.querySelector("dialog")!.open).toBe(true);
  });
  it("does not send Escape to the underlying booking drawer", () => {
    const outerListener = vi.fn();
    document.addEventListener("keydown", outerListener);
    try {
      click("？操作指南");
      host.querySelector("dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(outerListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outerListener);
    }
  });
});
