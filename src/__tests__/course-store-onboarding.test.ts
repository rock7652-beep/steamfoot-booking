import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://isolated.example.test" }));
const m = vi.hoisted(() => ({ storeFind: vi.fn(), storeCreate: vi.fn(), userFind: vi.fn(), userCreate: vi.fn(), permissions: vi.fn(), hours: vi.fn(), slots: vi.fn(), transaction: vi.fn(), trial: vi.fn(), admin: vi.fn(), legacyPermissions: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: m.storeFind, create: m.storeCreate }, user: { findUnique: m.userFind, create: m.userCreate },
  staffPermission: { createMany: m.permissions }, businessHours: { createMany: m.hours }, bookingSlot: { createMany: m.slots }, $transaction: m.transaction,
} }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/session", () => ({ requireAdminSession: m.admin }));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn(), createDefaultPermissions: m.legacyPermissions, ALL_PERMISSIONS: ["staff.manage", "booking.create", "hq.view"] }));
vi.mock("@/server/services/single-store-trial", () => ({ openSingleStoreTrialInTransaction: m.trial }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createStoreAction } from "@/server/actions/store-onboarding";
import { prisma } from "@/lib/db";
const input = { name: "隔離新課程", slug: "new-course-test", plan: "ALLIANCE" as const, isDemo: false, industryModule: "COURSE" as const, owner: { name: "店長", email: "owner@example.test", password: "test-only-123" } };
beforeEach(() => {
  vi.clearAllMocks(); m.admin.mockResolvedValue({ id: "admin", role: "ADMIN" });
  m.storeFind.mockResolvedValue(null); m.userFind.mockResolvedValue(null);
  m.storeCreate.mockImplementation(async ({ data }) => ({ ...data, currentSubscriptionId: null }));
  m.userCreate.mockResolvedValue({ staff: { id: "owner-staff" } });
  m.transaction.mockImplementation(async fn => fn(prisma)); m.trial.mockResolvedValue({ id: "trial" });
});
it("prepares the course store without starting its trial without legacy booking slots or headquarters permissions", async () => {
  const result = await createStoreAction(input);
  expect(result).toMatchObject({ success: true, data: { store: { industryModule: "COURSE", plan: "EXPERIENCE", currentSubscriptionId: null }, canActivate: true } });
  expect(m.transaction).toHaveBeenCalledTimes(1);
  expect(m.storeCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ moduleInstallation: { create: expect.objectContaining({ module: "COURSE", status: "ACTIVE", provisionedAt: expect.any(Date) }) } }) }));
  expect(m.trial).not.toHaveBeenCalled();
  expect(m.hours.mock.calls[0][0].data).toHaveLength(7); expect(m.slots).not.toHaveBeenCalled();
  expect(m.permissions.mock.calls[0][0].data).toContainEqual({ staffId: "owner-staff", permission: "hq.view", granted: false });
  expect(m.legacyPermissions).not.toHaveBeenCalled();
});
it("refuses legacy initial coach accounts before creating anything", async () => {
  expect(await createStoreAction({ ...input, initialStaff: [{ name: "教練", email: "coach@example.test", role: "STAFF" }] })).toMatchObject({ success: false });
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.storeCreate).not.toHaveBeenCalled();
});
it("returns failure when course provisioning transaction fails", async () => {
  m.transaction.mockRejectedValueOnce(new Error("provisioning failed"));
  expect(await createStoreAction(input)).toMatchObject({ success: false });
  expect(m.transaction).toHaveBeenCalledTimes(1);
});
it("does not enter any creation path without HQ authorization", async () => {
  m.admin.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(createStoreAction(input)).rejects.toThrow("FORBIDDEN");
  expect(m.storeFind).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
});
it.each(["STEAMFOOT", "SPA"] as const)("preserves the existing %s onboarding and provisioning path", async (industryModule) => {
  const result = await createStoreAction({ ...input, industryModule });
  expect(result).toMatchObject({ success: true, data: { store: { industryModule, plan: "ALLIANCE" } } });
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.trial).not.toHaveBeenCalled();
  expect(m.legacyPermissions).toHaveBeenCalledWith("owner-staff", "OWNER");
  expect(m.permissions).not.toHaveBeenCalled();
  if (industryModule === "STEAMFOOT") {
    expect(m.slots.mock.calls[0][0].data).toHaveLength(56);
    expect(m.hours.mock.calls[0][0].data).toHaveLength(7);
  } else {
    expect(m.slots).not.toHaveBeenCalled();
    expect(m.hours).not.toHaveBeenCalled();
    expect(m.storeCreate.mock.calls[0][0].data.moduleInstallation.create.status).toBe("PROVISIONING");
  }
});
