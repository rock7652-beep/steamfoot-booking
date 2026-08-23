import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireStoreFeature: vi.fn(),
  customerFindFirst: vi.fn(),
  storeFindUnique: vi.fn(),
  storeUpdate: vi.fn(),
  bookingFindFirst: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteUpsert: vi.fn(),
  inviteCreate: vi.fn(),
  inviteUpdateMany: vi.fn(),
  inviteUpdate: vi.fn(),
  messageLogCreate: vi.fn(),
  transaction: vi.fn(),
  resolveCentralRecipient: vi.fn(),
  resolveRoute: vi.fn(),
  pushMessage: vi.fn(),
  pushSteamButlerMessage: vi.fn(),
  resolveWriteStoreId: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: h.resolveWriteStoreId }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: h.requireStoreFeature }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://example.com" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/line", () => ({
  pushMessage: h.pushMessage,
  pushSteamButlerMessage: h.pushSteamButlerMessage,
}));
vi.mock("@/server/services/central-line-recipient-loader", () => ({
  resolveCentralLineRecipientForCustomer: h.resolveCentralRecipient,
}));
vi.mock("@/server/services/verified-reminder-line-route", () => ({
  resolveVerifiedReminderLineRoute: h.resolveRoute,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: h.customerFindFirst },
    store: { findUnique: h.storeFindUnique, update: h.storeUpdate },
    booking: { findFirst: h.bookingFindFirst },
    googleReviewInvite: {
      findFirst: h.inviteFindFirst,
      upsert: h.inviteUpsert,
      create: h.inviteCreate,
      updateMany: h.inviteUpdateMany,
      update: h.inviteUpdate,
    },
    messageLog: { create: h.messageLogCreate },
    $transaction: h.transaction,
  },
}));

