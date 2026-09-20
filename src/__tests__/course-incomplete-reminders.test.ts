import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ oldCandidates: vi.fn(), oldRecheck: vi.fn(), candidates: vi.fn(), recheck: vi.fn(), claim: vi.fn(), update: vi.fn(), remove: vi.fn(), notify: vi.fn() }));
vi.mock("@/server/queries/course-manager-todos", () => ({ getIncompleteCourseCandidates: m.candidates, isCourseBookingStillIncomplete: m.recheck }));
vi.mock("@/server/services/store-manager-line-notifications", () => ({ notifyStoreManagerOnLine: m.notify }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: m.oldCandidates, findFirst: m.oldRecheck }, digitalButlerExecutionLog: { create: m.claim, update: m.update, delete: m.remove } } }));
import { runIncompleteServiceReminders } from "@/server/services/incomplete-service-reminders";
const now = new Date("2026-09-17T04:00:00Z");
beforeEach(() => { vi.resetAllMocks(); m.remove.mockResolvedValue({}); m.oldCandidates.mockResolvedValue([]); m.candidates.mockResolvedValue([{ id: "booking", storeId: "course", storeSlug: "course-store", sessionId: "session", customerName: "Learner", session: { startsAt: new Date("2026-09-17T00:00:00Z"), endsAt: new Date("2026-09-17T03:00:00Z") } }]); m.recheck.mockResolvedValue({ id: "booking" }); m.claim.mockResolvedValue({ id: "claim" }); m.notify.mockResolvedValue({ status: "skipped", reason: "recipient_not_configured" }); });
it("uses actual end for a three-hour class and the existing delivery/claim service", async () => {
  await runIncompleteServiceReminders(now);
  expect(m.oldCandidates).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ store: expect.objectContaining({ industryModule: { not: "COURSE" } }) }) }));
  expect(m.recheck).toHaveBeenCalledWith("course", "booking", now);
  expect(m.oldRecheck).not.toHaveBeenCalled();
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ eventKey: "course-incomplete-attendance:booking", courseSessionId: "session", storeSlug: "course-store", customerName: "Learner", bookingDate: "2026-09-17", slotTime: "08:00" }));
  expect(m.remove).toHaveBeenCalledWith({ where: { id: "claim" } });
});
it("does not notify before grace expires or after concurrent attendance/cancellation", async () => {
  await runIncompleteServiceReminders(new Date("2026-09-17T03:59:59Z"));
  expect(m.notify).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  m.recheck.mockResolvedValue(null);
  await runIncompleteServiceReminders(now);
  expect(m.notify).not.toHaveBeenCalled(); expect(m.remove).toHaveBeenCalled();
});
it("a duplicate claim cannot send a second reminder", async () => {
  m.claim.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
  expect((await runIncompleteServiceReminders(now)).skipped).toBe(1);
  expect(m.notify).not.toHaveBeenCalled();
});
it("a course query failure is reported but does not stop existing service reminders", async () => {
  m.candidates.mockRejectedValue(new Error("course unavailable"));
  m.oldCandidates.mockResolvedValue([{ id: "old", storeId: "steamfoot", store: { slug: "steamfoot" }, bookingDate: new Date("2026-09-17T00:00:00Z"), slotTime: "09:00", customer: { name: "Existing" } }]);
  m.oldRecheck.mockResolvedValue({ id: "old" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await runIncompleteServiceReminders(now);
  expect(result.failed).toBe(1); expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ eventKey: "incomplete-service-reminder:old", storeId: "steamfoot" }));
  log.mockRestore();
});
