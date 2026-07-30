import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer legacy route store priority", () => {
  it("prefers the recent store cookie over a stale customer JWT", () => {
    const proxy = source("src/proxy.ts");

    expect(proxy).toContain('req.cookies.get("store-slug")?.value');
    expect(proxy).toContain('cookieStoreSlug !== "__hq__"');
    expect(proxy).toContain("const customerRouteSlug =");
    expect(proxy).toContain('role === "CUSTOMER" ? customerRouteSlug : userSlug');
    expect(proxy).toContain('`/s/${customerRouteSlug}/book`');
  });

  it("keeps explicit store URLs authoritative and leaves membership checks server-side", () => {
    const proxy = source("src/proxy.ts");
    const layout = source("src/app/(customer)/layout.tsx");

    expect(proxy).toContain("return storeRewrite(req, subPath, storeSlug, domainStoreId)");
    expect(layout).toContain("resolveCentralMembershipsForUser(user.id)");
    expect(layout).toContain("decideCustomerStoreAccess");
    expect(layout).toContain('redirect("/store-select")');
  });
});
