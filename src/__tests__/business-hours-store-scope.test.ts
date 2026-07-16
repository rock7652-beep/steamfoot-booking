import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireStaffSession: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  bookingCount: vi.fn(),
  specialUpsert: vi.fn(),
  storeFindFirst: vi.fn(),
  hoursFindMany: vi.fn(),
  slotsFindMany: vi.fn(),
  txHoursDeleteMany: vi.fn(),
  txSlotsDeleteMany: vi.fn(),
  txHoursCreateMany: vi.fn(),
  txSlotsCreateMany: vi.fn(),
  revalidateBusinessHours: vi.fn(),
  revalidateSpecialDays: vi.fn(),
}));

const tx = {
  businessHours: {
    deleteMany: mocks.txHoursDeleteMany,
    createMany: mocks.txHoursCreateMany,
  },
  bookingSlot: {
    deleteMany: mocks.txSlotsDeleteMany,
    createMany: mocks.txSlotsCreateMany,
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { count: mocks.bookingCount },
    specialBusinessDay: { upsert: mocks.specialUpsert },
    store: { findFirst: mocks.storeFindFirst },
    businessHours: { findMany: mocks.hoursFindMany },
    bookingSlot: { findMany: mocks.slotsFindMany },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/session", () => ({ requireStaffSession: mocks.requireStaffSession }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: mocks.resolveWriteStoreId,
  getActiveStoreForRead: vi.fn(),
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateBusinessHours: mocks.revalidateBusinessHours,
  revalidateSpecialDays: mocks.revalidateSpecialDays,
}));
vi.mock("@/lib/query-cache", () => ({ getCachedMonthScheduleSummary: vi.fn() }));

import { addSpecialDay, syncFromHeadquarters } from "@/server/actions/business-hours";

describe("business-hours store isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ role: "ADMIN", storeId: null });
    mocks.resolveWriteStoreId.mockResolvedValue("branch-a");
    mocks.bookingCount.mockResolvedValue(0);
    mocks.specialUpsert.mockResolvedValue({ id: "special-a" });
  });

  it("uses the resolved store for conflict checks and special-day upsert", async () => {
    const result = await addSpecialDay({ date: "2026-08-01", type: "closed" });

    expect(result.success).toBe(true);
    expect(mocks.bookingCount).toHaveBeenCalledWith({
      where: {
        storeId: "branch-a",
        bookingDate: new Date("2026-08-01"),
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    expect(mocks.specialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_date: { storeId: "branch-a", date: new Date("2026-08-01") } },
        create: expect.objectContaining({ storeId: "branch-a" }),
      }),
    );
  });

  it("copies from the validated headquarters into the resolved destination", async () => {
    mocks.storeFindFirst.mockResolvedValue({ id: "hq" });
    mocks.hoursFindMany.mockResolvedValue([
      { dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: 4 },
    ]);
    mocks.slotsFindMany.mockResolvedValue([]);

    const result = await syncFromHeadquarters();

    expect(result.success).toBe(true);
    expect(mocks.hoursFindMany).toHaveBeenCalledWith({ where: { storeId: "hq" } });
    expect(mocks.txHoursDeleteMany).toHaveBeenCalledWith({ where: { storeId: "branch-a" } });
    expect(mocks.txHoursCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ storeId: "branch-a", dayOfWeek: 1 })],
    });
  });

  it("rejects copying headquarters onto itself", async () => {
    mocks.resolveWriteStoreId.mockResolvedValue("hq");
    mocks.storeFindFirst.mockResolvedValue({ id: "hq" });

    const result = await syncFromHeadquarters();

    expect(result).toEqual({ success: false, error: "總部不需要同步自己的設定" });
    expect(mocks.txHoursDeleteMany).not.toHaveBeenCalled();
  });
});
