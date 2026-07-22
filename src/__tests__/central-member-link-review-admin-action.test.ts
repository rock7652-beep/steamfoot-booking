import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  actor: vi.fn(),
  store: vi.fn(),
  request: vi.fn(),
  wallets: vi.fn(),
  bookings: vi.fn(),
  link: vi.fn(),
  deleteLink: vi.fn(),
  updateRequest: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requirePermission: h.actor }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.store }));
vi.mock("@/lib/date-utils", () => ({ bookingDateToday: () => new Date("2026-07-21T00:00:00.000Z") }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      centralMemberLinkReviewRequest: { findFirst: h.request, update: h.updateRequest },
      customerPlanWallet: { count: h.wallets },
      booking: { count: h.bookings },
      customerIdentityLink: { findFirst: h.link, delete: h.deleteLink },
      auditLog: { create: h.audit },
    })),
  },
}));

import { reviewCentralMemberLinkAction } from "@/server/actions/central-member-link-review-admin";

function form(decision = "APPROVED", note = "本人提出解除") {
  const data = new FormData();
  data.set("requestId", "request-1");
  data.set("decision", decision);
  data.set("reviewNote", note);
  return data;
}

describe("reviewCentralMemberLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.actor.mockResolvedValue({ id: "admin-1", storeId: null, role: "ADMIN" });
    h.store.mockResolvedValue("store-a");
    h.request.mockResolvedValue({
      id: "request-1",
      status: "PENDING",
      type: "UNLINK_REQUEST",
      customerId: "customer-1",
      identityLinkId: "link-1",
      userId: "user-1",
    });
    h.wallets.mockResolvedValue(0);
    h.bookings.mockResolvedValue(0);
    h.link.mockResolvedValue({ id: "link-1" });
  });

  it("rejects store owners before resolving a store or reading review data", async () => {
    h.actor.mockResolvedValue({ id: "owner-1", storeId: "store-a", role: "OWNER" });

    await expect(reviewCentralMemberLinkAction({ error: null, success: false }, form()))
      .resolves.toEqual({
        error: "會員資料健康檢查僅限總部管理員處理",
        success: false,
      });
    expect(h.store).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });

  it("removes only the exact store-scoped identity link and audits approval", async () => {
    await expect(reviewCentralMemberLinkAction({ error: null, success: false }, form()))
      .resolves.toEqual({ error: null, success: true });
    expect(h.link).toHaveBeenCalledWith({
      where: { id: "link-1", storeId: "store-a", customerId: "customer-1", userId: "user-1" },
      select: { id: true },
    });
    expect(h.deleteLink).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(h.updateRequest).toHaveBeenCalledOnce();
    expect(h.audit).toHaveBeenCalledOnce();
  });

  it("blocks unlink while sessions or future bookings remain", async () => {
    h.wallets.mockResolvedValue(1);
    h.bookings.mockResolvedValue(2);
    const result = await reviewCentralMemberLinkAction({ error: null, success: false }, form());
    expect(result.success).toBe(false);
    expect(result.error).toContain("1 個有效方案");
    expect(result.error).toContain("2 筆未來預約");
    expect(h.deleteLink).not.toHaveBeenCalled();
    expect(h.updateRequest).not.toHaveBeenCalled();
  });

  it("never removes a link when resolving a not-my-membership report", async () => {
    h.request.mockResolvedValue({
      id: "request-1",
      status: "PENDING",
      type: "NOT_MY_MEMBERSHIP",
      customerId: "customer-1",
      identityLinkId: "link-1",
      userId: "user-1",
    });
    const result = await reviewCentralMemberLinkAction({ error: null, success: false }, form());
    expect(result.success).toBe(true);
    expect(h.deleteLink).not.toHaveBeenCalled();
  });

  it("fails closed for forged stores, prior review, missing reason, or changed link", async () => {
    h.request.mockResolvedValue(null);
    expect((await reviewCentralMemberLinkAction({ error: null, success: false }, form())).success).toBe(false);

    h.request.mockResolvedValue({ id: "request-1", status: "REJECTED" });
    expect((await reviewCentralMemberLinkAction({ error: null, success: false }, form())).success).toBe(false);

    expect((await reviewCentralMemberLinkAction({ error: null, success: false }, form("REJECTED", ""))).success).toBe(false);

    h.request.mockResolvedValue({
      id: "request-1", status: "PENDING", type: "UNLINK_REQUEST", customerId: "customer-1", identityLinkId: "link-1", userId: "user-1",
    });
    h.link.mockResolvedValue(null);
    expect((await reviewCentralMemberLinkAction({ error: null, success: false }, form())).success).toBe(false);
    expect(h.deleteLink).not.toHaveBeenCalled();
  });
});
