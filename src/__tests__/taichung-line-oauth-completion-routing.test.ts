import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taiwan LINE OAuth completion routing", () => {
  const proxy = read("src/proxy.ts");
  const completion = read("src/app/(auth)/line-oauth/complete/line-oauth-complete.tsx");
  const page = read("src/app/(auth)/line-oauth/complete/page.tsx");
  const auth = read("src/lib/auth.ts");

  it("allows only the exact completion route before a session exists", () => {
    expect(proxy).toContain('pathname === "/line-oauth/complete"');
    expect(proxy).not.toContain('pathname.startsWith("/line-oauth/")');
  });

  it("uses the Taiwan credentials bridge, never the legacy line provider", () => {
    expect(completion).toContain("completeTaichungLineLogin");
    expect(completion).not.toContain('signIn("line"');
    expect(completion).toContain('fetch("/api/line-oauth/taichung/complete"');
    const helper = read("src/lib/line-oauth/taichung-completion-client.ts");
    expect(helper).toContain('signIn("line-taichung-coordinator"');
    expect(helper).toContain('redirect("/s/taichung/book")');
  });

  it("uses a fixed internal callback destination and claims the bridge once", () => {
    expect(page).toContain('callbackUrl="/s/taichung/book"');
    expect(auth).toContain("sessionConsumedAt: null");
    expect(auth).toContain("data: { sessionConsumedAt: new Date() }");
  });
});
