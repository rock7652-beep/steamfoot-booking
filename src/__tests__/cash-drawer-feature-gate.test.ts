import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequirePermission = vi.fn();
const mockRequireWritablePermission = vi.fn();
const mockRequireStoreFeature = vi.fn();
const mockCashDrawerSessionFindUnique = vi.fn();
const mockInitializeCashDrawer = vi.fn();
const mockOpenCashDrawer = vi.fn();
const mockGetCurrentCashDrawer = vi.fn();
const mockAddCashDrawerEntry = vi.fn();
const mockCloseCashDrawer = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    cashDrawerSession: {
      findUnique: (...args: unknown[]) => mockCashDrawerSessionFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireWritablePermission: (...args: unknown[]) => mockRequireWritablePermission(...args),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (user: { storeId: string }) => user.storeId,
}));

vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-07-04",
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
}));

vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn().mockResolvedValue(null),
  storeIdForViewContext: (fallbackStoreId: string | null) => fallbackStoreId,
}));

vi.mock("@/server/services/cash-drawer", () => ({
  initializeCashDrawer: (...args: unknown[]) => mockInitializeCashDrawer(...args),
  openCashDrawer: (...args: unknown[]) => mockOpenCashDrawer(...args),
  getCurrentCashDrawer: (...args: unknown[]) => mockGetCurrentCashDrawer(...args),
  addCashDrawerEntry: (...args: unknown[]) => mockAddCashDrawerEntry(...args),
  closeCashDrawer: (...args: unknown[]) => mockCloseCashDrawer(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const STORE_ID = "store-cash";
const SESSION_ID = "session-cash";

function user() {
  return {
    id: "user-1",
    role: "OWNER",
    staffId: "staff-1",
    storeId: STORE_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(user());
  mockRequireWritablePermission.mockResolvedValue(user());
  mockRequireStoreFeature.mockResolvedValue(undefined);
  mockCashDrawerSessionFindUnique.mockResolvedValue({ storeId: STORE_ID });
  mockInitializeCashDrawer.mockResolvedValue({ id: SESSION_ID });
  mockOpenCashDrawer.mockResolvedValue({ id: SESSION_ID });
  mockGetCurrentCashDrawer.mockResolvedValue({ session: null, liveTotals: null });
  mockAddCashDrawerEntry.mockResolvedValue({ id: "entry-1" });
  mockCloseCashDrawer.mockResolvedValue({ id: SESSION_ID });
});

describe("cash_drawer action gates", () => {
  it("checks cash_drawer before opening a cash drawer", async () => {
    const { openCashDrawerAction } = await import("@/server/actions/cash-drawer");

    const result = await openCashDrawerAction({
      businessDate: "2026-07-04",
      openingActualCash: 5000,
    });

    expect(result.success).toBe(true);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(STORE_ID, "cash_drawer");
    expect(mockRequireStoreFeature.mock.invocationCallOrder[0]).toBeLessThan(
      mockOpenCashDrawer.mock.invocationCallOrder[0],
    );
  });

  it("does not open a cash drawer when cash_drawer is disabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "現金抽屜尚未開通"),
    );
    const { openCashDrawerAction } = await import("@/server/actions/cash-drawer");

    const result = await openCashDrawerAction({
      businessDate: "2026-07-04",
      openingActualCash: 5000,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected cash drawer open to be blocked");
    }
    expect(result.error).toBe("現金抽屜尚未開通");
    expect(mockOpenCashDrawer).not.toHaveBeenCalled();
  });

  it("does not add cash drawer entries when the session store is disabled", async () => {
    mockCashDrawerSessionFindUnique.mockResolvedValueOnce({ storeId: "store-session" });
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "現金抽屜尚未開通"),
    );
    const { addCashDrawerEntryAction } = await import("@/server/actions/cash-drawer");

    const result = await addCashDrawerEntryAction({
      sessionId: SESSION_ID,
      type: "CASH_WITHDRAWAL",
      amount: 1000,
      reason: "deposit",
    });

    expect(result.success).toBe(false);
    expect(mockCashDrawerSessionFindUnique).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      select: { storeId: true },
    });
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-session", "cash_drawer");
    expect(mockAddCashDrawerEntry).not.toHaveBeenCalled();
  });

  it("does not close a cash drawer when the session store is disabled", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "現金抽屜尚未開通"),
    );
    const { closeCashDrawerAction } = await import("@/server/actions/cash-drawer");

    const result = await closeCashDrawerAction({
      sessionId: SESSION_ID,
      closingActualCash: 4500,
    });

    expect(result.success).toBe(false);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith(STORE_ID, "cash_drawer");
    expect(mockCloseCashDrawer).not.toHaveBeenCalled();
  });
});
