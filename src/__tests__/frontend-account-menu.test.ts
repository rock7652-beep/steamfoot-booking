// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ logout: vi.fn<(form: FormData) => Promise<void>>(async () => undefined) }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: mock.logout }));
import { FrontendAccountMenu } from "@/components/frontend-account-menu";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(props: Partial<React.ComponentProps<typeof FrontendAccountMenu>> = {}) {
  await act(async () => root.render(React.createElement(FrontendAccountMenu, {
    storeSlug: "silverlily", name: "測試老師", ...props,
  })));
}
async function submit() {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => { host.querySelector("form")!.dispatchEvent(event); });
  return event;
}

describe("shared frontend account menu", () => {
  it("keeps logout last, exposes the full identity, and scopes its form to the current store", async () => {
    await render({ children: React.createElement("a", { href: "/income" }, "我的收入") });
    expect(host.querySelector('summary[aria-label="帳號選單"]')).not.toBeNull();
    expect(host.textContent).toContain("測試老師");
    expect(host.querySelector('input[name="storeSlug"]')?.getAttribute("value")).toBe("silverlily");
    const panel = host.querySelector('[aria-label="帳號操作"]')!;
    expect(panel.lastElementChild?.tagName).toBe("FORM");
    expect(panel.lastElementChild?.textContent).toContain("登出");
    expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("closes with Escape and returns focus to the account trigger", async () => {
    await render(); const details = host.querySelector("details")!;
    details.open = true;
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(details.open).toBe(false); expect(document.activeElement).toBe(host.querySelector("summary"));
  });

  it("closes on an outside pointer without closing on an inside pointer", async () => {
    await render(); const details = host.querySelector("details")!; details.open = true;
    await act(async () => { host.querySelector("summary")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(details.open).toBe(true);
    await act(async () => { document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(details.open).toBe(false);
  });

  it("preserves draft storage and the session when the existing leave guard refuses logout", async () => {
    sessionStorage.setItem("steamfoot-ui:v1:draft", "retained"); const leave = vi.fn(() => false);
    await render({ onBeforeLogout: leave }); await submit();
    expect(leave).toHaveBeenCalledTimes(1); expect(mock.logout).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("steamfoot-ui:v1:draft")).toBe("retained");
  });

  it("submits the current store once and clears only application draft state after approval", async () => {
    sessionStorage.setItem("steamfoot-ui:v1:draft", "clear"); sessionStorage.setItem("unrelated", "keep");
    const leave = vi.fn(() => true); await render({ onBeforeLogout: leave }); await submit();
    expect(leave).toHaveBeenCalledTimes(1); expect(mock.logout).toHaveBeenCalledTimes(1);
    expect(mock.logout.mock.calls[0][0].get("storeSlug")).toBe("silverlily");
    expect(sessionStorage.getItem("steamfoot-ui:v1:draft")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("keeps preview logout disabled and rejects even a scripted form submission", async () => {
    await render({ readOnly: true }); expect(host.querySelector("button")?.disabled).toBe(true);
    await submit(); expect(mock.logout).not.toHaveBeenCalled();
  });
});
