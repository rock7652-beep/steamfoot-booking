import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA preview direct entries", () => {
  it("lets SPA direct entries bypass the default Steamfoot route fallback", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");

    expect(proxy).toContain('pathname === "/spa-preview"');
    expect(proxy).toContain('pathname.startsWith("/spa-preview/")');
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
