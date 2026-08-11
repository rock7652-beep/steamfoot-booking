import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMessageMock = vi.fn(
  async (
    _storeId: string,
    _lineUserId: string,
    _messages: unknown[],
  ): Promise<{ success: boolean; error?: string }> => {
    void _storeId;
    void _lineUserId;
    void _messages;
    return { success: true };
  },
);
const pushSteamButlerMessageMock = vi.fn(
  async (
    _lineUserId: string,
    _messages: unknown[],
  ): Promise<{
    success: boolean;
    error?: string;
    httpStatus?: number;
    errorType?: "line_api_rejected";
  }> => {
    void _lineUserId;
    void _messages;
    return { success: true };
  },
);
const revalidatePathMock = vi.fn();
const resolveCentralLineRecipientForCustomerMock = vi.fn();

const mockPrisma = {
  customer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  store: {
    findUnique: vi.fn(),
  },
  messageTemplate: {
    findUnique: vi.fn(),
  },
  messageLog: {
    findFirst: vi.fn(),
    create: vi.fn(async ({ data }) => ({ id: "message-log-1", ...data })),
  },
  booking: {
    findFirst: vi.fn(),
  },
  reminderRule: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(async ({ data }) => ({ id: "audit-log-1", ...data })),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
    Promise.all(operations),
  ),
};

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/server/services/central-line-recipient-loader", () => ({
  resolveCentralLineRecipientForCustomer: (...args: unknown[]) =>
    resolveCentralLineRecipientForCustomerMock(...args),
}));

vi.mock("@/lib/line", async () => {
  const actual = await vi.importActual<typeof import("@/lib/line")>("@/lib/line");
  return {
    ...actual,
    pushMessage: (storeId: string, lineUserId: string, messages: unknown[]) =>
      pushMessageMock(storeId, lineUserId, messages),
    pushSteamButlerMessage: (lineUserId: string, messages: unknown[]) =>
      pushSteamButlerMessageMock(lineUserId, messages),
    probeStoreLineRecipient: vi.fn(async () => ({ status: "COMPATIBLE" })),
  };
});

vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => ({
    id: "staff-user-1",
    role: "OWNER",
    storeId: "store-hsinchu",
  })),
  requireAdminSession: vi.fn(async () => ({
    id: "admin-user-1",
    role: "ADMIN",
    storeId: "store-hsinchu",
  })),
}));

vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: vi.fn(async () => undefined),
  requireStoreFeature: vi.fn(async () => undefined),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => ({
    id: "admin-user-1",
    role: "ADMIN",
    storeId: "store-hsinchu",
  })),
}));

vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: vi.fn(async () => "store-hsinchu"),
}));

vi.mock("@/lib/shop-config", () => ({
  getShopConfig: vi.fn(async () => ({ shopName: "以斯帖蒸足坊" })),
}));

vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://example.test",
}));

