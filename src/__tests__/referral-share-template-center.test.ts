import { describe, expect, it } from "vitest";
import {
  OFFICIAL_REFERRAL_SHARE_TEMPLATES,
  REFERRAL_SHARE_TEMPLATE_CATEGORIES,
} from "@/lib/referral-share-official-templates";
import { normalizeReferralShareTemplate } from "@/lib/referral-share-template";

describe("official referral share template center", () => {
  it("ships at least 20 templates across every MVP category", () => {
    expect(OFFICIAL_REFERRAL_SHARE_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const category of ["FEATURED", "INDUSTRY", "OCCASION", "SEASONAL"] as const) {
      expect(
        OFFICIAL_REFERRAL_SHARE_TEMPLATES.some((item) => item.category === category),
      ).toBe(true);
    }
    expect(REFERRAL_SHARE_TEMPLATE_CATEGORIES[0]).toEqual({
      key: "ALL",
      label: "全部",
    });
  });

  it("uses stable unique ids", () => {
    const ids = OFFICIAL_REFERRAL_SHARE_TEMPLATES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every official template compatible with backend validation", () => {
    for (const item of OFFICIAL_REFERRAL_SHARE_TEMPLATES) {
      expect(() => normalizeReferralShareTemplate(item.content), item.id).not.toThrow();
      expect(item.content.match(/\{url\}/g)).toHaveLength(1);
    }
  });
});
