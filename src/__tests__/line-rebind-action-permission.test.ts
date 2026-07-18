import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(), findUnique: vi.fn(), assertStoreAccess: vi.fn(),
  create: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findUnique: h.findUnique }, lineRebindRequest: { findUnique: h.findUnique } } }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: h.assertStoreAccess }));
vi.mock("@/server/services/line-rebind", () => ({ createLineRebindRequest: h.create, cancelLineRebindRequest: h.cancel }));

import { cancelLineRebindCaptureRequest, createLineRebindCaptureRequest } from "@/server/actions/line-rebind";

describe("LINE rebind actions require OWNER or ADMIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findUnique.mockResolvedValue({ id: "cmqwagvm10001l904qqvxry7y", storeId: "store-a", phone: "0912345678" });
    h.create.mockResolvedValue({ status: "created", requestId: "request-a", expiresAt: new Date() });
    h.cancel.mockResolvedValue(true);
  });
  it("allows an OWNER with the dedicated permission", async () => {
    h.requirePermission.mockResolvedValue({ id: "owner-a", role: "OWNER" });
    await expect(createLineRebindCaptureRequest({ customerId: "cmqwagvm10001l904qqvxry7y", reason: "approved by the customer and store owner" })).resolves.toMatchObject({ success: true });
  });
  it("allows an ADMIN with the dedicated permission", async () => {
    h.requirePermission.mockResolvedValue({ id: "admin-a", role: "ADMIN" });
    await expect(createLineRebindCaptureRequest({ customerId: "cmqwagvm10001l904qqvxry7y", reason: "approved by the customer and headquarters" })).resolves.toMatchObject({ success: true });
  });
  it.each(["PARTNER", "MANAGER", "STAFF"])("rejects %s even if permission was granted", async (role) => {
    h.requirePermission.mockResolvedValue({ id: "actor-a", role });
    await expect(createLineRebindCaptureRequest({ customerId: "cmqwagvm10001l904qqvxry7y", reason: "approved by the customer and store owner" })).resolves.toMatchObject({ success: false });
    await expect(cancelLineRebindCaptureRequest("request-a")).resolves.toMatchObject({ success: false });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
  it.each(["OWNER", "ADMIN"])("rejects %s when the dedicated permission is missing", async () => {
    h.requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(createLineRebindCaptureRequest({ customerId: "cmqwagvm10001l904qqvxry7y", reason: "approved by the customer and store owner" })).resolves.toMatchObject({ success: false });
  });
});
