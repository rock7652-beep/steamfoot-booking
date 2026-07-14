import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  bookingFindUnique: vi.fn(),
  referralEventCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: mocks.customerFindUnique },
    booking: { findUnique: mocks.bookingFindUnique },
    referralEvent: { create: mocks.referralEventCreate },
  },
}));

import { createReferralEvent } from "@/server/services/referral-events";

describe("ReferralEvent store consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customerFindUnique.mockImplementation(({ where }) =>
      Promise.resolve({
        id: where.id,
        storeId: "store-a",
        mergedIntoCustomerId: null,
      }),
    );
    mocks.bookingFindUnique.mockResolvedValue({
      id: "booking-a",
      storeId: "store-a",
    });
    mocks.referralEventCreate.mockResolvedValue({ id: "event-a" });
  });

  it("同店 Customer / referrer / Booking 才寫入", async () => {
    await expect(
      createReferralEvent({
        storeId: "store-a",
        type: "BOOKING_CREATED",
        customerId: "customer-a",
        referrerId: "referrer-a",
        bookingId: "booking-a",
        source: "test",
      }),
    ).resolves.toEqual({ id: "event-a" });

    expect(mocks.referralEventCreate).toHaveBeenCalledTimes(1);
  });

  it("拒絕跨店推薦人", async () => {
    mocks.customerFindUnique.mockImplementation(({ where }) =>
      Promise.resolve({
        id: where.id,
        storeId: where.id === "referrer-b" ? "store-b" : "store-a",
        mergedIntoCustomerId: null,
      }),
    );

    await expect(
      createReferralEvent({
        storeId: "store-a",
        type: "SHARE",
        referrerId: "referrer-b",
      }),
    ).rejects.toThrow("推薦事件店舖不一致");
    expect(mocks.referralEventCreate).not.toHaveBeenCalled();
  });

  it("拒絕跨店 Booking", async () => {
    mocks.bookingFindUnique.mockResolvedValue({
      id: "booking-b",
      storeId: "store-b",
    });

    await expect(
      createReferralEvent({
        storeId: "store-a",
        type: "BOOKING_COMPLETED",
        bookingId: "booking-b",
      }),
    ).rejects.toThrow("推薦事件店舖不一致");
    expect(mocks.referralEventCreate).not.toHaveBeenCalled();
  });

  it("拒絕已合併推薦人", async () => {
    mocks.customerFindUnique.mockResolvedValue({
      id: "merged-referrer",
      storeId: "store-a",
      mergedIntoCustomerId: "canonical-customer",
    });

    await expect(
      createReferralEvent({
        storeId: "store-a",
        type: "SHARE",
        referrerId: "merged-referrer",
      }),
    ).rejects.toThrow("推薦事件不可使用已合併顧客");
    expect(mocks.referralEventCreate).not.toHaveBeenCalled();
  });

  it("拒絕不存在的關聯實體", async () => {
    mocks.customerFindUnique.mockResolvedValue(null);

    await expect(
      createReferralEvent({
        storeId: "store-a",
        type: "REGISTER",
        customerId: "missing-customer",
      }),
    ).rejects.toThrow("推薦事件顧客不存在");
    expect(mocks.referralEventCreate).not.toHaveBeenCalled();
  });
});
