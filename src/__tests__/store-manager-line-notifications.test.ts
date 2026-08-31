import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMessage, recipientFindMany } = vi.hoisted(() => ({
  pushMessage: vi.fn(),
  recipientFindMany: vi.fn(),
}));

vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://www.steamfoot.com" }));
vi.mock("@/lib/line", () => ({ pushMessage }));
vi.mock("@/lib/db", () => ({
  prisma: { storeLineNotificationRecipient: { findMany: recipientFindMany } },
}));

import {
  buildStoreManagerNotificationMessage,
  notifyStoreManagerOnLine,
  resolveStoreManagerLineRecipient,
} from "@/server/services/store-manager-line-notifications";

describe("store manager LINE notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LINE_MANAGER_USER_ID_ZHUBEI;
    recipientFindMany.mockResolvedValue([]);
  });

  it("resolves one store-scoped manager recipient", () => {
    process.env.LINE_MANAGER_USER_ID_ZHUBEI = " Umanager123 ";
    expect(resolveStoreManagerLineRecipient("zhubei")).toBe("Umanager123");
    expect(resolveStoreManagerLineRecipient("taichung")).toBeNull();
  });

  it("renders a public trial notification with an actionable deep link", () => {
    const messages = buildStoreManagerNotificationMessage({
      type: "PUBLIC_TRIAL_BOOKING_CREATED",
      eventKey: "booking:booking_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      bookingId: "booking_1",
      bookingDate: "2026-07-30",
      slotTime: "14:00",
      people: 2,
      expectedAmount: 998,
    });

    expect(messages).toEqual([{
      type: "text",
      text: expect.stringContaining("🎉 新體驗預約"),
    }]);
    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("應收：NT$998"),
    });
    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("/s/zhubei/admin/dashboard/bookings?bookingId=booking_1"),
    });
  });

  it("renders a lead notification with a direct store-scoped deep link", () => {
    const [message] = buildStoreManagerNotificationMessage({
      type: "DIGITAL_BUTLER_LEAD_CREATED",
      eventKey: "lead:lead_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "蔡小姐",
      phone: "0934487682",
      leadId: "lead_1",
      provider: "LINE",
      requestType: "預約體驗",
      storeName: "暖暖蒸足",
    });

    expect(message).toMatchObject({
      text: expect.stringContaining("/s/zhubei/admin/dashboard/digital-butler/leads?leadId=lead_1"),
    });
  });

  it("skips safely when the manager recipient is not configured", async () => {
    const result = await notifyStoreManagerOnLine({
      type: "DIGITAL_BUTLER_LEAD_CREATED",
      eventKey: "lead:lead_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      leadId: "lead_1",
      provider: "LINE",
      requestType: "預約體驗",
      storeName: "竹北店",
    });

    expect(result).toEqual({ status: "skipped", reason: "recipient_not_configured" });
    expect(pushMessage).not.toHaveBeenCalled();
  });

  it("sends through the booking store LINE channel", async () => {
    process.env.LINE_MANAGER_USER_ID_ZHUBEI = "Umanager123";
    pushMessage.mockResolvedValue({ success: true });

    const result = await notifyStoreManagerOnLine({
      type: "TRANSFER_PENDING_CONFIRMATION",
      eventKey: "payment:payment_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "林小姐",
      paymentId: "payment_1",
      planName: "首次體驗",
      amount: 499,
      lastFourDigits: "1234",
    });

    expect(result).toEqual({ status: "sent", sentCount: 1, failedCount: 0 });
    expect(pushMessage).toHaveBeenCalledWith(
      "store_1",
      "Umanager123",
      [expect.objectContaining({ type: "text", text: expect.stringContaining("💰 等待確認入帳") })],
    );
  });

  it("notifies every active recipient in the same store", async () => {
    recipientFindMany.mockResolvedValue([
      { lineUserId: "Uowner" },
      { lineUserId: "Upartner" },
    ]);
    pushMessage.mockResolvedValue({ success: true });

    const result = await notifyStoreManagerOnLine({
      type: "DIGITAL_BUTLER_LEAD_CREATED",
      eventKey: "lead:lead_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      leadId: "lead_1",
      provider: "LINE",
      requestType: "預約體驗",
      storeName: "竹北店",
    });

    expect(result).toEqual({ status: "sent", sentCount: 2, failedCount: 0 });
    expect(pushMessage).toHaveBeenCalledTimes(2);
    expect(pushMessage).toHaveBeenCalledWith("store_1", "Uowner", expect.any(Array));
    expect(pushMessage).toHaveBeenCalledWith("store_1", "Upartner", expect.any(Array));
  });

  it("returns failed without throwing into the business flow", async () => {
    process.env.LINE_MANAGER_USER_ID_ZHUBEI = "Umanager123";
    pushMessage.mockResolvedValue({ success: false, error: "LINE API 400" });

    const result = await notifyStoreManagerOnLine({
      type: "DIGITAL_BUTLER_LEAD_CREATED",
      eventKey: "lead:lead_1",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      leadId: "lead_1",
      provider: "LINE",
      requestType: "預約體驗",
      storeName: "竹北店",
    });

    expect(result).toEqual({ status: "failed", error: "LINE API 400" });
  });

  it("uses the Messenger source in a Messenger lead notification", () => {
    const messages = buildStoreManagerNotificationMessage({
      type: "DIGITAL_BUTLER_LEAD_CREATED",
      eventKey: "lead:lead_messenger",
      storeId: "store_1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      leadId: "lead_messenger",
      provider: "MESSENGER",
      requestType: "請店家聯絡",
      storeName: "竹北店",
    });

    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("來源：Messenger 數位管家"),
    });
    expect(messages[0]).not.toMatchObject({
      text: expect.stringContaining("來源：LINE 數位管家"),
    });
    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("需求：請店家聯絡"),
    });
    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("店別：竹北店"),
    });
  });

  it("links unresolved human-support notifications directly to the waiting-support list", () => {
    const messages = buildStoreManagerNotificationMessage({
      type: "DAILY_ACTION_DIGEST",
      eventKey: "daily-action-digest:store_1:2026-08-01",
      storeId: "store_1",
      storeSlug: "zhubei",
      pendingPaymentCount: 0,
      incompleteServiceCount: 0,
      waitingSupportCount: 1,
    });

    expect(messages[0]).toMatchObject({
      text: expect.stringContaining("/s/zhubei/admin/dashboard/digital-butler/leads?handoff=waiting"),
    });
  });

  it("includes at most five safe human-support details in the daily digest", () => {
    const details = Array.from({ length: 6 }, (_, index) => ({
      name: `顧客 #${index + 1}`,
      provider: index % 2 ? "MESSENGER" : "LINE",
      lastMessageAt: new Date("2026-08-02T15:05:00.000Z"),
    }));
    const [message] = buildStoreManagerNotificationMessage({
      type: "DAILY_ACTION_DIGEST", eventKey: "digest", storeId: "store_1", storeSlug: "zhubei",
      pendingPaymentCount: 0, incompleteServiceCount: 0, waitingSupportCount: 6, waitingSupportDetails: details,
    });
    expect(message).toMatchObject({ type: "text", text: expect.stringContaining("顧客 #1") });
    const text = (message as { type: "text"; text: string }).text;
    expect(text).not.toContain("顧客 #6");
    expect(text).toContain("想找真人客服");
    expect(text).not.toContain("U123");
  });
});
