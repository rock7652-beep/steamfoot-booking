import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taichung LINE OAuth store context", () => {
  it("refreshes the Taichung route cookie on both callback outcomes", () => {
    const route = read("src/app/api/auth/[...nextauth]/route.ts");

    expect(route).toContain('response.cookies.set("store-slug", "taichung"');
    expect(route).toContain("preserveTaichungStore(NextResponse.redirect(url))");
    expect(route).toContain("preserveTaichungStore(");
    expect(route).toContain('/oauth-confirm?callbackUrl=%2Fs%2Ftaichung%2Fbook');
  });

  it("retains Taichung after the one-time Auth.js bridge is cleared", () => {
    const completion = read("src/app/api/line-oauth/taichung/complete/route.ts");

    expect(completion).toContain('session.user.storeSlug !== "taichung"');
    expect(completion).toContain("response.cookies.delete(TAICHUNG_LINE_SESSION_COOKIE)");
    expect(completion).toContain('response.cookies.set("store-slug", "taichung"');
  });

  it("keeps the final browser destination explicitly store-scoped", () => {
    const client = read("src/app/(auth)/line-oauth/complete/line-oauth-complete.tsx");
    const handoff = read("src/lib/line-oauth/taichung-completion-client.ts");

    expect(client).toContain("completeTaichungLineLogin");
    expect(client).toContain('fetch("/api/line-oauth/taichung/complete"');
    expect(handoff).toContain('redirect("/s/taichung/book")');
    expect(handoff).toContain("completion_failed");
  });
});
