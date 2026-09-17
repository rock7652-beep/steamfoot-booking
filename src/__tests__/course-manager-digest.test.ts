import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ stores: vi.fn(), feature: vi.fn(), todos: vi.fn(), transaction: vi.fn(), booking: vi.fn(), leads: vi.fn(), count: vi.fn(), claim: vi.fn(), update: vi.fn(), remove: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/server/queries/course-manager-todos", () => ({ getCourseManagerTodoCounts: m.todos }));
vi.mock("@/server/services/store-manager-line-notifications", () => ({ notifyStoreManagerOnLine: m.notify }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: m.stores }, transaction: { count: m.transaction }, booking: { count: m.booking }, digitalButlerLead: { count: m.count, findMany: m.leads }, digitalButlerExecutionLog: { create: m.claim, update: m.update, delete: m.remove } } }));
import { runDailyActionDigest } from "@/server/services/daily-action-digest";
beforeEach(() => { vi.resetAllMocks(); m.stores.mockResolvedValue([{ id: "course", slug: "course-store", industryModule: "COURSE" }]); m.feature.mockResolvedValue(true); m.todos.mockResolvedValue({ pendingPaymentCount: 2, incompleteServiceCount: 3 }); m.count.mockResolvedValue(1); m.leads.mockResolvedValue([]); m.claim.mockResolvedValue({ id: "claim" }); m.notify.mockResolvedValue({ status: "skipped", reason: "recipient_not_configured" }); });
it("course digest reads only course money/attendance and retains common support counts and retry claim", async () => {
  const now = new Date("2026-09-17T01:00:00Z");
  const result = await runDailyActionDigest(now);
  expect(m.todos).toHaveBeenCalledWith("course", now);
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.booking).not.toHaveBeenCalled();
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ course: true, storeId: "course", pendingPaymentCount: 2, incompleteServiceCount: 3, waitingSupportCount: 1, eventKey: "daily-action-digest:course:2026-09-17" }));
  expect(result.storesNotified).toBe(0); expect(result.storesSkipped).toBe(1);
  expect(m.remove).toHaveBeenCalledWith({ where: { id: "claim" } });
});
it("no todo or disabled feature creates no claim and sends nothing", async () => {
  m.todos.mockResolvedValue({ pendingPaymentCount: 0, incompleteServiceCount: 0 }); m.count.mockResolvedValue(0);
  await runDailyActionDigest(); expect(m.notify).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  m.feature.mockResolvedValue(false); m.todos.mockClear();
  await runDailyActionDigest(); expect(m.todos).not.toHaveBeenCalled();
});
it("non-course stores retain mature payment and service sources", async () => {
  m.stores.mockResolvedValue([{ id: "steamfoot", slug: "steamfoot", industryModule: "STEAMFOOT" }]);
  m.transaction.mockResolvedValue(1); m.booking.mockResolvedValue(2);
  await runDailyActionDigest();
  expect(m.todos).not.toHaveBeenCalled(); expect(m.transaction).toHaveBeenCalled(); expect(m.booking).toHaveBeenCalled();
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ course: false, pendingPaymentCount: 1, incompleteServiceCount: 2 }));
});
