import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBirthdayCustomersForMonth", () => {
  it("returns only same-store customers born in the requested month and sorts by day", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "late",
        name: "晚生日",
        phone: "0911000002",
        birthday: new Date("1970-07-25T00:00:00.000Z"),
        assignedStaff: null,
        followUps: [],
      },
      {
        id: "other-month",
        name: "其他月份",
        phone: "0911000003",
        birthday: new Date("1970-08-01T00:00:00.000Z"),
        assignedStaff: null,
        followUps: [],
      },
      {
        id: "early",
        name: "早生日",
        phone: "0911000001",
        birthday: new Date("1980-07-03T00:00:00.000Z"),
        assignedStaff: { displayName: "店長" },
        followUps: [
          {
            createdAt: new Date("2026-07-01T00:00:00.000Z"),
            createdBy: { name: "店長" },
          },
        ],
      },
    ]);

    const rows = await getBirthdayCustomersForMonth("store-1", "2026-07");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1" }) }),
    );
    expect(rows.map((row) => row.customerId)).toEqual(["early", "late"]);
    expect(rows[0].lastFollowUp?.createdByName).toBe("店長");
  });

  it("rejects an invalid month without querying", async () => {
    await expect(getBirthdayCustomersForMonth("store-1", "2026-13")).resolves.toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
