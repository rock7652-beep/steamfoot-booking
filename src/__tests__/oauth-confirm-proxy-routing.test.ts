import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

describe("OAuth confirmation proxy routing", () => {
  it("passes the complete oauth-confirm flow before the unauthenticated default-store fallback", () => {
    const flowGate = proxy.indexOf('pathname === "/oauth-confirm" || pathname.startsWith("/oauth-confirm/")');
    const defaultFallback = proxy.indexOf('if (!isLoggedIn) {\n    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/`, req.url));');

    expect(flowGate).toBeGreaterThan(-1);
    expect(defaultFallback).toBeGreaterThan(-1);
    expect(flowGate).toBeLessThan(defaultFallback);
  });

  it("does not rewrite oauth-confirm through a store route", () => {
    expect(proxy).toContain('return withDomainCookie(NextResponse.next(), domainStoreId);');
    expect(proxy).not.toContain('`/s/${DEFAULT_STORE_SLUG}/oauth-confirm`');
  });
});
