import { describe, expect, it } from "vitest";
import { liffMemberPortalPath } from "@/lib/liff/member-portal-path";

describe("LIFF module member destinations", () => {
  it.each(["fitness", "music"])("routes %s to its course portal and preserves approved deep links", slug => {
    expect(liffMemberPortalPath("course", slug, "?courseView=plans&next=https://foreign.test")).toBe(`/s/${slug}/book?memberEntry=liff&view=plans`);
    expect(liffMemberPortalPath("course", slug, "", true)).toBe(`/s/${slug}/book?memberEntry=liff&view=schedule`);
  });
  it("routes Beauty to its own member booking without accepting caller destinations", () => {
    expect(liffMemberPortalPath("beauty", "beauty-a", "?next=https://foreign.test&store=foreign")).toBe("/s/beauty-a/beauty");
    expect(liffMemberPortalPath("beauty", "beauty-a", "", true)).toBe("/s/beauty-a/beauty?view=book");
  });
  it("keeps Steam on its existing LIFF flow", () => {
    expect(liffMemberPortalPath("steamfoot", "zhubei", "", true)).toBeNull();
  });
});
