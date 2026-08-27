import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proxySource = readFileSync("src/proxy.ts", "utf8");

describe("LIFF public trial endpoint compatibility", () => {
  it("serves the native public-trial bridge from the legacy LIFF endpoint", () => {
    expect(proxySource).toContain('if (subPath === "/trial-booking")');
    expect(proxySource).toContain(
      'return storeRewrite(req, "/liff/public-trial", storeSlug, domainStoreId);',
    );
  });

  it("handles the compatibility endpoint before unknown store paths redirect home", () => {
    const compatibilityIndex = proxySource.indexOf(
      'if (subPath === "/trial-booking")',
    );
    const fallbackIndex = proxySource.indexOf(
      "// ── 分店其他未知子路徑 → 導回店首頁 ──",
    );

    expect(compatibilityIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(compatibilityIndex);
  });
});
