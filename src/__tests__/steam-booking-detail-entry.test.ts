import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), permission: vi.fn(), module: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findFirst: mocks.read } } }));
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => ({ role: "OWNER", staffId: "owner", storeId: "store-a" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: mocks.permission }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store-a" }) }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store-a" }));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: async () => null,
  storeIdForViewContext: (id: string) => id,
  userForViewContext: (user: unknown) => user,
}));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.module }));
vi.mock("@/server/actions/booking", () => ({}));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/[id]/booking-actions", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: () => { throw new Error("not-found"); },
}));

import BookingDetailPage from "@/app/(dashboard)/dashboard/bookings/[id]/page";

describe("Steamfoot legacy detail entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ id: "booking-a", storeId: "store-a" });
    mocks.module.mockResolvedValue("steamfoot");
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  });
  it("opens the same booking only after a scoped lookup", async () => {
    await expect(BookingDetailPage({ params: Promise.resolve({ id: "booking-a" }) })).rejects.toThrow("redirect");
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "booking-a", storeId: "store-a" } }));
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard/bookings?bookingId=booking-a");
  });
  it("rejects unavailable bookings before resolving or redirecting them", async () => {
    mocks.read.mockResolvedValue(null);
    await expect(BookingDetailPage({ params: Promise.resolve({ id: "other-store-booking" }) })).rejects.toThrow("not-found");
    expect(mocks.module).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("requires booking.read before querying the booking", async () => {
    mocks.permission.mockResolvedValue(false);
    await expect(BookingDetailPage({ params: Promise.resolve({ id: "booking-a" }) })).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
