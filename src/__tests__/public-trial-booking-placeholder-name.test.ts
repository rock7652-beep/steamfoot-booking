import { beforeEach, describe, expect, it, vi } from "vitest";

const STORE_ID = "store-zhubei";
const LINE_USER_ID = "U-line-customer";
const CUSTOMER_ID = "customer-gaoqiao";
const BOOKING_ID = "booking-gaoqiao";

const state = vi.hoisted(() => ({
  customerName: "顧客",
  customerPhone: "0911689313",
  customerStoreId: "store-zhubei",
  customerLineUserId: "U-line-customer",
  customerLineLinkStatus: "LINKED",
  customerUpdateMany: vi.fn(),
  customerFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingAggregate: vi.fn(),
  bookingCreate: vi.fn(),
  trialLinkUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: vi.fn(async () => ({ id: STORE_ID, slug: "zhubei" })) },
    customer: {
      findFirst: state.customerFindFirst,
      create: vi.fn(),
      updateMany: state.customerUpdateMany,
    },
    booking: { findFirst: state.bookingFindFirst },
    shopConfig: { findUnique: vi.fn(async () => ({ bookingWindowDays: 14, bookingOpensAt: null, bookableUntilDate: null })) },
    $transaction: vi.fn(async (callback) => callback({
      customer: { updateMany: state.customerUpdateMany },
      booking: { aggregate: state.bookingAggregate, create: state.bookingCreate },
      trialBookingLink: { updateMany: state.trialLinkUpdateMany },
    })),
  },
}));
vi.mock("@/lib/date-utils", () => ({ getNowTaipeiHHmm: () => "09:00", toLocalDateStr: () => "2026-08-13" }));
vi.mock("@/lib/business-hours-resolver", () => ({
  applySlotOverrides: (rule: { slots: Array<{ startTime: string; capacity: number; isEnabled: boolean }> }) => rule.slots,
  loadDayBusinessHoursContext: vi.fn(async () => ({
    dateObj: new Date("2026-08-19T00:00:00.000Z"),
    rule: { closed: false, slots: [{ startTime: "10:00", capacity: 2, isEnabled: true }] },
    slotOverrides: [],
  })),
  enumerateMonthDates: vi.fn(),
  loadMonthBusinessHoursContext: vi.fn(),
}));
vi.mock("@/lib/shop-config", () => ({
  checkBookingLimit: vi.fn(async () => ({ allowed: true })),
  checkCustomerLimit: vi.fn(async () => ({ allowed: true })),
  getTrialSettings: vi.fn(async () => ({ trialEnabled: true, trialDefaultPrice: 499 })),
  isDutySchedulingEnabled: vi.fn(async () => false),
  isCustomerSlotWithinBookingWindow: vi.fn(() => true),
}));
vi.mock("@/lib/subscription-guard", () => ({ isStoreSubscriptionWriteBlocked: vi.fn(async () => false) }));
vi.mock("@/lib/store-operating-status", () => ({ isStoreBookable: vi.fn(async () => true) }));
vi.mock("@/server/services/public-trial-manager-notification", () => ({ notifyManagerOfPublicTrialBooking: vi.fn(async () => undefined) }));
vi.mock("@/server/services/trial-plan", () => ({ ensureTrialPlan: vi.fn(async () => ({ id: "trial-plan" })) }));
vi.mock("@/server/services/trial-booking-chat-link", () => ({
  resolveTrialBookingChatLink: vi.fn(async () => ({
    linkId: "trial-link",
    storeId: STORE_ID,
    channel: "LINE",
    chatIdentity: LINE_USER_ID,
  })),
}));
vi.mock("@/server/services/public-trial-line-customer", () => ({
  resolvePublicTrialLineCustomer: vi.fn(async () => ({
    status: "matched",
    customer: customer(),
  })),
}));

import { submitPublicTrialBooking } from "@/server/actions/public-trial-booking";

function customer() {
  return {
    id: CUSTOMER_ID,
    name: state.customerName,
    assignedStaffId: null,
    lineUserId: state.customerLineUserId,
    lineLinkStatus: state.customerLineLinkStatus,
  };
}

