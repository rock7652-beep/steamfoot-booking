import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => undefined),
  customers: [
    { id: "exhausted", storeId: "store", name: "Expired member", phone: "0911111111", userId: "user1", lineUserId: null,
      user: { id: "user1", status: "ACTIVE" }, planWallets: [{ status: "USED_UP", remainingSessions: 0, expiryDate: new Date("2000-01-01") }], bookings: [] },
    { id: "active", storeId: "store", name: "Current member", phone: "0922222222", userId: "user2", lineUserId: null,
      user: { id: "user2", status: "ACTIVE" }, planWallets: [{ status: "ACTIVE", remainingSessions: 1, expiryDate: new Date("2099-01-01") }], bookings: [{ createdAt: new Date("2026-09-10") }] },
  ],
}));
vi.mock("node:fs/promises", () => ({ writeFile: mocks.writeFile }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    store = { findMany: async () => [{ id: "store", name: "Store", slug: "store" }] };
    customer = { findMany: async (args: { where: { planWallets?: unknown } }) =>
      args.where.planWallets ? mocks.customers.filter((c) => c.planWallets.some((w) => w.status === "ACTIVE" && w.remainingSessions > 0)) : mocks.customers };
    customerIdentityLink = { findMany: async () => mocks.customers.map((c) => ({
      id: `link-${c.id}`, customerId: c.id, storeId: c.storeId, userId: c.userId,
      providerAccountId: `subject-${c.id}`, lineUserId: `subject-${c.id}`,
      createdAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-01"),
    })) };
    account = { findMany: async () => mocks.customers.map((c) => ({ id: `account-${c.id}`, userId: c.userId, providerAccountId: `subject-${c.id}` })) };
    lineRebindRequest = { findMany: async () => [] };
    $disconnect = async () => undefined;
  },
}));

it("audits exhausted members and does not classify missing migration history as a confirmed mismatch", async () => {
  await import("../../scripts/audit-liff-login-migration-candidates");
  await vi.waitFor(() => expect(mocks.writeFile).toHaveBeenCalledOnce());
  const report = JSON.parse((mocks.writeFile.mock.calls[0] as unknown as [string, string])[1]);
  expect(report.summary.allUnmergedCustomersAudited).toBe(2);
  expect(report.summary.activePlanCustomersAudited).toBe(1);
  expect(report.eligible.map((row: { customerId: string }) => row.customerId).sort()).toEqual(["active", "exhausted"]);
  expect(report.eligible.every((row: { identityMismatchConfirmed: boolean; hasMigrationHistory: boolean }) => !row.identityMismatchConfirmed && !row.hasMigrationHistory)).toBe(true);
  expect(report.eligible.find((row: { customerId: string }) => row.customerId === "active").lastSelfBookingAt).toBe("2026-09-10T00:00:00.000Z");
});
