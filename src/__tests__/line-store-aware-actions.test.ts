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
const previewMessengerUtilityTestReminderMock = vi.fn();
const sendMessengerUtilityTestReminderMock = vi.fn();

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
    findFirst: vi.fn(),
    create: vi.fn(async ({ data }) => ({ id: "card-reminder-setting-1", ...data })),
    update: vi.fn(async ({ data }) => ({ id: "card-reminder-setting-1", ...data })),
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

vi.mock("@/lib/store-resolver", () => ({
  resolveStorePresentation: vi.fn(async () => ({
    name: "暖暖蒸足",
    address: "新竹縣竹北市科大一路80號",
    mapUrl: "https://maps.app.goo.gl/b5yPNKj8jt6DfzZo9?g_st=ic",
  })),
}));

vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://example.test",
}));

vi.mock("@/server/services/trial-booking-self-service", () => ({
  createTrialBookingActionToken: () => "signed-test-token",
}));

vi.mock("@/server/services/messenger-utility-reminder", () => ({
  previewMessengerUtilityTestReminder: (...args: unknown[]) => previewMessengerUtilityTestReminderMock(...args),
  sendMessengerUtilityTestReminder: (...args: unknown[]) => sendMessengerUtilityTestReminderMock(...args),
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
    previewMessengerUtilityTestReminderMock.mockResolvedValue({ code: "READY" });
    sendMessengerUtilityTestReminderMock.mockResolvedValue({ code: "SENT", quotaConsumed: true });
    mockPrisma.messageTemplate.findFirst.mockResolvedValue(null);
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
      [expect.objectContaining({
        type: "flex",
        altText: expect.stringContaining("【測試提醒｜不影響正式排程】"),
        contents: expect.objectContaining({
          footer: expect.objectContaining({
            contents: expect.arrayContaining([expect.objectContaining({
              action: {
                type: "uri",
                label: "查看／管理預約",
                uri: "https://example.test/my-bookings",
              },
            })]),
          }),
        }),
      })],
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

  it("single-booking test uses clear trial management buttons without showing the signed URL", async () => {
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
    const message = pushMessageMock.mock.calls.at(-1)?.[2]?.[0] as {
      type: string;
      altText: string;
      contents: {
        body: { contents: Array<{ text?: string }> };
        footer: { contents: Array<{ action: { label: string; uri: string } }> };
      };
    };
    expect(message).toMatchObject({
      type: "flex",
      altText: expect.stringContaining("黃彥陸 的預約提醒"),
    });
    expect(message.contents.body.contents[0]?.text).toBe("黃彥陸 您好");
    expect(message.contents.footer.contents.map((button) => button.action.label)).toEqual([
      "確認會到",
      "需要改期",
      "取消預約",
    ]);
    for (const button of message.contents.footer.contents) {
      expect(button.action.uri).toContain("/trial-booking/manage?token=");
      expect(button.action.uri).not.toContain("/my-bookings");
    }
    expect(message.contents.footer.contents.map((button) => new URL(button.action.uri).searchParams.get("action"))).toEqual([
      "confirm",
      "reschedule",
      "cancel",
    ]);
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
    // The package Flex retry is text-only; keep the central route rejected so
    // the existing verified store-route fallback is exercised.
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

  it("selects LINE only when the original trial chat source is LINE", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    const booking = {
      id: "line-trial-1", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "LINE",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      store: { slug: "zhubei" },
      customer: { id: "customer-1", name: "LINE 顧客", lineUserId: "U_line", lineLinkStatus: "LINKED", assignedStaff: null },
    };
    // preview re-loads its authoritative target; send re-loads it once more.
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValue(null);

    const { previewBookingTestReminder, sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: booking.id })).resolves.toEqual({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_line", expect.any(Array));
  });

  it("allows a package booking to use its verified same-store LINE reminder route", async () => {
    const booking = {
      id: "package-booking-1", storeId: "store-hsinchu", customerId: "customer-package",
      bookingStatus: "CONFIRMED", bookingType: "PACKAGE_SESSION", trialBookingChannel: null,
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      store: { slug: "zhubei" },
      customer: {
        id: "customer-package", name: "方案顧客", lineUserId: "U_package",
        lineLinkStatus: "LINKED", assignedStaff: null,
      },
    };
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValue({
      id: "rule-package",
      templateId: "template-package",
      template: { body: "自訂提醒：{{customerName}} 請於 {{bookingTime}} 準時抵達 {{shopName}}" },
    });
    mockPrisma.messageTemplate.findFirst.mockResolvedValue({
      body: "請穿著輕便服裝，並提前 5 分鐘抵達。",
    });

    const { previewBookingTestReminder, sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: booking.id })).resolves.toEqual({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    expect(pushMessageMock).toHaveBeenCalledWith(
      "store-hsinchu",
      "U_package",
      [expect.objectContaining({
        type: "flex",
        altText: expect.stringContaining("【測試提醒｜不影響正式排程】"),
        contents: expect.objectContaining({
          header: expect.objectContaining({
            backgroundColor: "#F3E7D8",
            contents: expect.arrayContaining([
              expect.objectContaining({ text: "蒸管家｜預約提醒", color: "#4A3527" }),
              expect.objectContaining({
                backgroundColor: "#F8DFAF",
                contents: expect.arrayContaining([
                  expect.objectContaining({
                    text: "測試提醒｜不影響正式排程",
                    color: "#7A4A12",
                  }),
                ]),
              }),
            ]),
          }),
          body: expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({ text: "方案預約" }),
              expect.objectContaining({
                text: "請穿著輕便服裝，並提前 5 分鐘抵達。",
              }),
            ]),
          }),
          footer: expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({
                style: "primary",
                color: "#6C8B73",
                action: expect.objectContaining({
                  label: "開啟 Google Maps 導航",
                  uri: "https://maps.app.goo.gl/b5yPNKj8jt6DfzZo9?g_st=ic",
                }),
              }),
              expect.objectContaining({
                style: "primary",
                color: "#6B4A35",
                action: expect.objectContaining({
                  label: "查看／管理預約",
                  uri: "https://example.test/my-bookings",
                }),
              }),
            ]),
          }),
        }),
      })],
    );
    expect(previewMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("labels a single booking as a single booking in the Flex card", async () => {
    const booking = {
      id: "single-booking-1", storeId: "store-hsinchu", customerId: "customer-single",
      bookingStatus: "CONFIRMED", bookingType: "SINGLE", trialBookingChannel: null,
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "15:30", people: 1,
      store: { slug: "zhubei" },
      customer: {
        id: "customer-single", name: "單次顧客", lineUserId: "U_single",
        lineLinkStatus: "LINKED", assignedStaff: null,
      },
    };
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValue({
      id: "rule-standard",
      templateId: "template-standard",
      template: {
        body: "{{customerName}} 您好！\n\n明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。\n\n如需取消或改期，請點擊：{{bookingLink}}\n\n{{shopName}} 敬上",
      },
    });

    const { sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    const message = pushMessageMock.mock.calls.at(-1)?.[2]?.[0] as {
      type: string;
      contents: { body: { contents: Array<{ text?: string }> } };
    };
    expect(message.type).toBe("flex");
    expect(message.contents.body.contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "單次預約" }),
      expect.objectContaining({ text: "暖暖蒸足" }),
      expect.objectContaining({ text: "45 分鐘" }),
      expect.objectContaining({ text: "新竹縣竹北市科大一路80號" }),
      expect.objectContaining({ text: "請記得準時到店。" }),
    ]));
    expect(message.contents.body.contents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "方案預約" }),
      expect.objectContaining({ text: expect.stringContaining("https://") }),
      expect.objectContaining({ text: expect.stringContaining("單次顧客 您好") }),
    ]));
  });

  it("uses the store card reminder without changing the formal reminder template", async () => {
    const booking = {
      id: "single-booking-custom", storeId: "store-hsinchu", customerId: "customer-single-custom",
      bookingStatus: "CONFIRMED", bookingType: "SINGLE", trialBookingChannel: null,
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "15:30", people: 1,
      store: { slug: "zhubei" },
      customer: {
        id: "customer-single-custom", name: "自訂提醒顧客", lineUserId: "U_single_custom",
        lineLinkStatus: "LINKED", assignedStaff: null,
      },
    };
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValue({
      id: "rule-standard",
      templateId: "template-standard",
      template: {
        body: "{{customerName}} 您好！\n\n明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。\n\n請攜帶毛巾。\n\n如需取消或改期，請點擊：{{bookingLink}}\n\n{{shopName}} 敬上",
      },
    });
    mockPrisma.messageTemplate.findFirst.mockResolvedValue({
      body: "請攜帶毛巾。",
    });

    const { sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    const message = pushMessageMock.mock.calls.at(-1)?.[2]?.[0] as {
      type: string;
      contents: { body: { contents: Array<{ text?: string }> } };
    };
    expect(message.type).toBe("flex");
    expect(message.contents.body.contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "單次預約" }),
      expect.objectContaining({ text: "暖暖蒸足" }),
      expect.objectContaining({ text: "45 分鐘" }),
      expect.objectContaining({ text: "新竹縣竹北市科大一路80號" }),
      expect.objectContaining({ text: "請攜帶毛巾。" }),
    ]));
    expect(message.contents.body.contents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "方案預約" }),
      expect.objectContaining({ text: expect.stringContaining("https://") }),
      expect.objectContaining({ text: expect.stringContaining("自訂提醒顧客 您好") }),
    ]));
  });

  it("selects Messenger Utility only for a valid Messenger source", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    const booking = {
      id: "messenger-trial-1", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "MESSENGER",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 2,
      store: { slug: "zhubei" },
      customer: { id: "customer-1", name: "Messenger 顧客", lineUserId: "U_line", lineLinkStatus: "LINKED", assignedStaff: null },
    };
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);

    const { previewBookingTestReminder, sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: booking.id })).resolves.toEqual({
      success: true, data: { channel: "MESSENGER", channelLabel: "Messenger Utility" },
    });
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "MESSENGER", channelLabel: "Messenger Utility" },
    });
    expect(sendMessengerUtilityTestReminderMock).toHaveBeenCalledWith(expect.objectContaining({
      booking: expect.objectContaining({ id: booking.id, storeId: booking.storeId }),
    }));
    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(pushSteamButlerMessageMock).not.toHaveBeenCalled();
    const logData = mockPrisma.messageLog.create.mock.calls.at(-1)?.[0].data;
    expect(logData).not.toHaveProperty("ruleId");
    expect(logData).not.toHaveProperty("triggerAt");
  });

  it("uses the unique verified same-store LINE binding when the original source is missing", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    const booking = {
      id: "no-source-same-store", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: null,
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      store: { slug: "zhubei" },
      customer: {
        id: "customer-1", name: "同店 LINE 顧客", lineUserId: "U_same_store",
        lineLinkStatus: "LINKED", assignedStaff: null,
      },
    };
    mockPrisma.booking.findFirst.mockResolvedValue(booking);
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    mockPrisma.reminderRule.findFirst.mockResolvedValue(null);

    const { previewBookingTestReminder, sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: booking.id })).resolves.toEqual({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    await expect(sendBookingTestReminder({ bookingId: booking.id })).resolves.toMatchObject({
      success: true, data: { channel: "LINE", channelLabel: "分店 LINE" },
    });
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_same_store", expect.any(Array));
    expect(previewMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("blocks a source-less booking when a LINE binding is only available outside the booking store", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "no-source-cross-store", storeId: "store-hsinchu", customerId: "customer-cross-store",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: null,
      customer: {
        name: "跨店 LINE 顧客", lineUserId: null, lineLinkStatus: "UNLINKED", assignedStaff: null,
      },
      store: { slug: "zhubei" },
    });
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce(null);

    const { previewBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: "no-source-cross-store" })).resolves.toEqual({
      success: false,
      error: "LINE 收件人無法使用（CUSTOMER_NOT_FOUND）",
    });
    expect(resolveCentralLineRecipientForCustomerMock).toHaveBeenCalledWith(
      "customer-cross-store",
      "store-hsinchu",
    );
    expect(previewMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("blocks a source-less booking when verified LINE identities conflict", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "no-source-multiple", storeId: "store-hsinchu", customerId: "customer-multiple",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: null,
      customer: {
        name: "多身分顧客", lineUserId: null, lineLinkStatus: "UNLINKED", assignedStaff: null,
      },
      store: { slug: "zhubei" },
    });
    resolveCentralLineRecipientForCustomerMock.mockResolvedValueOnce({
      status: "CENTRAL_USER_CONFLICT",
      deliverable: false,
      recipientLineUserId: null,
    });

    const { previewBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: "no-source-multiple" })).resolves.toEqual({
      success: false,
      error: "LINE 收件人無法使用（CENTRAL_USER_CONFLICT）",
    });
    expect(previewMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("blocks a source-less booking without a verified LINE binding", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "no-source-no-line", storeId: "store-hsinchu", customerId: "customer-no-line",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: null,
      customer: {
        name: "無 LINE 綁定顧客", lineUserId: null, lineLinkStatus: "UNLINKED", assignedStaff: null,
      },
      store: { slug: "zhubei" },
    });

    const { previewBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: "no-source-no-line" })).resolves.toEqual({
      success: false,
      error: "LINE 收件人無法使用（NO_CENTRAL_LINE）",
    });
    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(pushSteamButlerMessageMock).not.toHaveBeenCalled();
    expect(previewMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("rejects a Messenger identity scoped to another store without falling back to LINE", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "wrong-store", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "MESSENGER",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      customer: { name: "跨店顧客" }, store: { slug: "zhubei" },
    });
    previewMessengerUtilityTestReminderMock.mockResolvedValueOnce({ code: "FAILED_IDENTITY_SCOPE" });
    const { previewBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: "wrong-store" })).resolves.toEqual({
      success: false,
      error: "Messenger 身分與此分店不一致，因此未發送",
    });
    expect(pushMessageMock).not.toHaveBeenCalled();
  });

  it("skips Messenger safely when its encrypted booking identity is unavailable", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "missing-identity", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "MESSENGER",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      customer: { name: "無身分顧客" }, store: { slug: "zhubei" },
    });
    previewMessengerUtilityTestReminderMock.mockResolvedValueOnce({ code: "SKIPPED_MISSING_IDENTITY" });
    const { previewBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(previewBookingTestReminder({ bookingId: "missing-identity" })).resolves.toEqual({
      success: false,
      error: "這筆預約沒有可驗證的 Messenger 身分，因此未發送",
    });
    expect(pushMessageMock).not.toHaveBeenCalled();
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });

  it("reports a Meta rejection as a failed test rather than a success", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "meta-rejected", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "MESSENGER",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      customer: { name: "Meta 拒絕顧客" }, store: { slug: "zhubei" },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValue(null);
    sendMessengerUtilityTestReminderMock.mockResolvedValueOnce({ code: "FAILED_META_REJECTED", quotaConsumed: false });
    const { sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(sendBookingTestReminder({ bookingId: "meta-rejected" })).resolves.toEqual({
      success: false,
      error: "Meta 拒絕此次 Messenger 測試提醒，未標記為成功",
    });
    expect(mockPrisma.messageLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ channel: "MESSENGER", status: "FAILED", errorMessage: "FAILED_META_REJECTED" }),
    });
  });

  it("blocks a repeated Messenger test click before calling Meta again", async () => {
    vi.stubEnv("TRIAL_BOOKING_ACTION_SECRET", "test-secret");
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "repeat-messenger", storeId: "store-hsinchu", customerId: "customer-1",
      bookingStatus: "PENDING", bookingType: "FIRST_TRIAL", trialBookingChannel: "MESSENGER",
      bookingDate: new Date("2026-08-14T00:00:00.000Z"), slotTime: "14:30", people: 1,
      customer: { name: "重複點擊顧客" }, store: { slug: "zhubei" },
    });
    mockPrisma.messageLog.findFirst.mockResolvedValue({ id: "recent-test" });
    const { sendBookingTestReminder } = await import("@/server/actions/reminder");
    await expect(sendBookingTestReminder({ bookingId: "repeat-messenger" })).resolves.toEqual({
      success: false,
      error: "這筆預約剛剛已發送測試提醒，請稍後再試",
    });
    expect(sendMessengerUtilityTestReminderMock).not.toHaveBeenCalled();
  });
});
