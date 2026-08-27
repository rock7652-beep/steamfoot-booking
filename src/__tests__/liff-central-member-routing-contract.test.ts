import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCentralMemberLiffIdForStore } from "@/lib/liff/central-member-config";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central-member LIFF routing contract", () => {
  it.each([
    ["zhubei", "2010761154-duGBs1Ng"],
    ["hsinchu", "2010761154-SWaHxZqg"],
    ["taichung", "2010761154-D24uwxIB"],
  ])("resolves %s to its own member LIFF", (storeSlug, expectedLiffId) => {
    expect(resolveCentralMemberLiffIdForStore(storeSlug)).toBe(expectedLiffId);
  });

  it("fails closed for an unknown store", () => {
    expect(resolveCentralMemberLiffIdForStore("unknown-store")).toBeNull();
  });

  it("maps each store to a member LIFF in the same LINE Login channel", () => {
    const resolver = source("src/lib/store-resolver.ts");

    expect(resolver).toContain("NEXT_PUBLIC_CENTRAL_MEMBER_LIFF_ID");
    expect(resolver).toContain("CENTRAL_MEMBER_LIFF_ENTRY_STORE_SLUG");
    expect(resolver).toContain('?? "zhubei"');
    expect(resolver).toContain("resolveStorePresentation(entryStoreSlug)");
    expect(resolver).toContain("replaceRetiredCentralMemberLiffId(configured)");
    expect(resolver).toContain(
      "replaceRetiredCentralMemberLiffId(entryStore?.liffId ?? null)",
    );

    const config = source("src/lib/liff/central-member-config.ts");
    expect(config).toContain('CENTRAL_MEMBER_LIFF_ID = "2010761154-duGBs1Ng"');
    expect(config).toContain('hsinchu: "2010761154-SWaHxZqg"');
    expect(config).toContain('taichung: "2010761154-D24uwxIB"');
    expect(config).toContain("resolveCentralMemberLiffIdForStore");
    expect(config).toContain(
      'RETIRED_CENTRAL_MEMBER_LIFF_ID = "2009711308-47Ffoh9r"',
    );
    expect(config).toContain(
      'CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID = "2010761154"',
    );
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
      expect(page).toContain("resolveCentralMemberLiffId(storeSlug)");
      expect(page).toContain("liffId={liffId}");
    }
  });

  it("uses the current store member LIFF during onboarding", () => {
    const onboarding = source("src/app/(liff)/liff/onboarding/page.tsx");
    expect(onboarding).toContain("resolveCentralMemberLiffId(storeSlug)");
    expect(source("src/app/(liff)/liff/public-trial/page.tsx")).not.toContain(
      "resolveCentralMemberLiffId",
    );
  });

  it("keeps the in-LIFF trial flow on the current store member LIFF", () => {
    const trial = source("src/app/(liff)/liff/trial-booking/page.tsx");
    expect(trial).toContain("resolveCentralMemberLiffId(storeSlug)");
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
