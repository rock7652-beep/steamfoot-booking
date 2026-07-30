import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central member store cookie", () => {
  it("uses the store-scoped route cookie as the single source of truth", () => {
    const centralStore = source("src/lib/central-member-store.ts");
    const proxy = source("src/proxy.ts");

    expect(centralStore).toContain(
      'export const CENTRAL_MEMBER_STORE_COOKIE = "store-slug"',
    );
    expect(proxy).toContain('response.cookies.set("store-slug", slug');
    expect(centralStore).not.toContain('"central-member-store"');
  });
});