const input = {
  name: "高巧",
  phone: "0911689313",
  bookingDate: "2026-08-19",
  slotTime: "10:00",
  people: 1,
  entry: "valid-line-entry",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.customerName = "顧客";
  state.customerPhone = "0911689313";
  state.customerStoreId = STORE_ID;
  state.customerLineUserId = LINE_USER_ID;
  state.customerLineLinkStatus = "LINKED";
  state.customerFindFirst.mockImplementation(async () => customer());
  state.customerUpdateMany.mockImplementation(async ({ where, data }) => {
    if (
      where.id === CUSTOMER_ID &&
      where.storeId === STORE_ID &&
      (where.lineUserId === LINE_USER_ID || where.phone === state.customerPhone) &&
      where.name.in.includes(state.customerName)
    ) {
      state.customerName = data.name;
      return { count: 1 };
    }
    return { count: 0 };
  });
  state.bookingFindFirst.mockResolvedValue(null);
  state.bookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  state.bookingCreate.mockResolvedValue({ id: BOOKING_ID });
  state.trialLinkUpdateMany.mockResolvedValue({ count: 1 });
});

describe("submitPublicTrialBooking — LINE placeholder customer name", () => {
  it("replaces a same-store LINE placeholder with 高巧 and preserves the booking identity fields", async () => {
    const result = await submitPublicTrialBooking(input);

    expect(result).toMatchObject({
      status: "ok",
      bookingId: BOOKING_ID,
      bookingDate: "2026-08-19",
      slotTime: "10:00",
      people: 1,
      expectedAmount: 499,
    });
    expect(state.customerName).toBe("高巧");
    expect(state.customerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_ID,
        storeId: STORE_ID,
        lineUserId: LINE_USER_ID,
        mergedIntoCustomerId: null,
        name: { in: ["顧客", "LINE 用戶", "Google 用戶", "未命名"] },
      },
      data: { name: "高巧" },
    });
    expect(state.customerPhone).toBe("0911689313");
    expect(state.customerStoreId).toBe(STORE_ID);
    expect(state.customerLineUserId).toBe(LINE_USER_ID);
    expect(state.bookingCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerId: CUSTOMER_ID, people: 1, expectedAmount: 499 }),
    }));
  });

  it("never overwrites a formal existing name", async () => {
    state.customerName = "既有正式姓名";

    const result = await submitPublicTrialBooking(input);

    expect(result.status).toBe("ok");
    expect(state.customerName).toBe("既有正式姓名");
    expect(state.customerUpdateMany).not.toHaveBeenCalled();
  });

  it("replaces a same-store phone placeholder for a plain public booking", async () => {
    const { resolveTrialBookingChatLink } = await import("@/server/services/trial-booking-chat-link");
    vi.mocked(resolveTrialBookingChatLink).mockResolvedValueOnce(null);

    const result = await submitPublicTrialBooking({ ...input, entry: undefined });

    expect(result.status).toBe("ok");
    expect(state.customerName).toBe("高巧");
    expect(state.customerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_ID,
        storeId: STORE_ID,
        phone: "0911689313",
        mergedIntoCustomerId: null,
        name: { in: ["顧客", "LINE 用戶", "Google 用戶", "未命名"] },
      },
      data: { name: "高巧" },
    });
  });

  it.each(["顧客", "LINE 用戶", "Google 用戶", "未命名"])(
    "rejects the system placeholder name %s before any customer or booking write",
    async (name) => {
      const result = await submitPublicTrialBooking({ ...input, name });

      expect(result).toEqual({ status: "invalid_input", message: "請輸入您的真實姓名" });
      expect(state.customerUpdateMany).not.toHaveBeenCalled();
      expect(state.bookingCreate).not.toHaveBeenCalled();
    },
  );

  it("never overwrites a formal name on a plain public phone match", async () => {
    const { resolveTrialBookingChatLink } = await import("@/server/services/trial-booking-chat-link");
    vi.mocked(resolveTrialBookingChatLink).mockResolvedValueOnce(null);
    state.customerName = "既有正式姓名";

    const result = await submitPublicTrialBooking({ ...input, entry: undefined });

    expect(result.status).toBe("ok");
    expect(state.customerName).toBe("既有正式姓名");
    expect(state.customerUpdateMany).not.toHaveBeenCalled();
  });

  it("does not rename a plain public phone placeholder when the slot became full", async () => {
    const { resolveTrialBookingChatLink } = await import("@/server/services/trial-booking-chat-link");
    vi.mocked(resolveTrialBookingChatLink).mockResolvedValueOnce(null);
    state.bookingAggregate.mockResolvedValueOnce({ _sum: { people: 2 } });

    const result = await submitPublicTrialBooking({ ...input, entry: undefined });

    expect(result.status).toBe("slot_full");
    expect(state.customerName).toBe("顧客");
    expect(state.customerUpdateMany).not.toHaveBeenCalled();
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });
});
