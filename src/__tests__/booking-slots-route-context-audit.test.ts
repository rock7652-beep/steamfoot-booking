/** Fully synthetic regression characterization. No database clients or network
 * calls: real proxy -> route headers -> store resolver -> slots action -> GET. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
const m = vi.hoisted(() => ({
  session: vi.fn(), permission: vi.fn(), storeUnique: vi.fn(), storeMany: vi.fn(),
  special: vi.fn(), hours: vi.fn(), overrides: vi.fn(),
  headers: new Headers(), cookies: new Map<string, string>(),
  actor: { id: "synthetic-admin", role: "ADMIN", storeId: null as string | null, staffId: null as string | null },
}));
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/permissions", () => ({
  requirePermission: m.permission,
  isStaffRole: (role: string) => ["ADMIN", "OWNER", "MANAGER", "STAFF", "PARTNER"].includes(role),
}));
vi.mock("next/headers", () => ({
  headers: async () => m.headers,
  cookies: async () => ({ get: (name: string) => m.cookies.has(name) ? { value: m.cookies.get(name) } : undefined }),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: m.storeUnique, findMany: m.storeMany },
  specialBusinessDay: { findFirst: m.special },
  businessHours: { findFirst: m.hours },
  slotOverride: { findMany: m.overrides },
} }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
import { proxy } from "@/proxy";
import { getActiveStoreForRead } from "@/lib/store";
import { fetchDaySlots } from "@/server/actions/slots";
import { GET } from "@/app/api/bookings/slots/route";
import { readBookingSlots } from "@/lib/booking-client-transport";

const pagePath = "/s/staging/admin/dashboard/bookings";
const slotsPath = "/api/bookings/slots?date=2026-09-24";
const admin = { id: "synthetic-admin", role: "ADMIN", storeId: null, staffId: null };
const stores = [
  { id: "staging-store", slug: "staging", name: "Synthetic staging", isDefault: false, operatingStatus: "ACTIVE" },
  { id: "synthetic-other-store", slug: "synthetic-other", name: "Synthetic other", isDefault: false, operatingStatus: "ACTIVE" },
  { id: "synthetic-disabled-store", slug: "synthetic-disabled", name: "Synthetic disabled", isDefault: false, operatingStatus: "INACTIVE" },
];
beforeEach(() => {
  vi.clearAllMocks(); m.headers = new Headers(); m.cookies.clear();
  m.actor = { ...admin };
  m.session.mockResolvedValue(m.actor); m.permission.mockResolvedValue(m.actor);
  m.storeUnique.mockImplementation(async ({ where }: { where: { slug?: string; id?: string } }) => stores.find(row => where.slug ? row.slug === where.slug : row.id === where.id) ?? null);
  m.storeMany.mockImplementation(async ({ where }: { where: { id?: string | { in: string[] }; operatingStatus?: { in: string[] } } }) => stores.filter(row =>
    (!where.id || (typeof where.id === "string" ? row.id === where.id : where.id.in.includes(row.id))) &&
    (!where.operatingStatus || where.operatingStatus.in.includes(row.operatingStatus))));
  // Explicit synthetic closure: real business-hours resolution returns an empty
  // slot list after proving which store was selected, with no further readers.
  m.special.mockResolvedValue({ id: "synthetic-closure", date: new Date("2026-09-24T00:00:00Z"), type: "closed", reason: null });
  m.hours.mockResolvedValue(null); m.overrides.mockResolvedValue([]);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const response = applyProxyHeaders(url, init?.headers);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    return GET(new Request(`https://synthetic.example${url}`));
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Apply the actual NextResponse request-header override contract in memory. */
function applyProxyHeaders(path: string, suppliedHeaders?: HeadersInit) {
  const headers = new Headers(suppliedHeaders);
  if (m.cookies.size) headers.set("cookie", [...m.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
  const request = new NextRequest(`https://synthetic.example${path}`, { headers });
  Object.assign(request, { auth: { user: m.actor } });
  const response = (proxy as unknown as (request: NextRequest) => NextResponse)(request);
  const forwarded = new Headers();
  for (const name of response.headers.get("x-middleware-override-headers")?.split(",") ?? []) {
    const value = response.headers.get(`x-middleware-request-${name}`);
    if (value !== null) forwarded.set(name, value);
  }
  m.headers = forwarded;
  for (const cookie of response.cookies.getAll()) m.cookies.set(cookie.name, cookie.value);
  return response;
}

it("resolves a direct ADMIN staging page without an active-store-id cookie", async () => {
  const response = applyProxyHeaders(pagePath);
  expect(response.headers.get("x-middleware-rewrite")).toBe("https://synthetic.example/dashboard/bookings");
  expect(m.headers.get("x-next-pathname")).toBe(pagePath);
  expect(m.headers.get("x-store-slug")).toBe("staging");
  expect(m.cookies.get("store-slug")).toBe("staging");
  expect(m.cookies.has("active-store-id")).toBe(false);
  await expect(getActiveStoreForRead(admin)).resolves.toBe("staging-store");
  await expect(fetchDaySlots("2026-09-24")).resolves.toEqual({ slots: [] });
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("loses page route scope at the real API proxy and returns UNAUTHORIZED / HTTP 401", async () => {
  applyProxyHeaders(pagePath);
  await expect(getActiveStoreForRead(admin)).resolves.toBe("staging-store");
  m.special.mockClear();
  applyProxyHeaders(slotsPath);
  expect(m.headers.get("x-next-pathname")).toBe("/api/bookings/slots");
  expect(m.headers.get("x-store-slug")).toBeNull();
  await expect(getActiveStoreForRead(admin)).resolves.toBeNull();
  await expect(fetchDaySlots("2026-09-24")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const response = await GET(new Request(`https://synthetic.example${slotsPath}`));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "時段暫時無法載入" });
  expect(m.permission).toHaveBeenCalledWith("booking.read");
  expect(m.special).not.toHaveBeenCalled();
});
it("makes the real client reader reject after that direct-entry route loses scope", async () => {
  applyProxyHeaders(pagePath);
  await expect(getActiveStoreForRead(admin)).resolves.toBe("staging-store");
  await expect(readBookingSlots("2026-09-24")).rejects.toThrow("時段暫時無法載入");
  expect(fetch).toHaveBeenCalledWith(slotsPath, { cache: "no-store", credentials: "same-origin" });
});
it("succeeds under the existing API contract when an authorized active-store-id cookie exists", async () => {
  m.cookies.set("active-store-id", "staging-store"); applyProxyHeaders(pagePath);
  await expect(readBookingSlots("2026-09-24")).resolves.toEqual({ slots: [] });
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("does not trust forged route headers or a referer to restore API store scope", async () => {
  applyProxyHeaders(slotsPath, { "x-next-pathname": pagePath, "x-store-slug": "staging", referer: `https://synthetic.example${pagePath}` });
  expect(m.headers.get("x-store-slug")).toBeNull();
  await expect(getActiveStoreForRead(admin)).resolves.toBeNull();
  expect((await GET(new Request(`https://synthetic.example${slotsPath}`))).status).toBe(401);
});
it("characterizes legacy stale-cookie mismatch for an unrestricted synthetic ADMIN", async () => {
  m.cookies.set("active-store-id", "synthetic-other-store"); applyProxyHeaders(pagePath);
  await expect(getActiveStoreForRead(admin)).resolves.toBe("staging-store");
  await expect(readBookingSlots("2026-09-24")).resolves.toEqual({ slots: [] });
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "synthetic-other-store", date: new Date("2026-09-24T00:00:00Z") } });
});

// Authorized explicit-scope regression contract for the repair.
// These cases intentionally use the real store-access implementation.
// Session is mocked as unrestricted ADMIN unless a test explicitly registers
// HQ store-view context. Real-session cookie restrictions are separately tested
// in booking-slots-scoped-feature-audit.test.ts.
import { AppError } from "@/lib/errors";
import { registerHqStoreViewContext } from "@/lib/hq-store-view-context";
function setActor(user: { id: string; role: string; storeId: string | null; staffId?: string | null }) {
  m.actor = { ...user, staffId: user.staffId ?? null };
  m.session.mockResolvedValue(user); m.permission.mockResolvedValue(user);
}
async function explicitSlots(storeId: string) {
  const path = `${slotsPath}&${new URLSearchParams({ storeId })}`;
  applyProxyHeaders(path);
  return GET(new Request(`https://synthetic.example${path}`));
}
it("accepts a server-authorized explicit store without an active cookie", async () => {
  const response = await explicitSlots("staging-store");
  expect(response.status).toBe(200);
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("uses the explicit store over a stale cookie for an unrestricted synthetic ADMIN only", async () => {
  m.cookies.set("active-store-id", "synthetic-other-store");
  expect((await explicitSlots("staging-store")).status).toBe(200);
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("rejects a nonexistent explicit store before querying its slots", async () => {
  expect((await explicitSlots("synthetic-nonexistent-store")).status).toBe(403);
  expect(m.special).not.toHaveBeenCalled();
});
it("rejects explicit store reads without booking.read permission", async () => {
  m.permission.mockRejectedValue(new AppError("FORBIDDEN", "Synthetic permission denial"));
  expect((await explicitSlots("staging-store")).status).toBe(403);
  expect(m.session).not.toHaveBeenCalled();
  expect(m.storeMany).not.toHaveBeenCalled(); expect(m.special).not.toHaveBeenCalled();
});
it("allows ordinary staff to request their own store explicitly", async () => {
  setActor({ id: "synthetic-staff", role: "STAFF", storeId: "staging-store", staffId: "synthetic-staff" });
  expect((await explicitSlots("staging-store")).status).toBe(200);
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("rejects ordinary staff trying an explicit other-store id", async () => {
  setActor({ id: "synthetic-staff", role: "STAFF", storeId: "staging-store", staffId: "synthetic-staff" });
  expect((await explicitSlots("synthetic-other-store")).status).toBe(403);
  expect(m.special).not.toHaveBeenCalled();
});
it("keeps an HQ store-view actor confined to its server-registered store", async () => {
  const scoped = registerHqStoreViewContext({ ...admin }, "staging-store");
  setActor(scoped);
  expect((await explicitSlots("staging-store")).status).toBe(200);
  m.special.mockClear();
  expect((await explicitSlots("synthetic-other-store")).status).toBe(403);
  expect(m.special).not.toHaveBeenCalled();
});

it.each([undefined, "synthetic-other-store"])("passes the explicit scope through the real client and API with cookie %s", async cookie => {
  if (cookie) m.cookies.set("active-store-id", cookie);
  applyProxyHeaders(pagePath);
  await expect(readBookingSlots("2026-09-24", "staging-store")).resolves.toEqual({ slots: [] });
  expect(fetch).toHaveBeenCalledWith(`${slotsPath}&storeId=staging-store`, { cache: "no-store", credentials: "same-origin" });
  expect(m.special).toHaveBeenLastCalledWith({ where: { storeId: "staging-store", date: new Date("2026-09-24T00:00:00Z") } });
});
it("rejects an inactive explicit store before querying its slots", async () => {
  expect((await explicitSlots("synthetic-disabled-store")).status).toBe(403);
  expect(m.special).not.toHaveBeenCalled();
});
it.each(["", "__all__", "synthetic-".repeat(30)])("rejects invalid or non-concrete explicit scope %s", async storeId => {
  expect((await explicitSlots(storeId)).status).toBe(400);
  expect(m.special).not.toHaveBeenCalled();
});
it("rejects an explicit null supplied directly to the server action", async () => {
  await expect(fetchDaySlots("2026-09-24", null as unknown as string)).rejects.toMatchObject({ code: "VALIDATION" });
  expect(m.special).not.toHaveBeenCalled();
});

it("passes the explicit target to every permission guard in the real API/action chain", async () => {
  expect((await explicitSlots("staging-store")).status).toBe(200);
  expect(m.permission).toHaveBeenCalled();
  for (const call of m.permission.mock.calls) {
    expect(call).toEqual(["booking.read", undefined, { storeId: "staging-store" }]);
  }
});
