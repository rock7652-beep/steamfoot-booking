import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: vi.fn(),
  links: vi.fn(),
  pending: vi.fn(),
  createRequest: vi.fn(),
  createAudit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: h.session }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      customerIdentityLink: { findMany: h.links },
      centralMemberLinkReviewRequest: { findFirst: h.pending, create: h.createRequest },
      auditLog: { create: h.createAudit },
    })),
  },
}));

import { requestCentralMemberLinkReviewAction } from "@/server/actions/central-member-link-review";

function form(storeId = "store-a", type = "UNLINK_REQUEST") {
  const data = new FormData();
  data.set("storeId", storeId);
  data.set("type", type);
  return data;
}

describe("requestCentralMemberLinkReviewAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.session.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    h.links.mockResolvedValue([{ id: "link-1", customerId: "customer-1" }]);
    h.pending.mockResolvedValue(null);
    h.createRequest.mockResolvedValue({ id: "request-1" });
  });

  it("creates an auditable pending request without mutating the identity link", async () => {
    await expect(requestCentralMemberLinkReviewAction({ error: null, success: false }, form()))
      .resolves.toEqual({ error: null, success: true });
    expect(h.links).toHaveBeenCalledWith({
      where: { userId: "user-1", storeId: "store-a" },
      select: { id: true, customerId: true },
    });
    expect(h.createRequest).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        storeId: "store-a",
        customerId: "customer-1",
        identityLinkId: "link-1",
        type: "UNLINK_REQUEST",
      },
    });
    expect(h.createAudit).toHaveBeenCalledOnce();
  });

  it("fails closed for a forged or ambiguous store membership", async () => {
    h.links.mockResolvedValue([]);
    const result = await requestCentralMemberLinkReviewAction({ error: null, success: false }, form("foreign"));
    expect(result.success).toBe(false);
    expect(h.createRequest).not.toHaveBeenCalled();

    h.links.mockResolvedValue([
      { id: "link-1", customerId: "customer-1" },
      { id: "link-2", customerId: "customer-2" },
    ]);
    const ambiguous = await requestCentralMemberLinkReviewAction({ error: null, success: false }, form());
    expect(ambiguous.success).toBe(false);
    expect(h.createRequest).not.toHaveBeenCalled();
  });

  it("deduplicates an existing pending request and rejects unknown request types", async () => {
    h.pending.mockResolvedValue({ id: "existing" });
    await expect(requestCentralMemberLinkReviewAction({ error: null, success: false }, form()))
      .resolves.toEqual({ error: null, success: true });
    expect(h.createRequest).not.toHaveBeenCalled();

    const invalid = await requestCentralMemberLinkReviewAction({ error: null, success: false }, form("store-a", "DELETE_NOW"));
    expect(invalid.success).toBe(false);
  });
});