describe("Google review core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ storeId: "store-1", staffId: "staff-1" });
    h.resolveWriteStoreId.mockResolvedValue("store-1");
    h.requireStoreFeature.mockResolvedValue(undefined);
    h.customerFindFirst.mockResolvedValue({ id: "customer-1" });
    h.storeFindUnique.mockResolvedValue({
      id: "store-1",
      slug: "zhubei",
      name: "暖暖蒸足",
      googleReviewUrl: "https://g.page/r/example/review",
      shopConfig: { shopName: "暖暖蒸足" },
    });
    h.bookingFindFirst.mockResolvedValue({ id: "booking-1" });
    h.inviteFindFirst.mockResolvedValue({ id: "invite-1" });
    h.inviteUpsert.mockResolvedValue({
      id: "invite-1",
      token: "token-1",
      invitedAt: new Date("2026-07-16T01:00:00Z"),
    });
    h.inviteUpdateMany.mockResolvedValue({ count: 1 });
    h.resolveCentralRecipient.mockResolvedValue({ deliverable: true });
    h.resolveRoute.mockResolvedValue({
      status: "READY",
      channel: "STORE",
      recipientLineUserId: "U-store",
    });
    h.pushMessage.mockResolvedValue({ success: true });
    h.inviteUpdate.mockReturnValue({ operation: "invite-update" });
    h.messageLogCreate.mockReturnValue({ operation: "message-log-create" });
    h.transaction.mockResolvedValue([]);
  });

  it("建立帶不可猜 token 的店別中繼連結", async () => {
    const { createGoogleReviewInvite } = await import("@/server/actions/google-review");
    const result = await createGoogleReviewInvite({
      customerId: "customer-1",
      bookingId: "booking-1",
      source: "BOOKING",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.trackingUrl).toBe(
      "https://example.com/s/zhubei/google-review?i=token-1",
    );
    expect(result.data.message).toContain(result.data.trackingUrl);
    expect(h.bookingFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-1",
        customerId: "customer-1",
        bookingStatus: "COMPLETED",
      }),
    }));
    expect(h.inviteUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookingId: "booking-1" },
      update: {},
    }));
  });

  it("不允許未完成或不屬於該店的預約", async () => {
    h.bookingFindFirst.mockResolvedValue(null);
    const { createGoogleReviewInvite } = await import("@/server/actions/google-review");
    const result = await createGoogleReviewInvite({
      customerId: "customer-1",
      bookingId: "booking-other-store",
      source: "BOOKING",
    });
    expect(result).toEqual({ success: false, error: "只能邀請該店已完成預約的顧客" });
    expect(h.inviteUpsert).not.toHaveBeenCalled();
  });

  it("禁止將店別設定成非 Google 的開放轉址", async () => {
    const { updateGoogleReviewUrl } = await import("@/server/actions/google-review");
    const result = await updateGoogleReviewUrl("https://evil.example/review");
    expect(result).toEqual({ success: false, error: "僅允許 HTTPS Google 評論網址" });
    expect(h.storeUpdate).not.toHaveBeenCalled();
  });

  it("禁止 Google 網域內的任意外部轉址路徑", async () => {
    const { updateGoogleReviewUrl } = await import("@/server/actions/google-review");
    const result = await updateGoogleReviewUrl(
      "https://www.google.com/url?q=https://evil.example",
    );
    expect(result).toEqual({ success: false, error: "僅允許 HTTPS Google 評論網址" });
    expect(h.storeUpdate).not.toHaveBeenCalled();
  });

  it("同一筆已成功邀請的預約不會重複傳送 LINE", async () => {
    const sentAt = new Date("2026-08-19T07:00:00Z");
    h.bookingFindFirst.mockResolvedValue({
      id: "booking-1",
      customerId: "customer-1",
      storeId: "store-1",
      customer: { name: "王小美", lineUserId: "U-store", lineLinkStatus: "LINKED" },
      store: {
        slug: "zhubei",
        name: "暖暖蒸足",
        googleReviewUrl: "https://g.page/r/example/review",
        shopConfig: { shopName: "暖暖蒸足竹北店" },
      },
      googleReviewInvite: {
        id: "invite-1",
        token: "token-1",
        sentAt,
        deliveryStatus: "SENT",
      },
    });
    const { sendGoogleReviewInvite } = await import("@/server/actions/google-review");
    const result = await sendGoogleReviewInvite("booking-1");

    expect(result).toEqual({ success: true, data: { alreadySent: true, sentAt } });
    expect(h.pushMessage).not.toHaveBeenCalled();
    expect(h.inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("完成服務後以正確店別 LINE 傳送一次評論按鈕", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "booking-1",
      customerId: "customer-1",
      storeId: "store-1",
      customer: { name: "王小美", lineUserId: "U-store", lineLinkStatus: "LINKED" },
      store: {
        slug: "zhubei",
        name: "暖暖蒸足",
        googleReviewUrl: "https://g.page/r/example/review",
        shopConfig: { shopName: "暖暖蒸足竹北店" },
      },
      googleReviewInvite: null,
    });
    h.inviteCreate.mockResolvedValue({
      id: "invite-1",
      token: "token-1",
      sentAt: null,
      deliveryStatus: "READY",
    });
    const { sendGoogleReviewInvite } = await import("@/server/actions/google-review");
    const result = await sendGoogleReviewInvite("booking-1");

    expect(result.success).toBe(true);
    expect(h.pushMessage).toHaveBeenCalledWith(
      "store-1",
      "U-store",
      [expect.objectContaining({ type: "flex" })],
    );
    expect(h.inviteUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "invite-1", sentAt: null }),
      data: expect.objectContaining({ deliveryStatus: "SENDING" }),
    }));
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it("合法 token 只寫入首次點擊時間並轉址", async () => {
    const { GET } = await import("@/app/s/[slug]/google-review/route");
    const response = await GET(
      new Request("https://example.com/s/zhubei/google-review?i=token-1"),
      { params: Promise.resolve({ slug: "zhubei" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://g.page/r/example/review");
    expect(h.inviteFindFirst).toHaveBeenCalledWith({
      where: { token: "token-1", storeId: "store-1" },
      select: { id: true },
    });
    expect(h.inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", clickedAt: null },
      data: { clickedAt: expect.any(Date) },
    });
  });

  it("第二次點擊仍轉址，但 update 條件不會覆寫首次 clickedAt", async () => {
    h.inviteUpdateMany.mockResolvedValue({ count: 0 });
    const { GET } = await import("@/app/s/[slug]/google-review/route");
    const response = await GET(
      new Request("https://example.com/s/zhubei/google-review?i=token-1"),
      { params: Promise.resolve({ slug: "zhubei" }) },
    );

    expect(response.status).toBe(307);
    expect(h.inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", clickedAt: null },
      data: { clickedAt: expect.any(Date) },
    });
  });

  it("無效或跨店 token 只回傳通用 404，不轉址也不寫入", async () => {
    h.inviteFindFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/s/[slug]/google-review/route");
    const response = await GET(
      new Request("https://example.com/s/zhubei/google-review?i=foreign-token"),
      { params: Promise.resolve({ slug: "zhubei" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("找不到該連結");
    expect(h.inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("缺少 token 時回傳通用 404，不查詢邀請", async () => {
    const { GET } = await import("@/app/s/[slug]/google-review/route");
    const response = await GET(
      new Request("https://example.com/s/zhubei/google-review"),
      { params: Promise.resolve({ slug: "zhubei" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("找不到該連結");
    expect(h.inviteFindFirst).not.toHaveBeenCalled();
  });

  it("店別 googleReviewUrl 非法時回傳通用 404", async () => {
    h.storeFindUnique.mockResolvedValue({
      id: "store-1",
      googleReviewUrl: "https://evil.example/review",
    });
    const { GET } = await import("@/app/s/[slug]/google-review/route");
    const response = await GET(
      new Request("https://example.com/s/zhubei/google-review?i=token-1"),
      { params: Promise.resolve({ slug: "zhubei" }) },
    );

    expect(response.status).toBe(404);
    expect(h.inviteFindFirst).not.toHaveBeenCalled();
  });
});
