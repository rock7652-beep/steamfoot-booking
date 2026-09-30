import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findMusic: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: mocks, storeFeatureEntitlement: { findFirst: mocks.findMusic } } }));

import { getOperationHistory, listOperationAudits, recordOperationAudit } from "@/server/services/operation-audit";

describe("shared operation audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records course operations as music or fitness from the store profile", async () => {
    mocks.create.mockResolvedValue({ id: "audit-course" });
    mocks.findMusic.mockResolvedValue({ storeId: "music-store" });
    await recordOperationAudit({
      actorUserId: "user-1", storeId: "music-store", module: "COURSE",
      targetType: "CourseBooking", targetId: "booking-1", action: "UPDATE", summary: "修改課程預約",
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ module: "MUSIC" }),
    }));
  });

  it("records the server-resolved actor and target", async () => {
    mocks.create.mockResolvedValue({ id: "audit-1" });
    await recordOperationAudit({
      actorUserId: "user-1", actorNameSnapshot: "王店長", storeId: "store-1", module: "STEAM",
      targetType: "Booking", targetId: "booking-1", action: "CANCEL", summary: "取消預約",
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      actorUserId: "user-1", actorNameSnapshot: "王店長", storeId: "store-1", module: "STEAM", targetId: "booking-1",
    }) }));
  });

  it("scopes history to one store and target and bounds the page", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getOperationHistory({ storeId: "store-1", targetType: "Booking", targetId: "booking-1", limit: 999 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", targetType: "Booking", targetId: "booking-1" }, take: 50,
    }));
  });

  it("scopes the center query to one store, date window, and bounded page", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    const dateFrom = new Date("2026-09-22T16:00:00.000Z");
    const dateTo = new Date("2026-09-30T15:59:59.999Z");
    await listOperationAudits({
      storeId: "store-1",
      actorUserId: "user-1",
      module: "COURSE",
      keyword: "更正",
      dateFrom,
      dateTo,
      page: 2,
      pageSize: 999,
    });
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-1",
        actorUserId: "user-1",
        module: "COURSE",
        createdAt: { gte: dateFrom, lte: dateTo },
      }),
    }));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
  });

  it("enforces a store module allowlist on the server", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    await listOperationAudits({
      storeId: "course-store",
      modules: ["COURSE", "SHARED"],
      dateFrom: new Date("2026-09-01T00:00:00.000Z"),
      dateTo: new Date("2026-09-30T23:59:59.999Z"),
    });
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "course-store",
        module: { in: ["COURSE", "SHARED"] },
      }),
    }));
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        storeId: "course-store",
        module: { in: ["COURSE", "SHARED"] },
      }),
    }));
  });

  it("treats system management as explicit and historical null records", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    await listOperationAudits({
      module: "SYSTEM",
      dateFrom: new Date("2026-09-01T00:00:00.000Z"),
      dateTo: new Date("2026-09-30T23:59:59.999Z"),
    });
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ module: null }, { module: "SYSTEM" }] }),
    }));
  });
});
