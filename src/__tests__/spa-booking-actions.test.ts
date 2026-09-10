import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  permission: vi.fn(), store: vi.fn(), guard: vi.fn(), installation: vi.fn(),
  customer: vi.fn(), staff: vi.fn(), bookingFind: vi.fn(), create: vi.fn(), update: vi.fn(),
  treatment: vi.fn(), locations: vi.fn(), skills: vi.fn(), shift: vi.fn(), exceptions: vi.fn(), lock: vi.fn(), tx: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: m.customer }, staff: { findFirst: m.staff }, storeModuleInstallation: { findUnique: m.installation } } }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: m.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: m.guard }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { $transaction: m.tx } }));
import { createSpaBookingAction, updateSpaBookingAction, cancelSpaBookingAction } from "@/server/actions/spa-booking";
const input = { customerId: "customer", serviceStaffId: "staff", treatmentIds: ["treatment"], bookingDate: "2026-09-24", startTime: "10:00", requestKey: "test-request-970" };
const existing = { id: "booking", status: "CONFIRMED", updatedAt: new Date("2026-09-10T00:00:00.000Z") };
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({}); m.store.mockResolvedValue("spa-store"); m.guard.mockResolvedValue(undefined);
  m.installation.mockResolvedValue({ status: "ACTIVE" }); m.customer.mockResolvedValue({ id: "customer" }); m.staff.mockResolvedValue({ id: "staff" });
  m.bookingFind.mockResolvedValue(null); m.create.mockResolvedValue({ id: "booking" }); m.update.mockResolvedValue({ id: "booking" });
  m.treatment.mockResolvedValue([{ id: "treatment", name: "服務", price: 100, serviceMinutes: 60, bufferMinutes: 15, skills: [{ skillId: "skill" }], serviceLocations: [{ serviceLocationId: "location" }] }]);
  m.locations.mockResolvedValue([{ id: "location" }]); m.skills.mockResolvedValue([{ skillId: "skill" }]);
  m.shift.mockResolvedValue({ startTime: "10:00", endTime: "18:00", isActive: true }); m.exceptions.mockResolvedValue([]);
  m.tx.mockImplementation(async fn => fn({ $executeRaw: m.lock, spaBooking: { findFirst: m.bookingFind, create: m.create, update: m.update }, spaTreatment: { findMany: m.treatment }, spaServiceLocation: { findMany: m.locations }, spaStaffSkill: { findMany: m.skills }, spaStaffAvailability: { findUnique: m.shift }, spaStaffAvailabilityException: { findMany: m.exceptions } }));
});
describe("SPA booking actions", () => {
  it("auto assigns one compatible location and snapshots buffer in the end time", async () => {
    expect((await createSpaBookingAction(input)).success).toBe(true);
    expect(m.create.mock.calls[0][0].data).toMatchObject({ serviceLocationId: "location", endTime: "11:15", storeId: "spa-store" });
    expect(m.lock).toHaveBeenCalledOnce();
  });
  it("does not write for inactive installation", async () => {
    m.installation.mockResolvedValue({ status: "PROVISIONING" });
    expect((await createSpaBookingAction(input)).success).toBe(false); expect(m.tx).not.toHaveBeenCalled();
  });
  it("does not write across store boundaries", async () => {
    m.customer.mockResolvedValue(null); expect((await createSpaBookingAction(input)).success).toBe(false); expect(m.create).not.toHaveBeenCalled();
  });
  it("blocks incompatible locations", async () => {
    expect((await createSpaBookingAction({ ...input, serviceLocationId: "other" })).success).toBe(false); expect(m.create).not.toHaveBeenCalled();
  });
  it("blocks unqualified staff", async () => {
    m.skills.mockResolvedValue([]); expect((await createSpaBookingAction(input)).success).toBe(false); expect(m.create).not.toHaveBeenCalled();
  });
  it("blocks leave", async () => {
    m.exceptions.mockResolvedValue([{ type: "UNAVAILABLE", startTime: null, endTime: null }]);
    expect((await createSpaBookingAction(input)).success).toBe(false); expect(m.create).not.toHaveBeenCalled();
  });
  it("retries creation without inserting a second record", async () => {
    m.bookingFind.mockResolvedValueOnce(existing);
    expect((await createSpaBookingAction(input)).success).toBe(true); expect(m.create).not.toHaveBeenCalled();
  });
  it("leaves original appointment untouched when rescheduling conflicts", async () => {
    m.bookingFind.mockResolvedValueOnce(existing).mockResolvedValueOnce({ id: "other", serviceStaffId: "staff" });
    expect((await updateSpaBookingAction({ ...input, bookingId: "booking", expectedUpdatedAt: existing.updatedAt.toISOString() })).success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects stale edits", async () => {
    m.bookingFind.mockResolvedValueOnce(existing);
    expect((await updateSpaBookingAction({ ...input, bookingId: "booking", expectedUpdatedAt: "2026-09-09T00:00:00.000Z" })).success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("cancels without deleting history or location assignment", async () => {
    m.bookingFind.mockResolvedValueOnce(existing);
    expect((await cancelSpaBookingAction({ bookingId: "booking", expectedUpdatedAt: existing.updatedAt.toISOString() })).success).toBe(true);
    expect(m.update.mock.calls[0][0].data).toEqual({ status: "CANCELLED" });
  });
  it("treats repeated cancellation as success", async () => {
    m.bookingFind.mockResolvedValueOnce({ ...existing, status: "CANCELLED" });
    expect((await cancelSpaBookingAction({ bookingId: "booking", expectedUpdatedAt: existing.updatedAt.toISOString() })).success).toBe(true);
    expect(m.update).not.toHaveBeenCalled();
  });
});
