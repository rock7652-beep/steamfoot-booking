// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewToolsMenu } from "@/components/preview-tools-menu";

const mounted: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => { for (const root of mounted.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("preview tools interaction", () => {
  it("opens scoped links, closes on Escape, and restores keyboard focus", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); mounted.push(root);
    await act(async () => root.render(createElement(PreviewToolsMenu, { storeName: "測試門市", items: [
      { label: "前台預覽", href: "/s/test/admin/dashboard/frontend-preview", locked: false },
      { label: "裝置預覽", href: "/s/test/admin/dashboard/device-preview", locked: true, status: "已隱藏" },
    ] })));
    const button = host.querySelector("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain("測試門市");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/s/test/admin/dashboard/frontend-preview");
    expect(host.querySelectorAll("a")).toHaveLength(1);
    expect(host.textContent).toContain("已隱藏");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    await act(async () => button.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
  it("does not expose a trigger when no preview permission remains", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); mounted.push(root);
    await act(async () => root.render(createElement(PreviewToolsMenu, { items: [] })));
    expect(host.querySelector("button")).toBeNull();
  });
});
