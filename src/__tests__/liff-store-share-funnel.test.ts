import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaffSession: vi.fn(),
  getStoreFilter: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: mocks.requireStaffSession,
}));
vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: mocks.getStoreFilter,
}));
vi.mock("@/lib/db", () => ({
  prisma: { referralEvent: { groupBy: mocks.groupBy } },
}));

import { getLiffStoreShareFunnel } from "@/server/queries/referral-events";

describe("LIFF store share funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffSession.mockResolvedValue({
      id: "owner-a",
      role: "OWNER",
      storeId: "store-a",
    });
    mocks.getStoreFilter.mockReturnValue({ storeId: "store-a" });
    mocks.groupBy.mockResolvedValue([
      { type: "SHARE", _count: { id: 8 } },
      { type: "LINK_CLICK", _count: { id: 5 } },
      { type: "BOOKING_CREATED", _count: { id: 2 } },
    ]);
  });

  it("returns the last-30-day store-isolated LIFF funnel", async () => {
    await expect(getLiffStoreShareFunnel("store-a")).resolves.toEqual({
      successfulShares: 8,
      friendOpens: 5,
      trialBookings: 2,
    });

    expect(mocks.getStoreFilter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-a" }),
      "store-a",
    );
    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ["type"],
      where: expect.objectContaining({
        storeId: "store-a",
        createdAt: { gte: expect.any(Date) },
        source: { startsWith: "liff-store-share" },
        type: { in: ["SHARE", "LINK_CLICK", "BOOKING_CREATED"] },
      }),
      _count: { id: true },
    });
  });
});
