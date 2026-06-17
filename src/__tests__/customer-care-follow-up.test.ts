import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTrialFollowUpList = vi.fn();
const mockGetStoreFilter = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockCustomerFollowUpFindMany = vi.fn();

vi.mock("@/server/queries/trial-follow-up", () => ({
  getTrialFollowUpList: (...args: unknown[]) => mockGetTrialFollowUpList(...args),
}));

vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (...args: unknown[]) => mockGetStoreFilter(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
    },
    booking: {
      groupBy: (...args: unknown[]) => mockBookingGroupBy(...args),
    },
    customerFollowUp: {
      findMany: (...args: unknown[]) => mockCustomerFollowUpFindMany(...args),
    },
  },
}));

import { getCustomerCareOverview } from "@/server/queries/customer-care";

const USER = { role: "OWNER", storeId: "store-a", staffId: "staff-a" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-17T10:00:00+08:00"));
  mockGetStoreFilter.mockReturnValue({ storeId: "store-a" });
  mockGetTrialFollowUpList.mockResolvedValue([
    {
      customerId: "trial-customer",
      customerName: "體驗客",
      customerPhone: "0912345678",
      customerStage: "TRIAL",
      trialBookingDate: null,
      trialPaidAt: new Date("2026-06-15T10:00:00+08:00"),
      trialCreatedAt: new Date("2026-06-15T10:00:00+08:00"),
      trialAmount: 499,
      trialPaymentMethod: "CASH",
      assignedStaffId: null,
      assignedStaffName: null,
      assignedStaffColor: null,
    },
  ]);
  mockCustomerFindMany.mockResolvedValue([
    {
      id: "package-customer",
      name: "方案客",
      phone: "0987654321",
      assignedStaffId: null,
      assignedStaff: null,
      planWallets: [{ remainingSessions: 1, expiryDate: null }],
    },
  ]);
  mockBookingGroupBy.mockResolvedValue([]);
  mockCustomerFollowUpFindMany.mockResolvedValue([
    {
      customerId: "trial-customer",
      result: "CONTACTED",
      note: null,
      createdAt: new Date("2026-06-16T10:00:00+08:00"),
      createdBy: { name: "芊芊店長" },
    },
    {
      customerId: "package-customer",
      result: "BOOKED",
      note: "已約週五",
      createdAt: new Date("2026-06-17T09:00:00+08:00"),
      createdBy: { name: "合作店長" },
    },
  ]);
});

describe("getCustomerCareOverview follow-up summaries", () => {
  it("attaches latest follow-up without changing reminder classification counts", async () => {
    const overview = await getCustomerCareOverview(USER, null);

    expect(overview.summary).toEqual({
      trialFollowUps: 1,
      inactiveCustomers: 0,
      lowSessionCustomers: 1,
      expiringPlanCustomers: 0,
    });
    expect(overview.trialFollowUps[0].lastFollowUp).toMatchObject({
      result: "CONTACTED",
      createdByName: "芊芊店長",
    });
    expect(overview.lowSessionCustomers[0].lastFollowUp).toMatchObject({
      result: "BOOKED",
      note: "已約週五",
      createdByName: "合作店長",
    });
  });

  it("queries follow-ups only for customers present in care sections", async () => {
    await getCustomerCareOverview(USER, null);

    expect(mockCustomerFollowUpFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-a",
          customerId: { in: ["trial-customer", "package-customer"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});
