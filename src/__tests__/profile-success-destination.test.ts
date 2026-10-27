import { describe, expect, it } from "vitest";
import { resolveProfileSuccessDestination } from "@/lib/profile-success-destination";

describe("resolveProfileSuccessDestination", () => {
  it.each([
    "/s/silverlily/profile?complete=1",
    "/s/silverlily/profile/",
    "/s/silverlily/book/../profile?complete=1",
    "/s/silverlily/%70rofile?complete=1",
    "/s/soulife/book",
    "https://example.com/s/silverlily/book",
    "//example.com/s/silverlily/book",
  ])("does not return a completed registration to an invalid destination: %s", (nextPath) => {
    expect(resolveProfileSuccessDestination({ nextPath, onboardingMode: true, prefix: "/s/silverlily" }))
      .toBe("/s/silverlily/my-plans");
  });

  it("preserves the interrupted store LIFF booking including its query", () => {
    expect(resolveProfileSuccessDestination({
      nextPath: "/s/silverlily/liff/member-booking?session=example",
      onboardingMode: true,
      prefix: "/s/silverlily",
    })).toBe("/s/silverlily/liff/member-booking?session=example");
  });
  it("sends a newly registered customer to My Plans", () => {
    expect(
      resolveProfileSuccessDestination({
        nextPath: null,
        onboardingMode: true,
        prefix: "/s/zhubei",
      }),
    ).toBe("/s/zhubei/my-plans");
  });

  it("returns to an interrupted booking flow after profile completion", () => {
    expect(
      resolveProfileSuccessDestination({
        nextPath: "/s/zhubei/book/new",
        onboardingMode: true,
        prefix: "/s/zhubei",
      }),
    ).toBe("/s/zhubei/book/new");
  });

  it("keeps ordinary profile edits on the profile page", () => {
    expect(
      resolveProfileSuccessDestination({
        nextPath: null,
        onboardingMode: false,
        prefix: "/s/zhubei",
      }),
    ).toBeNull();
  });
});
