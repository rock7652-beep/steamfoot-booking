import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(), permission: vi.fn(), writable: vi.fn(), store: vi.fn(), staff: vi.fn(),
  spa: vi.fn(), subscription: vi.fn(), installation: vi.fn(), tx: vi.fn(), lock: vi.fn(),
  find: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission, isStaffRole: () => true, requireWritablePermission: m.writable }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findFirst: m.staff }, storeModuleInstallation: { findUnique: m.installation } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { $transaction: m.tx } }));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: m.spa }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: m.subscription }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: vi.fn() }));
vi.mock("@/server/services/operation-audit-outbox", () => ({ enqueueOperationAudit: m.audit }));
import { updateSpaBookingNoteAction } from "@/server/actions/spa-booking";
import { AppError } from "@/lib/errors";
const oldTime = new Date("2026-10-08T02:00:00.000Z");
const newTime = new Date("2026-10-08T02:01:00.000Z");
const booking = { id: "booking", status: "CONFIRMED", notes: "原備註", updatedAt: oldTime };
const input = { bookingId: "booking", storeId: "spa-store", notes: " 新備註\n第二行 ", expectedNotes: "原備註" };
const tx = { $executeRaw: m.lock, spaBooking: { findFirst: m.find, updateMany: m.updateMany } };
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "user", staffId: "staff", role: "OWNER" });
  m.permission.mockResolvedValue(true); m.store.mockResolvedValue("spa-store");
  m.staff.mockResolvedValue({ id: "staff" }); m.installation.mockResolvedValue({ status: "ACTIVE" });
  m.find.mockResolvedValueOnce(booking).mockResolvedValue({ ...booking, notes: "新備註\n第二行", updatedAt: newTime });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.tx.mockImplementation(async fn => fn(tx));
});

describe("SPA inline booking notes", () => {
  it("uses booking.update authorization and changes only notes in the correct store", async () => {
    expect(await updateSpaBookingNoteAction(input)).toEqual({ success: true, data: { notes: "新備註\n第二行", updatedAt: newTime.toISOString(), previousUpdatedAt: oldTime.toISOString() } });
    expect(m.permission).toHaveBeenCalledExactlyOnceWith("OWNER", "staff", "booking.update");
    expect(m.writable).toHaveBeenCalledExactlyOnceWith("booking.update");
    expect(m.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "booking", storeId: "spa-store", status: { in: ["PENDING", "CONFIRMED"] }, notes: "原備註" },
      data: { notes: "新備註\n第二行" },
    });
    expect(m.find).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "booking", storeId: "spa-store" } }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ storeId: "spa-store", actorUserId: "user", targetId: "booking", summary: "修改服務預約本次備註" }), tx, `note:${oldTime.toISOString()}`);
    expect(m.revalidate).toHaveBeenCalledWith("/dashboard/spa-schedule");
  });
  it("clears whitespace to null without touching customer notes or labels", async () => {
    m.find.mockReset().mockResolvedValueOnce(booking).mockResolvedValue({ notes: null, updatedAt: newTime });
    expect(await updateSpaBookingNoteAction({ ...input, notes: " \n " })).toMatchObject({ success: true, data: { notes: null } });
    expect(m.updateMany.mock.calls[0][0].data).toEqual({ notes: null });
  });
  it("preserves a concurrent note and returns its value for explicit reconciliation", async () => {
    expect(await updateSpaBookingNoteAction({ ...input, expectedNotes: "過期備註" })).toMatchObject({ success: false, currentValue: "原備註" });
    expect(m.updateMany).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("does not overwrite a concurrent checkout or note change at the update predicate", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    m.find.mockReset().mockResolvedValueOnce(booking).mockResolvedValue({ notes: "其他人的更新", status: "CONFIRMED" });
    expect(await updateSpaBookingNoteAction(input)).toMatchObject({ success: false, currentValue: "其他人的更新" });
    expect(m.audit).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])("keeps %s bookings non-editable", async status => {
    m.find.mockReset().mockResolvedValue({ ...booking, status });
    expect(await updateSpaBookingNoteAction(input)).toMatchObject({ success: false });
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it("rejects cross-store or missing bookings without leaking another note", async () => {
    m.find.mockReset().mockResolvedValue(null);
    const result = await updateSpaBookingNoteAction(input);
    expect(result).toMatchObject({ success: false }); expect(result).not.toHaveProperty("currentValue");
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a store switch before opening the booking transaction", async () => {
    expect(await updateSpaBookingNoteAction({ ...input, storeId: "other-store" })).toMatchObject({ success: false });
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("cannot gain note permission through customer.update", async () => {
    m.permission.mockImplementation(async (_role, _staff, permission) => permission === "customer.update");
    expect(await updateSpaBookingNoteAction(input)).toMatchObject({ success: false });
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("honors read-only selection and subscription guards", async () => {
    m.writable.mockRejectedValueOnce(new AppError("FORBIDDEN", "唯讀店家"));
    expect(await updateSpaBookingNoteAction(input)).toMatchObject({ success: false });
    m.subscription.mockRejectedValueOnce(new AppError("FORBIDDEN", "系統使用期限已到期"));
    expect(await updateSpaBookingNoteAction(input)).toMatchObject({ success: false });
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("enforces the existing 500-character limit before writing", async () => {
    expect(await updateSpaBookingNoteAction({ ...input, notes: "字".repeat(501) })).toMatchObject({ success: false });
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("treats null and empty expected notes as the same blank value", async () => {
    m.find.mockReset().mockResolvedValueOnce({ ...booking, notes: null }).mockResolvedValue({ notes: "新備註", updatedAt: newTime });
    expect(await updateSpaBookingNoteAction({ ...input, expectedNotes: "", notes: "新備註" })).toMatchObject({ success: true });
    expect(m.updateMany.mock.calls[0][0].where.notes).toBeNull();
  });
  it("does not write or audit an unchanged note", async () => {
    expect(await updateSpaBookingNoteAction({ ...input, notes: "原備註" })).toMatchObject({ success: true, data: { notes: "原備註", updatedAt: oldTime.toISOString() } });
    expect(m.updateMany).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
});

it("returns idempotent success after a lost response without another write or audit", async () => {
  m.find.mockReset().mockResolvedValue({ ...booking, notes: "已經儲存", updatedAt: newTime });
  expect(await updateSpaBookingNoteAction({ ...input, notes: "已經儲存" })).toEqual({
    success: true, data: { notes: "已經儲存", updatedAt: newTime.toISOString(), previousUpdatedAt: newTime.toISOString() },
  });
  expect(m.updateMany).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
});
it("bounds the expected note as well as the new value", async () => {
  expect(await updateSpaBookingNoteAction({ ...input, expectedNotes: "字".repeat(501) })).toMatchObject({ success: false });
  expect(m.tx).not.toHaveBeenCalled();
});
