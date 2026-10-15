import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRetiredModuleRoute } from "@/lib/retired-module-routes";

describe("SPA preview direct entries", () => {
  it("rejects retired direct entries before authentication or fallback routing", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy.indexOf("if (isRetiredModuleRoute")).toBeLessThan(proxy.lastIndexOf("authenticatedProxy(...args)"));
    expect(proxy).toContain("status: 410");
    for (const path of ["/spa-preview", "/spa-preview/manager", "/spa-preview/staff"]) {
      expect(isRetiredModuleRoute(path, new URLSearchParams())).toBe(true);
    }
  });

  it.each([
    ["src/app/spa-preview/page.tsx", "/liff/design-preview"],
    ["src/app/spa-preview/manager/page.tsx", "/liff/manager-preview"],
    ["src/app/spa-preview/staff/page.tsx", "/liff/staff-preview"],
  ])("routes %s directly into the isolated SPA experience", (file, target) => {
    const source = readFileSync(file, "utf8");

    expect(source).toContain("SPA_DEMO_STORE.slug");
    expect(source).toContain(target);
    expect(source).not.toContain("zhubei");
    expect(source).not.toContain("暖暖蒸足");
  });
});
