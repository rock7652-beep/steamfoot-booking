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
      text: expect.stringContaining("/dashboard/bookings?bookingId=booking_1"),
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
    });

    expect(result).toEqual({ status: "failed", error: "LINE API 400" });
  });
});
