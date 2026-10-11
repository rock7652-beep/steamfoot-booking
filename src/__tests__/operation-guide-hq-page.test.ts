import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "ADMIN", storeId: null as string | null, permissions: ["audit.read", "staff.manage"], preview: true, module: "steamfoot" }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ role: state.role, staffId: state.role === "ADMIN" ? null : "staff" }) }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => state.storeId }));
vi.mock("@/lib/permissions", () => ({ ALL_PERMISSIONS: ["audit.read", "staff.manage", "booking.read"], checkPermission: async (_role: string, _staff: string, permission: string) => state.permissions.includes(permission) }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => state.module }));
vi.mock("@/lib/operation-guide-preview", () => ({ isOperationGuidePreview: () => state.preview }));
vi.mock("next/navigation", () => ({ redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("notFound"); } }));
vi.mock("@/components/operation-guide-content", () => ({ OperationGuideContent: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
import OperationGuidePage from "../app/(dashboard)/dashboard/guide/page";

describe("HQ full operation guide route", () => {
  beforeEach(() => { Object.assign(state, { role: "ADMIN", storeId: null, permissions: ["audit.read", "staff.manage"], preview: true, module: "steamfoot" }); });
  it("opens the full guide for real HQ without selecting a store", async () => { expect(await OperationGuidePage()).toBeTruthy(); });
  it("does not bypass audit permission in the no-store scope", async () => { state.permissions = ["staff.manage"]; await expect(OperationGuidePage()).rejects.toThrow("notFound"); });
  it.each(["OWNER", "MANAGER", "STAFF"])("does not expose the HQ route to %s without a store", async role => { state.role = role; await expect(OperationGuidePage()).rejects.toThrow("notFound"); });
  it("retains an authorized store guide without granting HQ audit permission", async () => { state.role = "OWNER"; state.storeId = "own"; state.permissions = ["booking.read"]; expect(await OperationGuidePage()).toBeTruthy(); });
  it("keeps the release switch and unsupported module guard", async () => { state.preview = false; await expect(OperationGuidePage()).rejects.toThrow("notFound"); state.preview = true; state.storeId = "other"; state.module = "unsupported"; await expect(OperationGuidePage()).rejects.toThrow("notFound"); });
});
