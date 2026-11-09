import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ manager: vi.fn(), plan: vi.fn(), staff: vi.fn(), prepare: vi.fn(), assign: vi.fn() }));
vi.mock("@/lib/sports-staging", () => ({ requireSportsStaging: async () => {} }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findFirst: async () => ({}) }, staff: { findFirst: m.staff } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}), coursePointPlan: { findFirst: m.plan } } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseMember: vi.fn(), courseTransaction: vi.fn() }));
vi.mock("@/server/services/sports-production-readiness", () => ({ assertSportsProductionReady: async () => {} }));
vi.mock("@/server/services/operation-audit-outbox", () => ({ enqueueOperationAudit: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ assignCoursePointCard: m.assign }));
vi.mock("@/server/actions/course-purchase-intent", () => ({ prepareCoursePurchaseIntent: m.prepare }));
vi.mock("@/server/actions/course", () => ({}));
vi.mock("@/server/actions/course-rental", () => ({}));
vi.mock("@/server/actions/course-trial", () => ({}));
vi.mock("@/server/actions/course-refund", () => ({}));

import { prepareSportsStagingPurchaseIntent, sportsStagingCommand } from "@/server/actions/sports-staging";

const payload = { planId: "plan-1", customerId: "customer-1", expectedPrice: 1000, requestKey: "ad72faca-c621-4e23-9711-20a6d2807dfa" };

beforeEach(() => {
  vi.clearAllMocks();
  m.manager.mockResolvedValue({ storeId: "sports-test", user: { id: "actor-1", role: "OWNER" } });
  m.plan.mockResolvedValue({ id: payload.planId, price: 1000, storeCost: 300, validDays: 90 });
  m.staff.mockResolvedValue({ id: "staff-1" });
  m.prepare.mockResolvedValue({ success: true, data: { status: "PREPARED", requestKey: payload.requestKey, purchaseId: null } });
  m.assign.mockResolvedValue({ success: true, checkoutReceipt: { purchaseId: "sale-1" } });
});

describe("sports staging purchase intent", () => {
  it("uses the identical server-derived checkout input for prepare and submit", async () => {
    expect(await prepareSportsStagingPurchaseIntent(payload)).toMatchObject({ success: true, data: { status: "PREPARED" } });
    expect(m.assign).not.toHaveBeenCalled();
    expect(await sportsStagingCommand({ operation: "purchase", payload })).toMatchObject({ success: true });
    const prepared = m.prepare.mock.calls[0][0], submitted = m.assign.mock.calls[0][0];
    expect(prepared).toEqual(submitted);
    expect(prepared).toMatchObject({ ...payload, expectedListPrice: 1000, expectedStoreCost: 300, revenueStaffId: "staff-1", paymentMethod: "CARD" });
    expect(prepared.expiresDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not prepare or submit a price that has changed", async () => {
    m.plan.mockResolvedValue({ id: payload.planId, price: 1100, storeCost: 300, validDays: 90 });
    expect(await prepareSportsStagingPurchaseIntent(payload)).toMatchObject({ success: false });
    expect(await sportsStagingCommand({ operation: "purchase", payload })).toMatchObject({ success: false });
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.assign).not.toHaveBeenCalled();
  });

  it("does not prepare or submit if staging access is denied", async () => {
    m.manager.mockRejectedValue(new Error("forbidden"));
    expect(await prepareSportsStagingPurchaseIntent(payload)).toMatchObject({ success: false });
    expect(await sportsStagingCommand({ operation: "purchase", payload })).toMatchObject({ success: false });
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.assign).not.toHaveBeenCalled();
  });
});
