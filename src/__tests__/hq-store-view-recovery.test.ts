import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), selected: "deleted-store" }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/permissions", () => ({ isStaffRole: (role: string) => role !== "CUSTOMER" }));
vi.mock("@/server/services/central-member-resolver", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => ({ value: m.selected }) }) }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => { throw new Error("store unavailable"); } }));
import { getCurrentUser, requireHqStoreSwitchActor } from "@/lib/session";
import { auditActorData } from "@/server/services/audit-actor-context";
beforeEach(() => { m.auth.mockResolvedValue({ user: { id: "hq", role: "ADMIN", name: "HQ", storeId: null, staffId: null, customerId: null, storeSlug: null } }); });
it("denies an invalid selected-store request but keeps authenticated HQ return available", async () => {
  await expect(getCurrentUser()).rejects.toThrow("store unavailable");
  const actor = await requireHqStoreSwitchActor();
  expect(actor.role).toBe("ADMIN");
  expect(auditActorData(actor, actor.id)).toMatchObject({ actorRoleSnapshot: "ADMIN" });
});
it("does not grant the recovery path to an ordinary store owner", async () => {
  m.auth.mockResolvedValue({ user: { id: "owner", role: "OWNER", storeId: "a", staffId: "s" } });
  await expect(requireHqStoreSwitchActor()).rejects.toThrow("僅總部");
});
