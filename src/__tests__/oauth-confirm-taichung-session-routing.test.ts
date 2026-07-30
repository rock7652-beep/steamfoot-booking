import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taichung oauth-confirm session rebuilding", () => {
  const page = read("src/app/(auth)/oauth-confirm/finalize/page.tsx");
  const trigger = read(
    "src/app/(auth)/oauth-confirm/finalize/_components/finalize-trigger.tsx",
  );

  it("derives the coordinator from the signed server-side temp session", () => {
    expect(page).toContain("getOAuthTempSession");
    expect(page).toContain('tempSession?.channelKey === "taichung"');
    expect(page).toContain("taichungCoordinator=");
  });

  it("never rebuilds a Taichung JWT through the legacy global LINE provider", () => {
    expect(trigger).toContain('"/api/line-oauth/taichung/start"');
    expect(trigger).toContain("taichungCoordinator");
    expect(trigger).not.toContain(
      'taichungCoordinator\n          ? `/api/auth/signin',
    );
  });

  it("keeps non-Taichung compatibility on the existing signin route", () => {
    expect(trigger).toContain(
      '`/api/auth/signin?callbackUrl=${encodeURIComponent(result.callbackUrl)}`',
    );
  });
});
