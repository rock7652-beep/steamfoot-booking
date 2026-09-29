import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: vi.fn(), user: vi.fn(), existing: vi.fn(), token: vi.fn(),
  deleteMany: vi.fn(), create: vi.fn(), update: vi.fn(), mail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: mocks.store }, user: { findFirst: mocks.user, update: mocks.update },
  verificationToken: { findFirst: mocks.existing, findUnique: mocks.token, deleteMany: mocks.deleteMany, create: mocks.create },
  $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
    verificationToken: { deleteMany: mocks.deleteMany, create: mocks.create },
    user: { update: mocks.update },
  }),
} }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: true, sendBackofficePasswordResetEmail: mocks.mail }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: () => false }));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.store.mockResolvedValue({ id: "store-a", name: "A 店", slug: "course" });
  mocks.user.mockResolvedValue({ id: "owner-a", email: "owner@example.com" });
  mocks.existing.mockResolvedValue(null);
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
  mocks.mail.mockResolvedValue(undefined);
});

describe("backoffice password recovery", () => {
  it("returns the same response for unknown and known accounts; sends only for an active staff member of that store", async () => {
    const { requestBackofficePasswordReset } = await import("@/server/actions/backoffice-password-reset");
    mocks.user.mockResolvedValueOnce(null);
    expect(await requestBackofficePasswordReset("unknown@example.com", "course")).toEqual({ success: true });
    expect(mocks.mail).not.toHaveBeenCalled();
    expect(await requestBackofficePasswordReset("OWNER@EXAMPLE.COM", "course")).toEqual({ success: true });
    expect(mocks.user).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      status: "ACTIVE", staff: { storeId: "store-a", status: "ACTIVE" },
    }) }));
    expect(mocks.mail).toHaveBeenCalledOnce();
    expect(mocks.mail).toHaveBeenCalledWith("owner@example.com", expect.stringMatching(/^[a-f0-9]{64}$/), "A 店", "course");
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      identifier: "backoffice-reset:store-a:owner-a", token: expect.stringMatching(/^[a-f0-9]{64}$/),
    }) });
    expect(mocks.create.mock.calls[0][0].data.token).not.toBe(mocks.mail.mock.calls[0][1]);
  });

  it("consumes the token once and changes only its store's active staff password", async () => {
    const { completeBackofficePasswordReset } = await import("@/server/actions/backoffice-password-reset");
    mocks.token.mockResolvedValue({ identifier: "backoffice-reset:store-a:owner-a", expires: new Date(Date.now() + 60000) });
    const token = "a".repeat(64);
    expect(await completeBackofficePasswordReset(token, "course", "StrongerPass123")).toEqual({ success: true });
    expect(mocks.user).toHaveBeenCalledWith({ where: expect.objectContaining({
      id: "owner-a", staff: { storeId: "store-a", status: "ACTIVE", store: { slug: "course" } },
    }), select: { id: true } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ identifier: "backoffice-reset:store-a:owner-a" }) });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "owner-a" }, data: { passwordHash: expect.stringMatching(/^\$2/) } });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    expect((await completeBackofficePasswordReset(token, "course", "StrongerPass123")).success).toBe(false);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("rejects weak passwords and expired links before changing credentials", async () => {
    const { completeBackofficePasswordReset } = await import("@/server/actions/backoffice-password-reset");
    expect((await completeBackofficePasswordReset("a".repeat(64), "course", "short")).success).toBe(false);
    mocks.token.mockResolvedValue({ identifier: "backoffice-reset:store-a:owner-a", expires: new Date(Date.now() - 1000) });
    expect((await completeBackofficePasswordReset("a".repeat(64), "course", "StrongerPass123")).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
