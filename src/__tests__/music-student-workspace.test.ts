import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), customer: vi.fn(), feature: vi.fn(), permission: vi.fn(), cards: vi.fn(), next: vi.fn(), opening: vi.fn(), coupons: vi.fn(), source: vi.fn(), tuition: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManagerRead: m.actor }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: m.customer }, storeFeatureEntitlement: { findFirst: m.feature } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { findFirst: m.next }, coursePointCard: { findMany: m.coupons }, $queryRaw: m.source } }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: () => ({ assignedStaffId: "allowed-staff" }) }));
vi.mock("@/server/queries/course-members", () => ({ getCourseCards: m.cards }));
vi.mock("@/server/queries/music-opening-makeup", () => ({ getOpeningMakeupWorkspace: m.opening }));
vi.mock("@/server/services/music-pilot-policy", () => ({ readMusicPilotTuition: m.tuition, PILOT_EVIDENCE_ID: "proof" }));
import { loadMusicStudentWorkspace } from "@/server/actions/music-student-workspace";
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ user: { role: "STAFF", staffId: "allowed-staff" }, storeId: "test-store" });
  m.customer.mockResolvedValue({ id: "learner" }); m.feature.mockResolvedValue({ storeId: "test-store" });
  m.permission.mockResolvedValue(true); m.cards.mockResolvedValue([]); m.next.mockResolvedValue(null); m.opening.mockResolvedValue({ rows: [], opening: { outstanding: 0 } }); m.coupons.mockResolvedValue([]); m.source.mockResolvedValue([]); m.tuition.mockResolvedValue([]);
});
it("rejects another store or invisible learner before any financial reads", async () => {
  m.customer.mockResolvedValue(null);
  expect(await loadMusicStudentWorkspace("foreign")).toMatchObject({ success: false });
  expect(m.customer).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "foreign", storeId: "test-store", assignedStaffId: "allowed-staff", mergedIntoCustomerId: null }) }));
  expect(m.cards).not.toHaveBeenCalled(); expect(m.tuition).not.toHaveBeenCalled(); expect(m.next).not.toHaveBeenCalled();
});
it("does not query wallet, attendance or transactions without their permissions", async () => {
  m.permission.mockResolvedValue(false);
  expect(await loadMusicStudentWorkspace("yjy-lubymusic-student-demo")).toMatchObject({ success: true, data: { balance: null, next: null, tuition: null, opening: null } });
  for (const query of [m.cards, m.next, m.opening, m.coupons, m.source, m.tuition]) expect(query).not.toHaveBeenCalled();
});
it("keeps separate makeup out of ordinary balance and excludes expired cards", async () => {
  m.cards.mockResolvedValue([
    { id: "ordinary", remaining: 8, held: 3, available: 5, expired: false, closed: false },
    { id: "makeup", remaining: 1, held: 0, available: 1, expired: false, closed: false },
    { id: "old", remaining: 20, held: 0, available: 0, expired: true, closed: false },
  ]); m.coupons.mockResolvedValue([{ id: "makeup" }]);
  expect(await loadMusicStudentWorkspace("learner")).toMatchObject({ success: true, data: { balance: { remaining: 8, held: 3, available: 5, makeupRemaining: 1 } } });
});
it("does not read retired source payments even for an imported learner", async () => {
  m.source.mockResolvedValue([{ id: "proof" }]); m.tuition.mockResolvedValue([{ customerId: "yjy-lubymusic-student-demo", paid: 800, receivable: 0, payments: [] }, { customerId: "other", paid: 99999 }]);
  const result = await loadMusicStudentWorkspace("yjy-lubymusic-student-demo");
  expect(result).toMatchObject({ success: true, data: { tuition: null, opening: null } });
  expect(JSON.stringify(result)).not.toContain("99999");
  for (const query of [m.source, m.tuition, m.opening]) expect(query).not.toHaveBeenCalled();
});
it("keeps native student summary available when retired source data is unavailable", async () => {
  m.source.mockResolvedValue([{ id: "proof" }]); m.tuition.mockRejectedValue(new Error("invalid source"));
  expect(await loadMusicStudentWorkspace("yjy-lubymusic-student-demo")).toMatchObject({ success: true, data: { tuition: null, opening: null } });
  for (const query of [m.source, m.tuition, m.opening]) expect(query).not.toHaveBeenCalled();
});
