/**
 * PR-3 帳號管理階層守則 — server action 鎖定測試
 *
 * 階層：ADMIN(rock7652) > 主要店長 pass(OWNER,isOwner=true,有 staff.manage)
 *       > 合作店長 ggg(OWNER,isOwner=false,無 staff.manage)
 *
 * 鎖定：
 *  - ggg（無 staff.manage）呼叫 deactivate/updateStaffPermissionsAction → FORBIDDEN
 *  - pass（有 staff.manage）可停用 ggg；不可停用自己；不可管理 isOwner 主要店長 / ADMIN
 *  - ADMIN 可穿透 isOwner 管理 pass；仍受 self-guard
 *  - 任何人不可對自己執行（防自鎖）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE = "store-zhubei";
const PASS = { id: "u-pass", role: "OWNER" as const, staffId: "s-pass" };
const GGG = { id: "u-ggg", role: "OWNER" as const, staffId: "s-ggg" };
const ADMIN = { id: "u-admin", role: "ADMIN" as const, staffId: null };

const mockStaffFindUnique = vi.fn();
const mockStaffUpdate = vi.fn();
const mockUserUpdate = vi.fn();
const mockTx = vi.fn(async (ops: unknown) =>
  Array.isArray(ops) ? Promise.all(ops) : ops,
);
vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findUnique: (...a: unknown[]) => mockStaffFindUnique(...a),
      update: (...a: unknown[]) => mockStaffUpdate(...a),
    },
    user: { update: (...a: unknown[]) => mockUserUpdate(...a) },
    $transaction: (ops: unknown) => mockTx(ops),
  },
}));

const mockRequireStaffSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireStaffSession: () => mockRequireStaffSession(),
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: vi.fn(async () => STORE),
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateStaff: vi.fn(),
  revalidateStaffPermissions: vi.fn(),
}));
vi.mock("@/lib/feature-gate", () => ({ checkCurrentStoreFeature: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ FEATURES: {} }));

const mockCheckPermission = vi.fn();
const mockUpdateStaffPermissions = vi.fn();
const mockAssertNotLastStoreManager = vi.fn();
vi.mock("@/lib/permissions", () => ({
  createDefaultPermissions: vi.fn(),
  checkPermission: (...a: unknown[]) => mockCheckPermission(...a),
  updateStaffPermissions: (...a: unknown[]) => mockUpdateStaffPermissions(...a),
  assertNotLastStoreManager: (...a: unknown[]) =>
    mockAssertNotLastStoreManager(...a),
}));

function targetStaff(over: Record<string, unknown> = {}) {
  return {
    id: "s-ggg",
    userId: "u-ggg",
    storeId: STORE,
    isOwner: false,
    user: { id: "u-ggg", role: "OWNER" },
    ...over,
  };
}

async function deactivate(staffId = "s-ggg") {
  const { deactivateStaff } = await import("@/server/actions/staff");
  return deactivateStaff(staffId);
}
async function editPerms(staffId = "s-ggg") {
  const { updateStaffPermissionsAction } = await import("@/server/actions/staff");
  return updateStaffPermissionsAction(staffId, {} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStaffFindUnique.mockResolvedValue(targetStaff());
});

describe("ggg（無 staff.manage）一律不可管理帳號", () => {
  it("ggg deactivate → FORBIDDEN", async () => {
    mockRequireStaffSession.mockResolvedValue(GGG);
    mockCheckPermission.mockResolvedValue(false); // ggg 無 staff.manage
    const r = await deactivate("s-other");
    expect(r.success).toBe(false);
    expect(mockStaffUpdate).not.toHaveBeenCalled();
  });
  it("ggg updateStaffPermissionsAction → FORBIDDEN", async () => {
    mockRequireStaffSession.mockResolvedValue(GGG);
    mockCheckPermission.mockResolvedValue(false);
    const r = await editPerms("s-other");
    expect(r.success).toBe(false);
    expect(mockUpdateStaffPermissions).not.toHaveBeenCalled();
  });
});

describe("pass（有 staff.manage, 主要店長）", () => {
  it("可停用 ggg（OWNER, isOwner=false）", async () => {
    mockRequireStaffSession.mockResolvedValue(PASS);
    mockCheckPermission.mockResolvedValue(true);
    mockStaffFindUnique.mockResolvedValue(targetStaff());
    const r = await deactivate("s-ggg");
    expect(r.success).toBe(true);
    expect(mockStaffUpdate).toHaveBeenCalled();
  });
  it("不可停用自己（防自鎖）", async () => {
    mockRequireStaffSession.mockResolvedValue(PASS);
    mockCheckPermission.mockResolvedValue(true);
    mockStaffFindUnique.mockResolvedValue(
      targetStaff({ id: "s-pass", userId: "u-pass", user: { id: "u-pass", role: "OWNER" } }),
    );
    const r = await deactivate("s-pass");
    expect(r.success).toBe(false);
    expect(mockStaffUpdate).not.toHaveBeenCalled();
  });
  it("不可管理 isOwner=true 的主要店長", async () => {
    mockRequireStaffSession.mockResolvedValue(PASS);
    mockCheckPermission.mockResolvedValue(true);
    mockStaffFindUnique.mockResolvedValue(
      targetStaff({ id: "s-main", userId: "u-main", isOwner: true, user: { id: "u-main", role: "OWNER" } }),
    );
    const r = await deactivate("s-main");
    expect(r.success).toBe(false);
  });
  it("不可管理 ADMIN 目標", async () => {
    mockRequireStaffSession.mockResolvedValue(PASS);
    mockCheckPermission.mockResolvedValue(true);
    mockStaffFindUnique.mockResolvedValue(
      targetStaff({ id: "s-adm", userId: "u-admin", user: { id: "u-admin", role: "ADMIN" } }),
    );
    const r = await deactivate("s-adm");
    expect(r.success).toBe(false);
  });
});

describe("ADMIN 最高權限", () => {
  it("可穿透 isOwner 停用主要店長 pass", async () => {
    mockRequireStaffSession.mockResolvedValue(ADMIN);
    mockStaffFindUnique.mockResolvedValue(
      targetStaff({ id: "s-pass", userId: "u-pass", isOwner: true, user: { id: "u-pass", role: "OWNER" } }),
    );
    const r = await deactivate("s-pass");
    expect(r.success).toBe(true);
    // ADMIN 不需 staff.manage 顯式檢查
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });
  it("ADMIN 仍不可停用自己（防自鎖）", async () => {
    mockRequireStaffSession.mockResolvedValue({ ...ADMIN, id: "u-admin" });
    mockStaffFindUnique.mockResolvedValue(
      targetStaff({ id: "s-adm", userId: "u-admin", user: { id: "u-admin", role: "ADMIN" } }),
    );
    const r = await deactivate("s-adm");
    expect(r.success).toBe(false);
  });
});
