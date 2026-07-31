import { beforeEach, describe, expect, it, vi } from "vitest";

const { bookingCount } = vi.hoisted(() => ({
  bookingCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { count: bookingCount },
  },
}));

import {
  countYesterdayIncompleteServices,
  yesterdayBookingDateTaipei,
  yesterdayIncompleteBookingWhere,
} from "@/server/services/daily-action-digest";

describe("daily action digest yesterday incomplete services", () => {
  beforeEach(() => {
    bookingCount.mockReset();
  });

  it("uses the Asia/Taipei date boundary", () => {
    expect(yesterdayBookingDateTaipei(new Date("2026-07-30T15:59:59.999Z"))).toEqual(
      new Date("2026-07-29T00:00:00.000Z"),
    );
    expect(yesterdayBookingDateTaipei(new Date("2026-07-30T16:00:00.000Z"))).toEqual(
      new Date("2026-07-30T00:00:00.000Z"),
    );
  });

  it("queries the exact previous booking date instead of all older bookings", () => {
    const where = yesterdayIncompleteBookingWhere(
      "store-zhubei",
      new Date("2026-07-31T01:19:36.979Z"),
    );

    expect(where.bookingDate).toEqual(new Date("2026-07-30T00:00:00.000Z"));
    expect(where.bookingDate).not.toHaveProperty("lt");
  });

  it("excludes completed and cancelled bookings", () => {
    const where = yesterdayIncompleteBookingWhere(
      "store-zhubei",
      new Date("2026-07-31T01:19:36.979Z"),
    );

    expect(where.bookingStatus).toEqual({ in: ["PENDING", "CONFIRMED"] });
    expect(where.bookingStatus).not.toEqual(
      expect.objectContaining({ in: expect.arrayContaining(["COMPLETED"]) }),
    );
    expect(where.bookingStatus).not.toEqual(
      expect.objectContaining({ in: expect.arrayContaining(["CANCELLED"]) }),
    );
  });

  it("keeps genuinely incomplete pending and confirmed bookings eligible", async () => {
    bookingCount.mockResolvedValue(1);

    await expect(
      countYesterdayIncompleteServices(
        "store-zhubei",
        new Date("2026-07-31T01:19:36.979Z"),
      ),
    ).resolves.toBe(1);
    expect(bookingCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      }),
    });
  });

  it("keeps the query strictly scoped to the requested store", async () => {
    bookingCount.mockResolvedValue(0);

    await countYesterdayIncompleteServices(
      "store-zhubei",
      new Date("2026-07-31T01:19:36.979Z"),
    );

    expect(bookingCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: "store-zhubei",
        bookingDate: new Date("2026-07-30T00:00:00.000Z"),
      }),
    });
  });
});
