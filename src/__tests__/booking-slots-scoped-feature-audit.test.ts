/** Real session, permission, feature, store, slots-action and API composition.
 * Only authentication, request context, cache plumbing and bottom-level DB I/O
 * are synthetic. Nothing opens a database client or performs a network read. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(), storeUnique: vi.fn(), storeMany: vi.fn(), entitlement: vi.fn(),
  special: vi.fn(), hours: vi.fn(), overrides: vi.fn(),
  selected: undefined as string | undefined,
  targetStatus: "ENABLED" as "ENABLED" | "HIDDEN" | "LOCKED" | "DISABLED",
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
// Pure cache shim: no Next request runtime or shared cache is installed here.
vi.mock("next/cache", () => ({ unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-next-pathname": "/api/bookings/slots" }),
  cookies: async () => ({ get: (key: string) => key === "active-store-id" && m.selected ? { value: m.selected } : undefined }),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: m.storeUnique, findMany: m.storeMany },
  storeFeatureEntitlement: { findUnique: m.entitlement },
  specialBusinessDay: { findFirst: m.special },
  businessHours: { findFirst: m.hours },
  slotOverride: { findMany: m.overrides },
} }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
import { requirePermission } from "@/lib/permissions";
import { fetchDaySlots } from "@/server/actions/slots";
import { GET } from "@/app/api/bookings/slots/route";
const target = "synthetic-feature-target";
const other = "synthetic-cookie-other";
const stores = [target, other].map(id => ({ id, slug: id, name: id, isDefault: false, operatingStatus: "ACTIVE", plan: "BASIC", planStatus: "ACTIVE", planEffectiveAt: null, planExpiresAt: null }));
beforeEach(() => {
  vi.clearAllMocks(); m.selected = undefined; m.targetStatus = "ENABLED";
  m.auth.mockResolvedValue({ user: { id: "synthetic-admin", role: "ADMIN", storeId: null, staffId: null, customerId: null, storeSlug: null } });
  m.storeUnique.mockImplementation(async ({ where }: { where: { id?: string; slug?: string } }) => stores.find(row => where.id ? row.id === where.id : row.slug === where.slug) ?? null);
  m.storeMany.mockResolvedValue(stores);
  m.entitlement.mockImplementation(async ({ where }: { where: { uq_store_feature_entitlement: { storeId: string; featureKey: string } } }) => ({
    status: where.uq_store_feature_entitlement.storeId === target ? m.targetStatus : "ENABLED", startsAt: null, expiresAt: null,
  }));
  m.special.mockResolvedValue({ id: "synthetic-closure", date: new Date("2026-09-24T00:00:00Z"), type: "closed", reason: null });
  m.hours.mockResolvedValue(null); m.overrides.mockResolvedValue([]);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
function slotsRequest() { return new Request(`https://synthetic.example/api/bookings/slots?date=2026-09-24&storeId=${target}`); }
function expectTargetFeatureRead() {
  expect(m.entitlement).toHaveBeenCalledWith(expect.objectContaining({ where: { uq_store_feature_entitlement: { storeId: target, featureKey: "basic_booking" } } }));
  expect(m.entitlement.mock.calls.every(([input]) => input.where.uq_store_feature_entitlement.storeId === target)).toBe(true);
}
it.each(["HIDDEN", "LOCKED", "DISABLED"] as const)("rejects the target's %s booking feature with no active cookie through real guards", async status => {
  m.targetStatus = status;
  await expect(requirePermission("booking.read", undefined, { storeId: target })).rejects.toMatchObject({ code: "FORBIDDEN" });
  m.entitlement.mockClear();
  await expect(fetchDaySlots("2026-09-24", target)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expectTargetFeatureRead();
  m.entitlement.mockClear();
  const response = await GET(slotsRequest());
  expect(response.status).toBe(403);
  expectTargetFeatureRead();
  expect(m.special).not.toHaveBeenCalled(); expect(m.hours).not.toHaveBeenCalled(); expect(m.overrides).not.toHaveBeenCalled();
});
it("allows the enabled explicit target with no active cookie using the real permission and feature checks", async () => {
  expect((await GET(slotsRequest())).status).toBe(200);
  expectTargetFeatureRead();
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: target, date: new Date("2026-09-24T00:00:00Z") } });
});
it("keeps real-session HQ cookie scope confined rather than overriding it with a query store", async () => {
  m.selected = other;
  expect((await GET(slotsRequest())).status).toBe(403);
  expect(m.special).not.toHaveBeenCalled();
});
it("allows a matching real-session HQ store-view cookie and still checks that target feature", async () => {
  m.selected = target;
  expect((await GET(slotsRequest())).status).toBe(200);
  expectTargetFeatureRead();
});
