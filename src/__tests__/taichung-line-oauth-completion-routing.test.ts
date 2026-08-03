import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taiwan LINE OAuth completion routing", () => {
  const proxy = read("src/proxy.ts");
  const coordinator = read("src/app/api/line-oauth/taichung/coordinator/route.ts");
  const completion = read("src/app/api/line-oauth/taichung/complete/route.ts");
  const page = read("src/app/(auth)/line-oauth/complete/page.tsx");
  const auth = read("src/lib/auth.ts");

  it("allows only the exact completion route before a session exists", () => {
    expect(proxy).toContain('pathname === "/line-oauth/complete"');
    expect(proxy).not.toContain('pathname.startsWith("/line-oauth/")');
  });

  it("starts the Taiwan credentials bridge on the server, never the legacy provider", () => {
    expect(coordinator).toContain('signIn("line-taichung-coordinator"');
    expect(coordinator).not.toContain('signIn("line"');
    expect(coordinator).toContain('"/api/line-oauth/taichung/complete"');
    expect(completion).toContain('new URL("/s/taichung/book"');
    expect(coordinator).not.toContain("useEffect");
    expect(existsSync(resolve(process.cwd(), "src/app/(auth)/line-oauth/complete/line-oauth-complete.tsx"))).toBe(false);
  });

  it("uses a fixed internal callback destination and claims the bridge once", () => {
    expect(page).toContain("completion_not_started");
    expect(auth).toContain("sessionConsumedAt: null");
    expect(auth).toContain("data: { sessionConsumedAt: new Date() }");
  });
});
