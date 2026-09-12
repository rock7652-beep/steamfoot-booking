import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  store: vi.fn(),
  permission: vi.fn(),
  writable: vi.fn(),
  check: vi.fn(),
  customer: vi.fn(),
  bookings: vi.fn(),
  staff: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  tx: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requirePermission: m.permission,
  requireWritablePermission: m.writable,
  checkPermission: m.check,
}));
vi.mock("@/server/actions/spa-resources", () => ({
  spaResourceStore: m.store,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: m.customer },
    staff: { findMany: m.staff },
    $transaction: m.tx,
  },
}));
vi.mock("@/lib/spa-db", () => ({
  spaPrisma: { spaBooking: { findMany: m.bookings } },
}));
import {
  getSpaCustomerProfile,
  saveSpaCustomerNote,
} from "@/server/actions/spa-customer-profile";
beforeEach(() => {
  vi.resetAllMocks();
  m.store.mockResolvedValue("test-store");
  m.permission.mockResolvedValue({ id: "user", role: "OWNER" });
  m.writable.mockResolvedValue({ id: "user" });
  m.check.mockResolvedValue(true);
  m.customer.mockResolvedValue({
    id: "customer",
    name: "測試",
    phone: "0900000000",
    serviceNote: null,
  });
  m.bookings.mockResolvedValue([]);
  m.staff.mockResolvedValue([]);
  m.update.mockResolvedValue({ count: 1 });
  m.tx.mockImplementation(async (fn) =>
    fn({ customer: { updateMany: m.update }, auditLog: { create: m.audit } }),
  );
});
describe("SPA customer profile scope and note updates", () => {
  it("does not read bookings for a foreign customer", async () => {
    m.customer.mockResolvedValue(null);
    expect((await getSpaCustomerProfile("foreign")).success).toBe(false);
    expect(m.bookings).not.toHaveBeenCalled();
    expect(m.customer).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign", storeId: "test-store" },
      }),
    );
  });
  it("shows the profile without booking permissions and never reads bookings", async () => {
    m.check.mockResolvedValue(false);
    const r = await getSpaCustomerProfile("customer");
    expect(r.success).toBe(true);
    expect(m.bookings).not.toHaveBeenCalled();
  });
  it("reads service history only within the resolved store", async () => {
    await getSpaCustomerProfile("customer");
    expect(m.bookings).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: "test-store", customerId: "customer" },
        take: 100,
      }),
    );
  });
  it("requires writable permission before changing a note", async () => {
    m.writable.mockRejectedValue(new Error("denied"));
    expect(
      (
        await saveSpaCustomerNote({
          customerId: "customer",
          serviceNote: "偏好",
          previousNote: null,
        })
      ).success,
    ).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("uses store and previous value as write guards, with a content-free audit", async () => {
    expect(
      (
        await saveSpaCustomerNote({
          customerId: "customer",
          serviceNote: " 輕力道 ",
          previousNote: null,
        })
      ).success,
    ).toBe(true);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "customer", storeId: "test-store", serviceNote: null },
      data: { serviceNote: "輕力道" },
    });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("輕力道");
  });
  it("rejects a stale note instead of overwriting another editor", async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect(
      (
        await saveSpaCustomerNote({
          customerId: "customer",
          serviceNote: "new",
          previousNote: "old",
        })
      ).success,
    ).toBe(false);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("rejects oversized notes before any mutation", async () => {
    expect(
      (
        await saveSpaCustomerNote({
          customerId: "customer",
          serviceNote: "x".repeat(2001),
          previousNote: null,
        })
      ).success,
    ).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
});
