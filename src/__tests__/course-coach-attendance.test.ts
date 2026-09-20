import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ account: vi.fn(), raw: vi.fn(), settle: vi.fn(), transaction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
vi.mock("@/server/services/course-access", () => ({ courseAccount: mock.account, courseTransaction: mock.transaction, courseMember: vi.fn(), courseManager: vi.fn() }));
vi.mock("@/server/services/course-booking", () => ({ reserveCourse: vi.fn(), settleCourseBooking: mock.settle }));
import { markCourseCoachAttendance } from "@/server/actions/course-members";
beforeEach(() => {
  vi.clearAllMocks();
  mock.account.mockResolvedValue({ user: { id: "user-a", name: "Coach A" }, storeId: "store-a" });
  mock.raw.mockResolvedValue([{ id: "booking-b" }]);
  mock.transaction.mockImplementation(async (_store, callback) => callback({ $queryRaw: mock.raw }));
  mock.settle.mockResolvedValue({id:"booking-b",status:"RESERVED",checkedInAt:new Date(),updatedAt:new Date("2026-09-20T03:00:00Z")});
});
describe("coach attendance", () => {
  it.each(["CHECKED_IN", "ATTENDED", "NO_SHOW"])("uses the existing atomic settlement for %s", async (status) => {
    expect(await markCourseCoachAttendance({ bookingId: "booking-b", status })).toMatchObject({ success: true, attendanceUpdates: [{id:"booking-b", checkedIn:true, updatedAt:"2026-09-20T03:00:00.000Z"}] });
    expect(mock.transaction).toHaveBeenCalledWith("store-a", expect.any(Function));
    expect(mock.settle).toHaveBeenCalledWith(expect.anything(), { storeId: "store-a", userId: "user-a", name: "Coach A" }, "booking-b", status);
    const query = mock.raw.mock.calls[0][0].join("?");
    expect(query).toContain('l."revokedAt" IS NULL');
    expect(query).toContain("st.status::text = 'ACTIVE'");
    expect(query).toContain('l."staffId" = s."coachId"');
  });
  it("denies unassigned, cross-store or disabled work before changing points", async () => {
    mock.raw.mockResolvedValue([]);
    expect(await markCourseCoachAttendance({ bookingId: "booking-b", status: "CHECKED_IN" })).toMatchObject({ success: false });
    expect(mock.settle).not.toHaveBeenCalled();
  });
  it("does not expose cancellation through the coach attendance endpoint", async () => {
    expect(await markCourseCoachAttendance({ bookingId: "booking-b", status: "CANCELLED" })).toMatchObject({ success: false });
    expect(mock.settle).not.toHaveBeenCalled();
  });
});
