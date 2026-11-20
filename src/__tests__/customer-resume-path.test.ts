import { describe, expect, it } from "vitest";
import { customerResumePath, liffMemberResumeHref } from "@/lib/customer-resume-path";
import { publicTrialPrimaryIntent } from "@/lib/liff/public-trial-intent";

describe("customer session return routes", () => {
  it("preserves the original store, page, and selected tab through LINE's primary redirect", () => {
    const href = liffMemberResumeHref("shared-app", "warm", "/s/warm/liff/wallets?tab=active&liff.state=old#access_token=old");
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe("https://liff.line.me/shared-app/resume");
    const primary = publicTrialPrimaryIntent(url.pathname.replace("/shared-app", "") + url.search);
    expect(primary).toEqual({ kind: "resume", store: "warm", next: "/s/warm/liff/wallets?tab=active" });
    expect(publicTrialPrimaryIntent("/resume?store=warm&store=other&next=/s/warm/liff")).toEqual({ kind: "invalid" });
  });

  it("preserves browser state through a same-store login", () => {
    expect(customerResumePath("/s/warm/beauty?view=book&returnTo=stale#schedule", "warm", "web"))
      .toBe("/s/warm/beauty?view=book#schedule");
  });

  it.each([
    "https://outside.example/s/warm/book",
    "//outside.example/s/warm/book",
    "/s/other/book",
    "/s/warm/../other/book",
    "/s/warm/book%2f..%2fadmin",
    "/s/warm/admin/dashboard",
  ])("rejects %s as a web return target", (path) => {
    expect(customerResumePath(path, "warm", "web")).toBeNull();
  });

  it.each(["/liff/onboarding", "/liff/resume", "/liff/public-trial"])(
    "leaves the dedicated %s flow to its own login handler",
    (path) => expect(customerResumePath("/s/warm" + path, "warm", "line")).toBeNull(),
  );
});
