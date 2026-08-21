import { describe, expect, it } from "vitest";
import { resolveProfileSuccessDestination } from "@/lib/profile-success-destination";

describe("resolveProfileSuccessDestination", () => {
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
