import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn(), current: vi.fn(), teacher: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  courseBooking: { updateMany: m.update, findFirst: m.current },
  courseSession: { updateMany: m.teacher },
} }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: m.refresh }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.access, courseMember: vi.fn(), courseAccount: vi.fn(), courseTransaction: vi.fn() }));
vi.mock("@/server/services/course-booking", () => ({ reserveCourse: vi.fn(), settleCourseBooking: vi.fn() }));
import { saveCourseRosterNote } from "@/server/actions/course-members";
import { AppError } from "@/lib/errors";
const input = { sessionId: "session-a", bookingId: "booking-a", note: " next\nline ", expectedNote: "old" };
const scope = { id: "booking-a", sessionId: "session-a", storeId: "store-a", status: { not: "CANCELLED" } };
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ storeId: "store-a", user: { id: "user-a" } });
  m.update.mockResolvedValue({ count: 1 }); m.teacher.mockResolvedValue({ count: 1 });
});
it("atomically saves only the authorized booking note and never refreshes the whole roster", async () => {
  expect(await saveCourseRosterNote({ ...input, status: "ATTENDED", pointCost: 0, serviceNote: "ignored" })).toEqual({ success: true });
  expect(m.access).toHaveBeenCalledExactlyOnceWith("booking.update");
  expect(m.update).toHaveBeenCalledExactlyOnceWith({ where: { ...scope, notes: "old" }, data: { notes: "next\nline" } });
  expect(m.teacher).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it("does not write or disclose a note when course authorization rejects", async () => {
  m.access.mockRejectedValue(new AppError("FORBIDDEN", "沒有編輯權限"));
  expect(await saveCourseRosterNote(input)).toMatchObject({ success: false });
  expect(m.update).not.toHaveBeenCalled(); expect(m.current).not.toHaveBeenCalled();
});
it("returns the current note only for a non-cancelled booking in the same store and session", async () => {
  m.update.mockResolvedValue({ count: 0 }); m.current.mockResolvedValue({ notes: "同事已更新" });
  expect(await saveCourseRosterNote(input)).toMatchObject({ success: false, currentValue: "同事已更新" });
  expect(m.current).toHaveBeenCalledExactlyOnceWith({ where: scope, select: { notes: true } });
  expect(m.refresh).not.toHaveBeenCalled();
});
it.each(["other-store", "other-session", "cancelled", "missing"])("does not disclose or update a %s booking", async bookingId => {
  m.update.mockResolvedValue({ count: 0 }); m.current.mockResolvedValue(null);
  const result = await saveCourseRosterNote({ ...input, bookingId });
  expect(result).toMatchObject({ success: false }); expect(result).not.toHaveProperty("currentValue");
  expect(m.current).toHaveBeenCalledWith({ where: { ...scope, id: bookingId }, select: { notes: true } });
});
it("recognizes a prior committed save on retry and permits clearing a note", async () => {
  m.update.mockResolvedValue({ count: 0 }); m.current.mockResolvedValue({ notes: "" });
  expect(await saveCourseRosterNote({ ...input, note: "  " })).toEqual({ success: true });
  expect(m.update).toHaveBeenCalledWith({ where: { ...scope, notes: "old" }, data: { notes: "" } });
});
it("validates the length before a mutation", async () => {
  expect(await saveCourseRosterNote({ ...input, note: "字".repeat(1001) })).toMatchObject({ success: false });
  expect(m.update).not.toHaveBeenCalled();
});
it("preserves the legacy booking detail contract and the separate teacher-note mutation", async () => {
  expect(await saveCourseRosterNote({ sessionId: "session-a", bookingId: "booking-a", note: "detail" })).toEqual({ success: true });
  expect(m.update).toHaveBeenCalledWith({ where: scope, data: { notes: "detail" } });
  expect(m.refresh).toHaveBeenCalledTimes(3);
  expect(await saveCourseRosterNote({ sessionId: "session-a", note: " teacher " })).toEqual({ success: true });
  expect(m.teacher).toHaveBeenCalledExactlyOnceWith({ where: { id: "session-a", storeId: "store-a", cancelledAt: null }, data: { teacherNote: "teacher" } });
  expect(m.refresh).toHaveBeenCalledTimes(6);
});
