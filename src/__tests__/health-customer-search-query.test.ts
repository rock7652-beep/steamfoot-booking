import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, count } = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customerHealthRecord: { findMany, count } } }));
import { listNativeHealthRecords } from "@/server/queries/native-health-records";

beforeEach(() => { vi.clearAllMocks(); findMany.mockResolvedValue([]); count.mockResolvedValue(0); });

describe("health customer selection", () => {
  it("filters the selected ID inside the active store and retains date/metric filters", async () => {
    await listNativeHealthRecords("store-a", { customerId: "customer-b", search: "同名顧客", from: "2026-09-01", to: "2026-09-23", metric: "weight" });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ storeId: "store-a", customerId: "customer-b", weight: { not: null },
      measuredAt: { gte: new Date("2026-09-01T00:00:00.000Z"), lte: new Date("2026-09-23T00:00:00.000Z") },
      customer: { mergedIntoCustomerId: null } });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("searches name, phone and LINE name when no customer is selected", async () => {
    await listNativeHealthRecords("store-a", { search: " 黃 " });
    expect(findMany.mock.calls[0][0].where).toEqual({ storeId: "store-a", customer: {
      mergedIntoCustomerId: null, OR: [ { name: { contains: "黃", mode: "insensitive" } },
        { phone: { contains: "黃" } }, { lineName: { contains: "黃", mode: "insensitive" } } ],
    } });
  });

  it("retains the selected customer when paginating and uses the same count scope", async () => {
    await listNativeHealthRecords("store-a", { customerId: "customer-a", page: 2 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 30, take: 30, where: { storeId: "store-a", customerId: "customer-a" } });
    expect(count.mock.calls[0][0].where).toEqual(findMany.mock.calls[0][0].where);
  });
});