describe("LINE sending actions are store-aware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMessageMock.mockResolvedValue({ success: true });
    pushSteamButlerMessageMock.mockResolvedValue({ success: true });
    resolveCentralLineRecipientForCustomerMock.mockResolvedValue({
      status: "NO_CENTRAL_LINE",
      deliverable: false,
      recipientLineUserId: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("testSendLineMessage passes the customer's storeId to pushMessage", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "customer-1",
      name: "Alice",
      storeId: "store-hsinchu",
      lineUserId: "U_hsinchu_customer",
      assignedStaff: { displayName: "Coach" },
    });
    mockPrisma.messageTemplate.findUnique.mockResolvedValueOnce({
      id: "template-1",
      storeId: "store-hsinchu",
      body: "hello {{customerName}}",
    });

    const { testSendLineMessage } = await import("@/server/actions/reminder");
    const result = await testSendLineMessage("customer-1", "template-1");

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_hsinchu_customer", [
      { type: "text", text: expect.any(String) },
    ]);
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-hsinchu",
          status: "SENT",
        }),
      }),
    );
  });

  it("sendOpsLineMessage passes the customer's storeId to pushMessage", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "customer-2",
      name: "Betty",
      storeId: "store-taichung",
      lineUserId: "U_taichung_customer",
      lineLinkStatus: "LINKED",
    });

    const { sendOpsLineMessage } = await import("@/server/actions/ops-line");
    const result = await sendOpsLineMessage("customer-2", "hello");

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-taichung", "U_taichung_customer", [
      { type: "text", text: "hello" },
    ]);
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-taichung",
          status: "SENT",
        }),
      }),
    );
  });

  it("sendLineSmokeTest sends fixed store test copy and writes MessageLog", async () => {
    vi.stubEnv("LINE_SMOKE_TEST_ENABLED", "1");
    mockPrisma.store.findUnique.mockResolvedValueOnce({ name: "以斯帖蒸足坊" });
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      id: "customer-3",
      lineUserId: "U_hsinchu_customer",
    });

    const { sendLineSmokeTest } = await import("@/server/actions/reminder");
    const result = await sendLineSmokeTest({ customerId: "customer-3" });

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_hsinchu_customer", [
      { type: "text", text: "這是 以斯帖蒸足坊 LINE 系統通知測試" },
    ]);
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "customer-3",
          storeId: "store-hsinchu",
          channel: "LINE",
          status: "SENT",
          renderedBody: "這是 以斯帖蒸足坊 LINE 系統通知測試",
        }),
      }),
    );
  });

  it("sendLineSmokeTest logs FAILED when pushMessage fails", async () => {
    vi.stubEnv("LINE_SMOKE_TEST_ENABLED", "1");
    pushMessageMock.mockResolvedValueOnce({
      success: false,
      error: "LINE token not configured for store",
    });
    mockPrisma.store.findUnique.mockResolvedValueOnce({ name: "以斯帖蒸足坊" });
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      id: "customer-4",
      lineUserId: "U_hsinchu_customer",
    });

    const { sendLineSmokeTest } = await import("@/server/actions/reminder");
    const result = await sendLineSmokeTest({ customerId: "customer-4" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("LINE token not configured for store");
    }
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "customer-4",
          storeId: "store-hsinchu",
          status: "FAILED",
          errorMessage: "LINE token not configured for store",
        }),
      }),
    );
  });

  it("sendLineSmokeTest keeps a usable store route when the central recipient is blocked", async () => {
    vi.stubEnv("LINE_SMOKE_TEST_ENABLED", "1");
    mockPrisma.store.findUnique.mockResolvedValueOnce({ name: "以斯帖蒸足坊" });
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      id: "customer-5",
      lineUserId: "U_hsinchu_customer",
    });
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce({
      status: "LEGACY_LINE_CONFLICT",
      deliverable: false,
      recipientLineUserId: null,
    });

    const { sendLineSmokeTest } = await import("@/server/actions/reminder");
    const result = await sendLineSmokeTest({ customerId: "customer-5" });

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_hsinchu_customer", [
      { type: "text", text: "這是 以斯帖蒸足坊 LINE 系統通知測試" },
    ]);
    expect(pushSteamButlerMessageMock).not.toHaveBeenCalled();
    expect(mockPrisma.messageLog.create).toHaveBeenCalled();
  });

  it("sendLineSmokeTest uses the central Channel for a central-only customer", async () => {
    vi.stubEnv("LINE_SMOKE_TEST_ENABLED", "1");
    mockPrisma.store.findUnique.mockResolvedValueOnce({ name: "暖暖蒸足" });
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      id: "customer-central-only",
      lineUserId: null,
    });
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce({
      status: "READY",
      deliverable: true,
      recipientLineUserId: "U_central_customer",
    });

    const { sendLineSmokeTest } = await import("@/server/actions/reminder");
    const result = await sendLineSmokeTest({ customerId: "customer-central-only" });

    expect(result.success).toBe(true);
    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(pushSteamButlerMessageMock).toHaveBeenCalledWith("U_central_customer", [
      { type: "text", text: "這是 暖暖蒸足 LINE 系統通知測試" },
    ]);
  });

  it("single-booking test uses the booking store route and does not consume the scheduled reminder key", async () => {
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce({
      status: "READY",
      deliverable: true,
      recipientLineUserId: "U_central_customer",
    });
    mockPrisma.booking.findFirst.mockResolvedValueOnce({
      id: "booking-1",
      storeId: "store-hsinchu",
      customerId: "customer-1",
      bookingStatus: "CONFIRMED",
      bookingType: "PACKAGE_SESSION",
      trialBookingChannel: null,
      bookingDate: new Date("2026-07-24T00:00:00.000Z"),
      slotTime: "16:30",
      customer: {
        id: "customer-1",
        name: "黃彥陸",
        lineUserId: "U_store_customer",
        lineLinkStatus: "LINKED",
        assignedStaff: { displayName: "店長" },
      },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValueOnce(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValueOnce({
      id: "rule-1",
      templateId: null,
      template: null,
    });

    const { sendBookingLineTestReminder } = await import("@/server/actions/reminder");
    const result = await sendBookingLineTestReminder({ bookingId: "booking-1" });

    expect(result).toEqual({
      success: true,
      data: { messageLogId: "message-log-1", lineRoute: "STORE" },
    });
    expect(pushMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "U_store_customer",
      [{ type: "text", text: expect.stringContaining("【測試提醒｜不影響正式排程】") }],
    );
    expect(pushSteamButlerMessageMock).not.toHaveBeenCalled();
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: "booking-1",
        lineRoute: "STORE",
        status: "SENT",
        // No ruleId / triggerAt: the 18:00 cron can still send the real reminder.
      }),
    });
    const logData = mockPrisma.messageLog.create.mock.calls.at(-1)?.[0].data;
    expect(logData).not.toHaveProperty("ruleId");
    expect(logData).not.toHaveProperty("triggerAt");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-user-1",
        targetType: "Booking",
        targetId: "booking-1",
        action: "SEND_LINE_TEST_REMINDER",
      }),
    });
  });

  it("single-booking test renders a first-trial self-service link for an older channel-null booking", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    mockPrisma.booking.findFirst.mockResolvedValueOnce({
      id: "trial-booking-1",
      storeId: "store-hsinchu",
      customerId: "customer-1",
      bookingStatus: "PENDING",
      bookingType: "FIRST_TRIAL",
      trialBookingChannel: null,
      bookingDate: new Date("2026-08-12T00:00:00.000Z"),
      slotTime: "14:00",
      customer: {
        id: "customer-1",
        name: "黃彥陸",
        lineUserId: "U_store_customer",
        lineLinkStatus: "LINKED",
        assignedStaff: null,
      },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValueOnce(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValueOnce(null);

    const { sendBookingLineTestReminder } = await import("@/server/actions/reminder");
    const result = await sendBookingLineTestReminder({ bookingId: "trial-booking-1" });

    expect(result.success).toBe(true);
    const message = pushMessageMock.mock.calls.at(-1)?.[2]?.[0] as { text: string };
    expect(message.text).toContain("體驗預約提醒");
    expect(message.text).toContain("/trial-booking/manage?token=");
    expect(message.text).not.toContain("/my-bookings");
  });

  it("single-booking test falls back to an active store route after a definite central 400 rejection", async () => {
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce({
      status: "READY",
      deliverable: true,
      recipientLineUserId: "U_central_customer",
    });
    mockPrisma.booking.findFirst.mockResolvedValueOnce({
      id: "booking-central-400",
      storeId: "store-hsinchu",
      customerId: "customer-1",
      bookingStatus: "CONFIRMED",
      bookingDate: new Date("2026-07-24T00:00:00.000Z"),
      slotTime: "16:30",
      customer: {
        id: "customer-1",
        name: "黃彥陸",
        lineUserId: "U_store_customer",
        lineLinkStatus: "LINKED",
        assignedStaff: null,
      },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValueOnce(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValueOnce(null);
    pushSteamButlerMessageMock.mockResolvedValueOnce({
      success: false,
      error: 'LINE API 400: {"message":"Failed to send messages"}',
      httpStatus: 400,
      errorType: "line_api_rejected",
    });

    const { sendBookingLineTestReminder } = await import("@/server/actions/reminder");
    const result = await sendBookingLineTestReminder({ bookingId: "booking-central-400" });

    expect(result).toEqual({
      success: true,
      data: { messageLogId: "message-log-1", lineRoute: "STORE" },
    });
    expect(pushMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "U_store_customer",
      [{ type: "text", text: expect.stringContaining("【測試提醒｜不影響正式排程】") }],
    );
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineRoute: "STORE", status: "SENT" }),
    });
  });

  it("single-booking test does not use a stale store LINE id when the customer is blocked", async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce({
      id: "booking-blocked",
      storeId: "store-hsinchu",
      customerId: "customer-blocked",
      bookingStatus: "CONFIRMED",
      bookingDate: new Date("2026-07-24T00:00:00.000Z"),
      slotTime: "16:30",
      customer: {
        id: "customer-blocked",
        name: "封鎖顧客",
        lineUserId: "U_stale_store_customer",
        lineLinkStatus: "BLOCKED",
        assignedStaff: null,
      },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValueOnce(null);

    const { sendBookingLineTestReminder } = await import("@/server/actions/reminder");
    const result = await sendBookingLineTestReminder({ bookingId: "booking-blocked" });

    expect(result).toEqual({
      success: false,
      error: "LINE 收件人無法使用（NO_CENTRAL_LINE）",
    });
    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(pushSteamButlerMessageMock).not.toHaveBeenCalled();
  });
});
