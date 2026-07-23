import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findMany },
  },
}));

import { listCentralBindingStatuses } from "@/server/queries/central-binding-status";

describe("listCentralBindingStatuses", () => {
  beforeEach(() => findMany.mockReset());

  it("keeps the query store-scoped and excludes merged source customers", async () => {
    findMany.mockResolvedValue([]);

    await listCentralBindingStatuses("store-a");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-a", mergedIntoCustomerId: null },
    }));
  });

  it("does not confuse a central login with a verified store membership", async () => {
    findMany.mockResolvedValue([
      {
        id: "customer-1",
        name: "測試顧客",
        phone: "0900000000",
        userId: "user-1",
        identityLinks: [],
        user: { accounts: [{ id: "line-account" }] },
      },
    ]);

    await expect(listCentralBindingStatuses("store-a")).resolves.toEqual([
      expect.objectContaining({ id: "customer-1", status: "NEEDS_MEMBER_LINK" }),
    ]);
  });

  it("uses the verified link owner to determine central LINE readiness", async () => {
    findMany.mockResolvedValue([
      {
        id: "customer-2",
        name: "測試顧客二",
        phone: "0911111111",
        userId: null,
        identityLinks: [{
          userId: "central-user",
          user: { accounts: [{ id: "line-account" }] },
        }],
        user: null,
      },
    ]);

    await expect(listCentralBindingStatuses("store-a")).resolves.toEqual([
      expect.objectContaining({ id: "customer-2", status: "COMPLETE" }),
    ]);
  });
});
