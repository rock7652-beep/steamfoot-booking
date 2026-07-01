import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const STORE_PARENT = "store-parent";
const STORE_CHILD = "store-child";

const mockRequireStaffSession = vi.fn();
const mockRequirePermission = vi.fn();
const mockRequireWritablePermission = vi.fn();
const mockCashbookFindMany = vi.fn();
const mockCashbookCount = vi.fn();
const mockCashbookGroupBy = vi.fn();
const mockCashbookCreate = vi.fn();
const mockGetCurrentCashDrawer = vi.fn();
const mockInitializeCashDrawer = vi.fn();
const mockOpenCashDrawer = vi.fn();
const mockAddCashDrawerEntry = vi.fn();
const mockCloseCashDrawer = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    cashbookEntry: {
      findMany: (...args: unknown[]) => mockCashbookFindMany(...args),
      count: (...args: unknown[]) => mockCashbookCount(...args),
      groupBy: (...args: unknown[]) => mockCashbookGroupBy(...args),
      create: (...args: unknown[]) => mockCashbookCreate(...args),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: (...args: unknown[]) => mockRequireStaffSession(...args),
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireWritablePermission: (...args: unknown[]) =>
    mockRequireWritablePermission(...args),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (user: { storeId?: string | null }) => user.storeId,
  resolveWriteStoreId: vi.fn(async () => STORE_PARENT),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue({
    ownStoreId: STORE_PARENT,
    viewedStoreId: STORE_CHILD,
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

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getManagerReadFilter: vi.fn(
    (
      _role: string,
      _staffId: string | null,
      _filterField: string,
      storeId?: string | null,
    ) => (storeId ? { storeId } : {}),
  ),
}));

vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: vi.fn(),
}));

vi.mock("@/server/queries/cash-drawer", async () => {
  const actual = await vi.importActual<typeof import("@/server/queries/cash-drawer")>(
    "@/server/queries/cash-drawer",
  );
  return {
    ...actual,
    isBusinessDateClosed: vi.fn(async () => false),
  };
});

vi.mock("@/server/services/cash-drawer", () => ({
  getCurrentCashDrawer: (...args: unknown[]) => mockGetCurrentCashDrawer(...args),
  initializeCashDrawer: (...args: unknown[]) => mockInitializeCashDrawer(...args),
  openCashDrawer: (...args: unknown[]) => mockOpenCashDrawer(...args),
  addCashDrawerEntry: (...args: unknown[]) => mockAddCashDrawerEntry(...args),
  closeCashDrawer: (...args: unknown[]) => mockCloseCashDrawer(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function viewedStoreUser() {
  return {
    id: "user-parent",
    name: "Parent Store Owner",
    email: "owner@example.com",
    role: "OWNER" as UserRole,
    staffId: "staff-parent",
    customerId: null,
    storeId: STORE_PARENT,
    storeSlug: "parent",
  };
}

describe("cash drawer view mode support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireStaffSession.mockResolvedValue(viewedStoreUser());
    mockRequirePermission.mockResolvedValue(viewedStoreUser());
    mockRequireWritablePermission.mockRejectedValue(
      new Error("查看模式下不可執行操作"),
    );
    mockCashbookFindMany.mockResolvedValue([]);
    mockCashbookCount.mockResolvedValue(0);
    mockCashbookGroupBy.mockResolvedValue([]);
    mockGetCurrentCashDrawer.mockResolvedValue({ session: null, liveTotals: null });
  });

  it("uses viewedStoreId for cashbook list reads", async () => {
    const { listCashbookEntries } = await import("@/server/queries/cashbook");

    await listCashbookEntries({ activeStoreId: STORE_PARENT });

    expect(mockCashbookFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
    expect(mockCashbookCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
  });

  it("uses viewedStoreId for cashbook monthly summary reads", async () => {
    const { getMonthlySummary } = await import("@/server/queries/cashbook");

    await getMonthlySummary("2026-06", STORE_PARENT);

    expect(mockCashbookGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: STORE_CHILD }),
      }),
    );
  });

  it("uses viewedStoreId for cash drawer read action", async () => {
    const { getCurrentCashDrawerAction } = await import("@/server/actions/cash-drawer");

    const result = await getCurrentCashDrawerAction({ businessDate: "2026-06-20" });

    expect(result.success).toBe(true);
    expect(mockGetCurrentCashDrawer).toHaveBeenCalledWith(
      STORE_CHILD,
      new Date(Date.UTC(2026, 5, 20)),
    );
  });

  it("blocks cash drawer mutations before service writes in view mode", async () => {
    const {
      initializeCashDrawerAction,
      openCashDrawerAction,
      addCashDrawerEntryAction,
      closeCashDrawerAction,
    } = await import("@/server/actions/cash-drawer");

    const initialize = await initializeCashDrawerAction({
      businessDate: "2026-06-20",
      openingBookBalance: 5000,
      openingActualCash: 5000,
    });
    const open = await openCashDrawerAction({
      businessDate: "2026-06-20",
      openingActualCash: 5000,
    });
    const entry = await addCashDrawerEntryAction({
      sessionId: "session-child",
      type: "CASH_WITHDRAWAL",
      amount: 1000,
      reason: "deposit",
    });
    const close = await closeCashDrawerAction({
      sessionId: "session-child",
      closingActualCash: 4000,
    });

    expect([initialize.success, open.success, entry.success, close.success]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(mockRequireWritablePermission).toHaveBeenCalledWith("cashDrawer.open");
    expect(mockRequireWritablePermission).toHaveBeenCalledWith("cashDrawer.entry");
    expect(mockRequireWritablePermission).toHaveBeenCalledWith("cashDrawer.close");
    expect(mockInitializeCashDrawer).not.toHaveBeenCalled();
    expect(mockOpenCashDrawer).not.toHaveBeenCalled();
    expect(mockAddCashDrawerEntry).not.toHaveBeenCalled();
    expect(mockCloseCashDrawer).not.toHaveBeenCalled();
  });

  it("blocks cashbook create before writing in view mode", async () => {
    const { createCashbookEntry } = await import("@/server/actions/cashbook");

    const result = await createCashbookEntry({
      entryDate: "2026-06-20",
      type: "INCOME",
      amount: 1000,
      paymentMethod: "CASH",
    });

    expect(result.success).toBe(false);
    expect(mockRequireWritablePermission).toHaveBeenCalledWith("cashbook.create");
    expect(mockCashbookCreate).not.toHaveBeenCalled();
  });
});
