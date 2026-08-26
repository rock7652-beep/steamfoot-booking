import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central-member LIFF routing contract", () => {
  it("resolves one central LIFF ID with environment, entry-store and public fallbacks", () => {
    const resolver = source("src/lib/store-resolver.ts");

    expect(resolver).toContain("NEXT_PUBLIC_CENTRAL_MEMBER_LIFF_ID");
    expect(resolver).toContain("CENTRAL_MEMBER_LIFF_ENTRY_STORE_SLUG");
    expect(resolver).toContain('?? "zhubei"');
    expect(resolver).toContain("resolveStorePresentation(entryStoreSlug)");
    expect(resolver).toContain('entryStore?.liffId ?? "2009711308-47Ffoh9r"');
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

  it("keeps store-specific onboarding while allowing a central LIFF fallback", () => {
    const onboarding = source("src/app/(liff)/liff/onboarding/page.tsx");
    expect(onboarding).toContain(
      "presentation.liffId ?? (await resolveCentralMemberLiffId())",
    );
    expect(source("src/app/(liff)/liff/public-trial/page.tsx")).not.toContain(
      "resolveCentralMemberLiffId",
    );
  });

  it("allows the in-LIFF trial flow to fall back to the central LIFF", () => {
    const trial = source("src/app/(liff)/liff/trial-booking/page.tsx");
    expect(trial).toContain(
      "presentation.liffId ?? (await resolveCentralMemberLiffId())",
    );
  });

  it("never renders zero-session member data before the summary finishes loading", () => {
    const shell = source("src/app/(liff)/liff/liff-shell.tsx");
    expect(shell).toContain("if (!memberSummary)");
    expect(shell).toContain("MemberHomeSummaryLoading");
    expect(shell).toContain("正在讀取目前門市資料…");
    expect(shell).toContain('setMemberSummary("error")');
    expect(shell).toContain("您的方案與堂數不會受到影響");
  });
});
