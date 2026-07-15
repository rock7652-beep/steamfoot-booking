import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, executeRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  },
}));

import {
  assertOfficialReferralTemplateId,
  getReferralTemplatePersonalization,
  recordReferralTemplateUsage,
  setReferralTemplateFavorite,
} from "@/server/services/referral-share-template-personalization";

describe("referral template personalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unknown template ids before any database write", async () => {
    expect(() => assertOfficialReferralTemplateId("not-official")).toThrow(
      "UNKNOWN_REFERRAL_SHARE_TEMPLATE",
    );

    await expect(
      setReferralTemplateFavorite({
        storeId: "store-a",
        templateId: "not-official",
        favorite: true,
      }),
    ).rejects.toThrow("UNKNOWN_REFERRAL_SHARE_TEMPLATE");

    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("writes favorites with the supplied authenticated store scope", async () => {
    executeRaw.mockResolvedValue(1);

    await setReferralTemplateFavorite({
      storeId: "store-a",
      templateId: "featured-genuine-review",
      favorite: true,
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(executeRaw.mock.calls[0])).toContain("store-a");
    expect(JSON.stringify(executeRaw.mock.calls[0])).toContain(
      "featured-genuine-review",
    );
  });

  it("removes only the matching store and template favorite", async () => {
    executeRaw.mockResolvedValue(1);

    await setReferralTemplateFavorite({
      storeId: "store-b",
      templateId: "featured-first-visit",
      favorite: false,
    });

    expect(JSON.stringify(executeRaw.mock.calls[0])).toContain("store-b");
    expect(JSON.stringify(executeRaw.mock.calls[0])).toContain(
      "featured-first-visit",
    );
  });

  it("records usage with store, template and action", async () => {
    executeRaw.mockResolvedValue(1);

    await recordReferralTemplateUsage({
      storeId: "store-c",
      templateId: "industry-steamfoot",
      action: "APPLY",
    });

    const payload = JSON.stringify(executeRaw.mock.calls[0]);
    expect(payload).toContain("store-c");
    expect(payload).toContain("industry-steamfoot");
    expect(payload).toContain("APPLY");
  });

  it("reads favorites and recent usage only for one store", async () => {
    queryRaw
      .mockResolvedValueOnce([{ templateId: "featured-genuine-review" }])
      .mockResolvedValueOnce([
        {
          templateId: "featured-genuine-review",
          action: "SAVE",
          createdAt: new Date("2026-07-15T00:00:00.000Z"),
        },
      ]);

    const result = await getReferralTemplatePersonalization("store-d");

    expect(result.favoriteTemplateIds).toEqual(["featured-genuine-review"]);
    expect(result.recent).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    for (const call of queryRaw.mock.calls) {
      expect(JSON.stringify(call)).toContain("store-d");
    }
  });
});
