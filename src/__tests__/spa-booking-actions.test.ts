import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  groupFind:vi.fn(),groupCreate:vi.fn(),count:vi.fn(),permission: vi.fn(), store: vi.fn(), guard: vi.fn(), installation: vi.fn(),
  customer: vi.fn(), staff: vi.fn(), bookingFind: vi.fn(), create: vi.fn(), update: vi.fn(),
  treatment: vi.fn(), locations: vi.fn(), skills: vi.fn(), shift: vi.fn(), exceptions: vi.fn(), lock: vi.fn(), itemCreateMany: vi.fn(), itemDeleteMany: vi.fn(), tx: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: m.customer }, staff: { findFirst: m.staff }, storeModuleInstallation: { findUnique: m.installation } } }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission, isStaffRole: () => true }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.store }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.guard }));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: m.guard }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { $transaction: m.tx } }));
import { createSpaGroupBookingAction, createSpaBookingAction, updateSpaBookingAction, cancelSpaBookingAction } from "@/server/actions/spa-booking";
const input = { customerId: "customer", serviceStaffId: "staff", treatmentIds: ["treatment"], bookingDate: "2026-09-24", startTime: "10:00", requestKey: "test-request-970" };
const existing = { id: "booking", status: "CONFIRMED", updatedAt: new Date("2026-09-10T00:00:00.000Z") };
beforeEach(() => {
  vi.resetAllMocks();
  m.groupFind.mockResolvedValue(null);m.groupCreate.mockResolvedValue({id:"G"});m.count.mockResolvedValue(0);
  m.permission.mockResolvedValue(true); m.store.mockResolvedValue({ id: "user", role: "OWNER", staffId: "staff" }); m.guard.mockResolvedValue({ storeId: "spa-store", storeSlug: "spa" });
  m.installation.mockResolvedValue({ status: "ACTIVE" }); m.customer.mockResolvedValue({ id: "customer" }); m.staff.mockResolvedValue({ id: "staff" });
  m.bookingFind.mockResolvedValue(null); m.create.mockResolvedValue({ id: "booking" }); m.update.mockResolvedValue({ id: "booking" }); m.itemCreateMany.mockResolvedValue({ count: 1 }); m.itemDeleteMany.mockResolvedValue({ count: 1 });
  m.treatment.mockResolvedValue([{ id: "treatment", name: "服務", price: 100, serviceMinutes: 60, bufferMinutes: 15, skills: [{ skillId: "skill" }], serviceLocations: [{ serviceLocationId: "location" }] }]);
  m.locations.mockResolvedValue([{ id: "location" }]); m.skills.mockResolvedValue([{ skillId: "skill" }]);
  m.shift.mockResolvedValue({ startTime: "10:00", endTime: "18:00", isActive: true }); m.exceptions.mockResolvedValue([]);
  m.tx.mockImplementation(async fn => fn({ $executeRaw: m.lock, spaBookingGroup:{findUnique:m.groupFind,create:m.groupCreate},spaBooking: { count:m.count,findFirst: m.bookingFind, create: m.create, update: m.update }, spaBookingItem: { createMany: m.itemCreateMany, deleteMany: m.itemDeleteMany }, spaTreatment: { findMany: m.treatment }, spaServiceLocation: { findMany: m.locations }, spaStaffSkill: { findMany: m.skills }, spaStaffAvailability: { findUnique: m.shift }, spaStaffAvailabilityException: { findMany: m.exceptions } }));
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
    expect(m.update.mock.calls[0][0].data).toMatchObject({
      status: "CANCELLED",
      cancelledAt: expect.any(Date),
    });
  });
  it("treats repeated cancellation as success", async () => {
    m.bookingFind.mockResolvedValueOnce({ ...existing, status: "CANCELLED" });
    expect((await cancelSpaBookingAction({ bookingId: "booking", expectedUpdatedAt: existing.updatedAt.toISOString() })).success).toBe(true);
    expect(m.update).not.toHaveBeenCalled();
  });
});

const groupInput={requestKey:"cc29c4cd-fda5-46e5-a4cb-a16ce55351e4",customerId:"customer",guests:[input,{...input,requestKey:"second-guest",startTime:"12:00"}]};
it("creates both guests inside a single transaction with a common group",async()=>{expect((await createSpaGroupBookingAction(groupInput)).success).toBe(true);expect(m.tx).toHaveBeenCalledOnce();expect(m.create).toHaveBeenCalledTimes(2);expect(m.create.mock.calls[0][0].data).toMatchObject({partyGroupId:"G",guestIndex:1});expect(m.create.mock.calls[1][0].data).toMatchObject({partyGroupId:"G",guestIndex:2});});
it("rejects changed group retries",async()=>{m.groupFind.mockResolvedValue({id:"G",fingerprint:"different"});expect((await createSpaGroupBookingAction(groupInput)).success).toBe(false);expect(m.create).not.toHaveBeenCalled();});
it("returns an existing group without creating any guest twice",async()=>{m.groupFind.mockResolvedValue({id:"G",fingerprint:JSON.stringify(groupInput)});expect((await createSpaGroupBookingAction(groupInput)).success).toBe(true);expect(m.create).not.toHaveBeenCalled();});
it("rejects mixed contacts and repeated guest keys",async()=>{expect((await createSpaGroupBookingAction({...groupInput,guests:[input,{...input,customerId:"other"}]})).success).toBe(false);expect((await createSpaGroupBookingAction({...groupInput,guests:[input,input]})).success).toBe(false);expect(m.tx).not.toHaveBeenCalled();});
it("fails the outer group transaction when a later guest conflicts",async()=>{m.bookingFind.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({serviceStaffId:"staff"});expect((await createSpaGroupBookingAction(groupInput)).success).toBe(false);expect(m.tx).toHaveBeenCalledOnce();expect(m.create).toHaveBeenCalledOnce();});

it("rejects stale cancellation without writing",async()=>{m.bookingFind.mockResolvedValueOnce(existing);expect((await cancelSpaBookingAction({bookingId:"booking",expectedUpdatedAt:"2026-09-09T00:00:00.000Z"})).success).toBe(false);expect(m.update).not.toHaveBeenCalled();});
it("rejects cancellation of completed bookings",async()=>{m.bookingFind.mockResolvedValueOnce({...existing,status:"COMPLETED"});expect((await cancelSpaBookingAction({bookingId:"booking",expectedUpdatedAt:existing.updatedAt.toISOString()})).success).toBe(false);expect(m.update).not.toHaveBeenCalled();});
it("preserves cancelled booking and creates a new request",async()=>{m.bookingFind.mockResolvedValueOnce(existing);expect((await cancelSpaBookingAction({bookingId:"booking",expectedUpdatedAt:existing.updatedAt.toISOString()})).success).toBe(true);m.bookingFind.mockResolvedValue(null);expect((await createSpaBookingAction({...input,requestKey:"new-request-after-cancel"})).success).toBe(true);expect(m.update).toHaveBeenCalledOnce();expect(m.create).toHaveBeenCalledOnce();expect(m.create.mock.calls[0][0].data.requestKey).toBe("new-request-after-cancel");});
