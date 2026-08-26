import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central-member LIFF routing contract", () => {
  it("resolves one central LIFF ID with a zhubei compatibility fallback", () => {
    const resolver = source("src/lib/store-resolver.ts");

    expect(resolver).toContain("NEXT_PUBLIC_CENTRAL_MEMBER_LIFF_ID");
    expect(resolver).toContain("CENTRAL_MEMBER_LIFF_ENTRY_STORE_SLUG");
    expect(resolver).toContain('?? "zhubei"');
    expect(resolver).toContain("resolveStorePresentation(entryStoreSlug)");
  });

  it("uses the central LIFF ID on all signed-in member pages", () => {
    const pages = [
      "src/app/(liff)/liff/page.tsx",
      "src/app/(liff)/liff/member-booking/page.tsx",
      "src/app/(liff)/liff/bookings/page.tsx",
      "src/app/(liff)/liff/wallets/page.tsx",
      "src/app/(liff)/liff/profile/page.tsx",
      "src/app/(liff)/liff/health/page.tsx",
    ];

    for (const pagePath of pages) {
      const page = source(pagePath);
      expect(page).toContain("resolveCentralMemberLiffId");
      expect(page).toContain("liffId={liffId}");
    }
  });

  it("keeps onboarding and public trial on their existing store-specific flow", () => {
    expect(source("src/app/(liff)/liff/onboarding/page.tsx")).not.toContain(
      "resolveCentralMemberLiffId",
    );
    expect(source("src/app/(liff)/liff/public-trial/page.tsx")).not.toContain(
      "resolveCentralMemberLiffId",
    );
  });
});
