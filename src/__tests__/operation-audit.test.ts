import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: mocks } }));

import { getOperationHistory, recordOperationAudit } from "@/server/services/operation-audit";

describe("shared operation audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the server-resolved actor and target", async () => {
    mocks.create.mockResolvedValue({ id: "audit-1" });
    await recordOperationAudit({
      actorUserId: "user-1", storeId: "store-1", module: "STEAM",
      targetType: "Booking", targetId: "booking-1", action: "CANCEL", summary: "取消預約",
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      actorUserId: "user-1", storeId: "store-1", module: "STEAM", targetId: "booking-1",
    }) }));
  });

  it("scopes history to one store and target and bounds the page", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getOperationHistory({ storeId: "store-1", targetType: "Booking", targetId: "booking-1", limit: 999 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", targetType: "Booking", targetId: "booking-1" }, take: 50,
    }));
  });
});
