import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  awardPoints: vi.fn(async () => undefined),
  awardReferral: vi.fn(async () => undefined),
}));

vi.mock("@/server/actions/points", () => ({ awardPoints: h.awardPoints }));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: h.awardReferral,
}));

import { completePaidBookingInTransaction } from "@/server/services/paid-booking-completion";

function tx(status: "PENDING" | "CONFIRMED" | "COMPLETED" = "PENDING") {
  return {
    booking: {
      findUnique: vi.fn(async () => ({ bookingStatus: status })),
      update: vi.fn(async () => ({ id: "booking-1" })),
    },
  };
}

const base = {
  bookingId: "booking-1",
  bookingType: "FIRST_TRIAL" as const,
  customerId: "customer-1",
  storeId: "store-1",
  bookingDate: new Date("2026-07-23T00:00:00.000Z"),
  slotTime: "10:00",
  serviceStaffId: "staff-1",
};

describe("completePaidBookingInTransaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes a paid trial and records attendance side effects in the caller transaction", async () => {
    const client = tx();
    await completePaidBookingInTransaction(client as never, {
      ...base,
      attendedPeople: 2,
    });

    expect(client.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: expect.objectContaining({
        bookingStatus: "COMPLETED",
        isCheckedIn: true,
        serviceStaffId: "staff-1",
        attendedPeople: 2,
      }),
    });
    expect(h.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer-1", tx: client }),
    );
    expect(h.awardReferral).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer-1", tx: client }),
    );
  });

  it("rejects stale completed state before writing again", async () => {
    const client = tx("COMPLETED");
    await expect(
      completePaidBookingInTransaction(client as never, base),
    ).rejects.toThrow(/狀態已變更/);
    expect(client.booking.update).not.toHaveBeenCalled();
  });

  it("never lets package sessions bypass wallet deduction", async () => {
    const client = tx();
    await expect(
      completePaidBookingInTransaction(client as never, {
        ...base,
        bookingType: "PACKAGE_SESSION",
      }),
    ).rejects.toThrow(/不可使用收款並完成服務/);
    expect(client.booking.update).not.toHaveBeenCalled();
  });
});
