import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectCustomerFlowCustomerIds } from "@/server/queries/customer-flow-metrics";
import { selectConversionCustomerIds } from "@/server/queries/conversion-metrics";
import { selectRetentionCustomerIds } from "@/server/queries/retention-metrics";
import { hydrateCustomerSegment } from "@/server/queries/customer-segment-list";

const mockCustomerFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findMany: (...args: unknown[]) => mockCustomerFindMany(...args) },
  },
}));

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomerFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({
      id,
      name: id,
      phone: null,
      assignedStaff: null,
      followUps: [],
    })),
  );
});

describe("KPI customer selection and CRM list alignment", () => {
  it("hydrates every customer-flow set without changing its count or store", async () => {
    const bookings = [
      { customerId: "new", bookingDate: date("2026-07-02"), bookingType: "FIRST_TRIAL" as const },
      { customerId: "returning", bookingDate: date("2026-07-03"), bookingType: "SINGLE" as const },
    ];
    const firstCompleted = new Map([
      ["new", date("2026-07-02")],
      ["returning", date("2026-06-02")],
    ]);
    const selection = selectCustomerFlowCustomerIds("2026-07", bookings, firstCompleted);

    for (const ids of [
      selection.uniqueVisitorIds,
      selection.newVisitorIds,
      selection.returningVisitorIds,
      selection.trialCustomerIds,
    ]) {
      expect(await hydrateCustomerSegment("store-viewed", ids)).toHaveLength(ids.size);
    }
    expect(mockCustomerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-viewed" }) }),
    );
  });

  it("hydrates converted and unconverted sets without changing their counts", async () => {
    const selection = selectConversionCustomerIds(
      "2026-07",
      [
        { customerId: "converted", bookingDate: date("2026-07-03") },
        { customerId: "unconverted", bookingDate: date("2026-07-03") },
      ],
      [{
        customerId: "converted",
        transactionDate: new Date("2026-07-03T03:00:00.000Z"),
        customerPlanWallet: { status: "ACTIVE" },
      }],
    );

    expect(await hydrateCustomerSegment("store-1", selection.convertedCustomerIds)).toHaveLength(
      selection.convertedCustomerIds.size,
    );
    expect(await hydrateCustomerSegment("store-1", selection.unconvertedCustomerIds)).toHaveLength(
      selection.unconvertedCustomerIds.size,
    );
  });

  it("hydrates returned and unreturned sets without changing their counts", async () => {
    const selection = selectRetentionCustomerIds("2026-07", [
      { customerId: "returned", bookingDate: date("2026-06-03") },
      { customerId: "returned", bookingDate: date("2026-07-03") },
      { customerId: "unreturned", bookingDate: date("2026-06-04") },
    ]);

    expect(await hydrateCustomerSegment("store-1", selection.returnedCustomerIds)).toHaveLength(
      selection.returnedCustomerIds.size,
    );
    expect(await hydrateCustomerSegment("store-1", selection.unreturnedCustomerIds)).toHaveLength(
      selection.unreturnedCustomerIds.size,
    );
  });
});
