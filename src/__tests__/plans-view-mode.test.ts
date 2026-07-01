import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const mockServicePlanFindMany = vi.fn();
const mockServicePlanFindFirst = vi.fn();
const mockServicePlanCreate = vi.fn();
const mockRequireStaffSession = vi.fn();
const mockRequireWritablePermission = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    servicePlan: {
      findMany: (...args: unknown[]) => mockServicePlanFindMany(...args),
      findFirst: (...args: unknown[]) => mockServicePlanFindFirst(...args),
      create: (...args: unknown[]) => mockServicePlanCreate(...args),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

vi.mock("@/lib/permissions", () => ({
  isOwner: (role: string) => role === "ADMIN",
  requireWritablePermission: (...args: unknown[]) =>
    mockRequireWritablePermission(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue({
    ownStoreId: "store-parent",
    viewedStoreId: "store-child",
    isViewMode: true,
    canWrite: false,
  }),
  storeIdForViewContext: (
    fallbackStoreId: string | null,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ) =>
    viewContext?.isViewMode
      ? viewContext.viewedStoreId ?? fallbackStoreId
      : fallbackStoreId,
  userForViewContext: <T extends { storeId?: string | null }>(
    user: T,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ): T =>
    viewContext?.isViewMode && viewContext.viewedStoreId
      ? { ...user, storeId: viewContext.viewedStoreId }
      : user,
}));

vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: vi.fn(),
}));

vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: vi.fn(),
}));

vi.mock("@/lib/revalidation", () => ({
  revalidatePlans: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  categorizeError: vi.fn(() => "PERMISSION"),
  logError: vi.fn(),
}));

function viewedStoreUser() {
  return {
    id: "user-parent",
    name: "Parent Store Owner",
    email: "owner@example.com",
    role: "OWNER" as UserRole,
    staffId: "staff-parent",
    customerId: null,
    storeId: "store-parent",
    storeSlug: "parent",
  };
}

describe("plans view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireStaffSession.mockResolvedValue(viewedStoreUser());
    mockRequireWritablePermission.mockRejectedValue(
      new Error("查看模式下不可執行操作"),
    );
    mockServicePlanFindMany.mockResolvedValue([]);
    mockServicePlanFindFirst.mockResolvedValue({
      id: "plan-child",
      storeId: "store-child",
      name: "Child Plan",
    });
  });

  it("uses viewedStoreId for plan list queries", async () => {
    const { listPlans } = await import("@/server/queries/plan");

    await listPlans(true, "store-parent");

    expect(mockServicePlanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-child" }),
      }),
    );
  });

  it("uses viewedStoreId for plan detail queries", async () => {
    const { getPlanDetail } = await import("@/server/queries/plan");

    await getPlanDetail("plan-child", "store-parent");

    expect(mockServicePlanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "plan-child",
          storeId: "store-child",
        }),
      }),
    );
  });

  it("blocks plan creation before mutating in view mode", async () => {
    const { createPlan } = await import("@/server/actions/plan");

    const result = await createPlan({
      name: "Blocked Plan",
      category: "PACKAGE",
      price: 12000,
      sessionCount: 10,
    });

    expect(result.success).toBe(false);
    expect(mockRequireWritablePermission).toHaveBeenCalledWith("wallet.create");
    expect(mockServicePlanCreate).not.toHaveBeenCalled();
  });
});
