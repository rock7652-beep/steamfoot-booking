// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RightSheet } from "@/components/admin/right-sheet";

let root: Root;
let host: HTMLDivElement;
let trigger: HTMLButtonElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  trigger = document.createElement("button");
  document.body.append(trigger, host);
  trigger.focus();
  root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});
const button = (text: string) => React.createElement("button", { key: text }, text);
// eslint-disable-next-line react/no-children-prop
const sheet = (key: string, open: boolean, close: () => void) => React.createElement(RightSheet, { key, open, presentation: "centered", onClose: close, children: [button("First"), button("Last")] });

it("traps keyboard focus and restores the opener without scrolling on close", async () => {
  const close = vi.fn();
  await act(async () => root.render(sheet("main", true, close)));
  const buttons = host.querySelectorAll("button");
  expect(document.activeElement).toBe(buttons[0]);
  buttons[1].focus();
  buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(buttons[1]);
  const focus = vi.spyOn(trigger, "focus");
  await act(async () => root.render(sheet("main", false, close)));
  expect(document.activeElement).toBe(trigger);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(host.querySelector("[data-right-sheet]")?.hasAttribute("inert")).toBe(true);
});

it("Escape closes only the top panel and keeps the background locked until every panel closes", async () => {
  const parentClose = vi.fn(), childClose = vi.fn();
  document.body.style.overflow = "auto";
  await act(async () => root.render(sheet("parent", true, parentClose)));
  await act(async () => root.render([sheet("parent", true, parentClose), sheet("child", true, childClose)]));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  expect(childClose).toHaveBeenCalledTimes(1);
  expect(parentClose).not.toHaveBeenCalled();
  await act(async () => root.render([sheet("parent", false, parentClose), sheet("child", true, childClose)]));
  expect(document.body.style.overflow).toBe("hidden");
  await act(async () => root.render([sheet("parent", false, parentClose), sheet("child", false, childClose)]));
  expect(document.body.style.overflow).toBe("auto");
});

it("retains the covered roster and disables its controls while a foreground dialog is open", async () => {
  const close = vi.fn();
  // eslint-disable-next-line react/no-children-prop -- Required children prop in this createElement fixture.
  const parent = (covered: boolean) => React.createElement(RightSheet, {
    key: "roster", open: true, covered, presentation: "centered", onClose: close,
    children: React.createElement("input", { defaultValue: "陳", "aria-label": "清單搜尋" }),
  });
  await act(async () => root.render(parent(false)));
  const input = host.querySelector("input")!;
  input.value = "陳小姐";
  await act(async () => root.render([parent(true), sheet("payment", true, close)]));
  const roster = host.querySelector("[data-right-sheet]")!;
  expect(roster.hasAttribute("inert")).toBe(true);
  expect(roster.getAttribute("aria-hidden")).toBe("true");
  expect(roster.querySelector("input")).toBe(input);
  expect(input.value).toBe("陳小姐");
  await act(async () => root.render(parent(false)));
  expect(roster.hasAttribute("inert")).toBe(false);
  expect(input.value).toBe("陳小姐");
});
