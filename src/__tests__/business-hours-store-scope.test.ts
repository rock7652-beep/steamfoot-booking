import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDayBusinessHoursContext: vi.fn(),
  requirePermission: vi.fn(),
  requireStaffSession: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  bookingCount: vi.fn(),
  bookingGroupBy: vi.fn(),
  specialUpsert: vi.fn(),
  txSpecialUpsert: vi.fn(),
  txSlotOverrideDeleteMany: vi.fn(),
  txSlotOverrideUpsert: vi.fn(),
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
  $executeRaw:vi.fn().mockResolvedValue(0),
  $queryRaw:vi.fn().mockResolvedValue([]),
  businessHours: {
    deleteMany: mocks.txHoursDeleteMany,
    createMany: mocks.txHoursCreateMany,
  },
  bookingSlot: {
    deleteMany: mocks.txSlotsDeleteMany,
    createMany: mocks.txSlotsCreateMany,
  },
  specialBusinessDay: { upsert: mocks.txSpecialUpsert },
  slotOverride: {
    deleteMany: mocks.txSlotOverrideDeleteMany,
    upsert: mocks.txSlotOverrideUpsert,
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw:vi.fn().mockResolvedValue([]),
    booking: { count: mocks.bookingCount, groupBy: mocks.bookingGroupBy },
    specialBusinessDay: { upsert: mocks.specialUpsert },
    store: { findFirst: mocks.storeFindFirst },
    businessHours: { findMany: mocks.hoursFindMany },
    bookingSlot: { findMany: mocks.slotsFindMany },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: mocks.loadDayBusinessHoursContext,
  applySlotOverrides: vi.fn(),
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
vi.mock("@/lib/industry-module-server", () => ({
  getStoreIndustryModule: vi.fn().mockResolvedValue("steamfoot"),
}));

import {getStoreIndustryModule} from "@/lib/industry-module-server";
import { addSpecialDay, applyDaySlotOverrides, syncFromHeadquarters } from "@/server/actions/business-hours";

describe("business-hours store isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockReset().mockResolvedValue([]);
    mocks.loadDayBusinessHoursContext.mockResolvedValue({ rule: { closed: false }, slotOverrides: [] });
    mocks.requirePermission.mockResolvedValue({ role: "ADMIN", storeId: null });
    mocks.resolveWriteStoreId.mockResolvedValue("branch-a");
    mocks.bookingCount.mockResolvedValue(0);
    mocks.bookingGroupBy.mockResolvedValue([]);
    mocks.specialUpsert.mockResolvedValue({ id: "special-a" });
  });

  it("explains the isolated preview date restriction before database writes", async () => {
    vi.stubEnv("COMPACT_OPERATIONS_PREVIEW", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    mocks.resolveWriteStoreId.mockResolvedValue("addons-qa-beauty");
    try {
      const result = await applyDaySlotOverrides({date:"2026-11-03",changes:[{startTime:"13:00",action:"disable"}]});
      expect(result).toMatchObject({success:false,error:expect.stringContaining("2030/11/03")});
      expect(mocks.loadDayBusinessHoursContext).not.toHaveBeenCalled();
      expect(mocks.txSlotOverrideUpsert).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it("rejects a store switch before loading or writing slots",async()=>{
    const result=await applyDaySlotOverrides({date:"2026-11-03",expectedStoreId:"branch-b",changes:[{startTime:"09:00",action:"disable"}]});
    expect(result).toMatchObject({success:false,error:expect.stringContaining("門市已切換")});
    expect(mocks.loadDayBusinessHoursContext).not.toHaveBeenCalled();
    expect(mocks.txSlotOverrideUpsert).not.toHaveBeenCalled();
  });
  it("rejects a stale hours revision before any slot mutation",async()=>{
    const result=await applyDaySlotOverrides({date:"2026-11-03",expectedHoursRevision:"old-revision",changes:[{startTime:"09:00",action:"disable"}]});
    expect(result).toMatchObject({success:false,error:expect.stringContaining("營業資料已更新")});
    expect(mocks.txSlotOverrideUpsert).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
  it("closes a beauty slot without cancelling existing appointments or reading Steamfoot bookings",async()=>{
    vi.mocked(getStoreIndustryModule).mockResolvedValueOnce("beauty");
    mocks.loadDayBusinessHoursContext.mockResolvedValue({rule:{closed:false,periods:[{openTime:"09:00",closeTime:"18:00",slotInterval:30}]},slotOverrides:[]});
    tx.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes("BeautyAppointment")?[{id:"existing",startsAt:new Date("2026-11-03T09:00:00+08:00"),occupiedEndsAt:new Date("2026-11-03T10:00:00+08:00")}]:[]);
    const result=await applyDaySlotOverrides({date:"2026-11-03",expectedStoreId:"branch-a",changes:[{startTime:"09:30",action:"disable"}]});
    expect(result).toMatchObject({success:true,data:{changed:1,bookedPeopleKept:1}});
    expect(mocks.bookingGroupBy).not.toHaveBeenCalled();
    expect(mocks.txSlotOverrideUpsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"branch-a",startTime:"09:30",type:"disabled"})}));
  });

  it("rejects reopening a training day", async () => {
    mocks.loadDayBusinessHoursContext.mockResolvedValue({ rule: { closed: true, status: "training", source: "special" }, slotOverrides: [] });
    const result = await applyDaySlotOverrides({
      date: "2026-09-21",
      changes: [{ startTime: "09:30", action: "enable" }],
    });
    expect(result.success).toBe(false);
    expect(mocks.txSlotOverrideUpsert).not.toHaveBeenCalled();
    expect(mocks.loadDayBusinessHoursContext).toHaveBeenCalledWith("branch-a", "2026-09-21");
  });

  it.each(["weekly", "special"])("opens only an explicit slot on a %s closed day", async (source) => {
    mocks.loadDayBusinessHoursContext.mockResolvedValue({ rule: { closed: true, status: "closed", source }, slotOverrides: [] });
    const result = await applyDaySlotOverrides({date:"2026-11-03",changes:[{startTime:"19:30",action:"enable",capacity:4}]});
    expect(result.success).toBe(true);
    expect(mocks.txSlotOverrideUpsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"branch-a",startTime:"19:30",type:"enabled",capacity:4})}));
    expect(mocks.txSpecialUpsert).not.toHaveBeenCalled();
    expect(mocks.specialUpsert).not.toHaveBeenCalled();
  });

  it("replaces a custom day's legacy slot overrides only after booking validation", async () => {
    const result = await addSpecialDay({
      date: "2026-08-24",
      type: "custom",
      openTime: "09:00",
      closeTime: "17:30",
      defaultCapacity: 6,
      periods: [
        { openTime: "09:00", closeTime: "12:00", slotInterval: 60, defaultCapacity: 6 },
        { openTime: "14:30", closeTime: "17:30", slotInterval: 60, defaultCapacity: 6 },
      ],
      resetSlotOverrides: true,
    });

    expect(result.success).toBe(true);
    expect(mocks.txSpecialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_date: { storeId: "branch-a", date: new Date("2026-08-24") } },
      }),
    );
    expect(mocks.txSlotOverrideDeleteMany).toHaveBeenCalledWith({
      where: { storeId: "branch-a", date: new Date("2026-08-24") },
    });
  });

  it("keeps legacy overrides when a booked time would disappear from the new schedule", async () => {
    mocks.bookingGroupBy.mockResolvedValue([
      { bookingDate: new Date("2026-08-24"), slotTime: "13:00", _sum: { people: 1 } },
    ]);

    const result = await addSpecialDay({
      date: "2026-08-24",
      type: "custom",
      openTime: "09:00",
      closeTime: "12:00",
      defaultCapacity: 6,
      periods: [
        { openTime: "09:00", closeTime: "12:00", slotInterval: 60, defaultCapacity: 6 },
      ],
      resetSlotOverrides: true,
    });

    expect(result).toEqual({
      success: false,
      error: "2026-08-24 13:00 已有預約，請先把這個時間保留在營業時段內",
    });
    expect(mocks.txSpecialUpsert).not.toHaveBeenCalled();
    expect(mocks.txSlotOverrideDeleteMany).not.toHaveBeenCalled();
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
    expect(mocks.txSpecialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_date: { storeId: "branch-a", date: new Date("2026-08-01") } },
        create: expect.objectContaining({ storeId: "branch-a" }),
      }),
    );
  });

  it("closes multiple slots without altering booked reservations", async () => {
    mocks.bookingGroupBy.mockResolvedValue([
      { slotTime: "09:30", _sum: { people: 2 } },
    ]);

    const result = await applyDaySlotOverrides({
      date: "2026-08-24",
      changes: [
        { startTime: "09:30", action: "disable" },
        { startTime: "10:30", action: "disable" },
      ],
    });

    expect(result).toEqual({ success: true, data: { changed: 2, bookedPeopleKept: 2 } });
    expect(mocks.bookingGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "branch-a", slotTime: { in: ["09:30", "10:30"] } }),
    }));
    expect(mocks.txSlotOverrideUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.txSlotOverrideUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ storeId: "branch-a", startTime: "09:30", type: "disabled" }),
    }));
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
