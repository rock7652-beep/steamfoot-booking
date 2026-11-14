// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ primary: vi.fn() }));
vi.mock("@/server/actions/customer", () => ({ getCustomerDrawerDetailAction: m.primary }));
import { GET } from "@/app/(dashboard)/dashboard/customers/primary-read/route";
import { readCustomerDrawerPrimary } from "@/lib/customer-drawer-primary-read";
afterEach(() => { vi.unstubAllGlobals(); m.primary.mockReset(); });

it("validates IDs and delegates store/permission checks without accepting a supplied store", async () => {
  expect((await GET(new Request("https://test/dashboard/customers/primary-read"))).status).toBe(400);
  expect(m.primary).not.toHaveBeenCalled();
  m.primary.mockResolvedValue({ success: false, error: "顧客不存在" });
  const response = await GET(new Request("https://test/dashboard/customers/primary-read?customerId=other&storeId=untrusted"));
  expect(m.primary).toHaveBeenCalledWith("other");
  expect(await response.json()).toEqual({ success: false, error: "顧客不存在" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(response.headers.get("Server-Timing")).toContain("primary;dur=");
});

it("preserves the scoped URL and restores nested dates without coercing note text", async () => {
  window.history.replaceState(null, "", "/s/fixture/admin/dashboard/customers");
  const iso = "2026-11-15T00:00:00.000Z";
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: {
    serviceNote: iso, birthday: iso, planWallets: [{ expiryDate: iso, purchasedAt: iso }],
    bookings: [{ bookingDate: iso }], recentConsumption: [{ date: iso }],
  } }) }));
  vi.stubGlobal("fetch", fetch);
  const result = await readCustomerDrawerPrimary("a&b");
  expect(fetch).toHaveBeenCalledWith("/s/fixture/admin/dashboard/customers/primary-read?customerId=a%26b", expect.objectContaining({ credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(result.success).toBe(true);
  if (!result.success) throw Error("unexpected failure");
  expect(result.data.birthday).toBeInstanceOf(Date);
  expect(result.data.planWallets[0].expiryDate).toBeInstanceOf(Date);
  expect(result.data.bookings[0].bookingDate).toBeInstanceOf(Date);
  expect(result.data.recentConsumption?.[0].date).toBeInstanceOf(Date);
  expect(result.data.serviceNote).toBe(iso);
});
