import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), access: vi.fn(), subscription: vi.fn(),
  find: vi.fn(), update: vi.fn(), audit: vi.fn(), refresh: vi.fn(), path: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: mocks.permission }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: mocks.access }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: mocks.subscription }));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: mocks.refresh }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.path }));
vi.mock("@/lib/db", () => ({ prisma: {
  booking: { findUnique: mocks.find },
  $transaction: (fn: (tx: unknown) => unknown) => fn({
    booking: { update: mocks.update }, auditLog: { create: mocks.audit },
  }),
} }));
import { updateBookingNoteAction } from "@/server/actions/booking-note";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ id: "staff1" });
  mocks.find.mockResolvedValue({ id: "b1", storeId: "store1", customerId: "c1", bookingStatus: "COMPLETED" });
});

describe("本次備註", () => {
  it("allows completed booking notes to be corrected without changing settlement/status or customer notes", async () => {
    expect((await updateBookingNoteAction({ bookingId: "b1", notes: " 今天晚到 " })).success).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("booking.update");
    expect(mocks.access).toHaveBeenCalledWith({ id: "staff1" }, "store1");
    expect(mocks.subscription).toHaveBeenCalledWith("store1");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { notes: "今天晚到" } });
    expect(mocks.audit).toHaveBeenCalledWith({ data: { actorUserId: "staff1", targetType: "Booking", targetId: "b1", action: "BOOKING_NOTE_UPDATED" } });
    expect(mocks.refresh).toHaveBeenCalledWith("c1");
    expect(mocks.path).toHaveBeenCalledWith("/dashboard/bookings/b1");
  });
  it.each(["", "  ", null])("clears note with %s", async (notes) => {
    expect((await updateBookingNoteAction({ bookingId: "b1", notes })).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { notes: null } });
  });
  it("rejects oversized notes", async () => {
    expect((await updateBookingNoteAction({ bookingId: "b1", notes: "字".repeat(501) })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["permission", "access", "subscription"] as const)("blocks writes when %s rejects", async (guard) => {
    mocks[guard].mockImplementation(() => { throw new AppError("FORBIDDEN", "不可編輯"); });
    expect((await updateBookingNoteAction({ bookingId: "b1", notes: "文字" })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects missing booking", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await updateBookingNoteAction({ bookingId: "missing", notes: "文字" })).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
