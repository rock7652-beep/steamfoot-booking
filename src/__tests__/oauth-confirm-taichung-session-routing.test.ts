import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taichung oauth-confirm session rebuilding", () => {
  const trigger = read(
    "src/app/(auth)/oauth-confirm/finalize/_components/finalize-trigger.tsx",
  );

  it("issues the coordinator bridge from the server-side finalization route", () => {
    const login = read("src/server/actions/oauth-confirm.ts");
    const route = read("src/app/api/line-oauth/taichung/finalize/route.ts");
    expect(login).toContain('session.channelKey === "taichung"');
    expect(route).toContain("getOAuthTempSession");
    expect(route).toContain("TAICHUNG_LINE_SESSION_COOKIE");
  });

  it("never rebuilds a Taichung JWT through the legacy global LINE provider", () => {
    const login = read("src/server/actions/oauth-confirm.ts");
    expect(login).toContain("/api/line-oauth/taichung/finalize?customerId=");
    expect(trigger).not.toContain("finalizeTaichungProviderLineBind");
  });

  it("keeps non-Taichung compatibility on the existing signin route", () => {
    expect(trigger).toContain(
      '`/api/auth/signin?callbackUrl=${encodeURIComponent(result.callbackUrl)}`',
    );
  });
});
