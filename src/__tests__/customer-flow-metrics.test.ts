import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCustomerFlowMetrics,
  compareCustomerFlow,
  getCustomerFlowMetrics,
  selectCustomerFlowCustomerIds,
} from "@/server/queries/customer-flow-metrics";

const mockFindMany = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

const booking = (
  customerId: string,
  date: string,
  bookingType: "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION" = "SINGLE",
) => ({ customerId, bookingDate: new Date(`${date}T00:00:00.000Z`), bookingType });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildCustomerFlowMetrics", () => {
  it("deduplicates visitors and classifies new, returning, and completed trial customers", () => {
    const bookings = [
      booking("new", "2026-07-02", "FIRST_TRIAL"),
      booking("new", "2026-07-20", "FIRST_TRIAL"),
      booking("returning", "2026-07-10"),
      booking("previous-only", "2026-06-10"),
      booking("last-year", "2025-07-10"),
    ];
    const firstCompleted = new Map([
      ["new", new Date("2026-07-02T00:00:00.000Z")],
      ["returning", new Date("2026-05-01T00:00:00.000Z")],
      ["previous-only", new Date("2026-06-10T00:00:00.000Z")],
      ["last-year", new Date("2025-07-10T00:00:00.000Z")],
    ]);

    const result = buildCustomerFlowMetrics("2026-07", bookings, firstCompleted);
    const selection = selectCustomerFlowCustomerIds("2026-07", bookings, firstCompleted);

    expect(result.uniqueVisitors.current).toBe(2);
    expect(result.newVisitors.current).toBe(1);
    expect(result.returningVisitors.current).toBe(1);
    expect(result.trialCustomers.current).toBe(1);
    expect(result.uniqueVisitors.current).toBe(selection.uniqueVisitorIds.size);
    expect(result.newVisitors.current).toBe(selection.newVisitorIds.size);
    expect(result.returningVisitors.current).toBe(selection.returningVisitorIds.size);
    expect(result.trialCustomers.current).toBe(selection.trialCustomerIds.size);
    expect(result.uniqueVisitors.mom).toEqual({ difference: 1, percentage: 100 });
    expect(result.uniqueVisitors.yoy).toEqual({ difference: 1, percentage: 100 });
  });

  it("uses calendar month arithmetic across a year boundary", () => {
    const bookings = [
      booking("current", "2026-01-05"),
      booking("previous", "2025-12-05"),
      booking("last-year", "2025-01-05"),
    ];
    const firstCompleted = new Map(
      bookings.map((row) => [row.customerId, row.bookingDate] as const),
    );

    const result = buildCustomerFlowMetrics("2026-01", bookings, firstCompleted);

    expect(result.uniqueVisitors.current).toBe(1);
    expect(result.uniqueVisitors.mom.difference).toBe(0);
    expect(result.uniqueVisitors.yoy.difference).toBe(0);
  });

  it("returns an explicit non-comparable percentage for a zero baseline", () => {
    expect(compareCustomerFlow(3, 0)).toEqual({ difference: 3, percentage: null });
  });
});

describe("getCustomerFlowMetrics", () => {
  it("queries only COMPLETED bookings for the active store and ignores people fields", async () => {
    mockFindMany.mockResolvedValue([
      booking("customer-1", "2026-07-03", "FIRST_TRIAL"),
    ]);
    mockGroupBy.mockResolvedValue([
      {
        customerId: "customer-1",
        _min: { bookingDate: new Date("2026-07-03T00:00:00.000Z") },
      },
    ]);

    const result = await getCustomerFlowMetrics("store-active", "2026-07");

    expect(result.trialCustomers.current).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-active",
          bookingStatus: "COMPLETED",
        }),
        select: { customerId: true, bookingDate: true, bookingType: true },
      }),
    );
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-active",
          bookingStatus: "COMPLETED",
        }),
      }),
    );
  });

  it("does not run a history query when every comparison period is empty", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getCustomerFlowMetrics("store-viewed", "2026-07");

    expect(result.uniqueVisitors.current).toBe(0);
    expect(mockGroupBy).not.toHaveBeenCalled();
    expect(mockFindMany.mock.calls[0][0].where.storeId).toBe("store-viewed");
  });
});
