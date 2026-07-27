import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getActiveStoreForRead: vi.fn(),
  publishFlow: vi.fn(),
  revalidatePath: vi.fn(),
  createDiagnosticId: vi.fn(),
  logFailure: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.getActiveStoreForRead }));
vi.mock("@/lib/digital-butler-publish-diagnostics", () => ({
  createDigitalButlerPublishDiagnosticId: h.createDiagnosticId,
  logDigitalButlerPublishFailure: h.logFailure,
}));
vi.mock("@/server/services/digital-butler", () => ({
  DigitalButlerService: class { publishFlow = h.publishFlow; },
}));

import { publishDigitalButlerFlowAction } from "@/app/(dashboard)/dashboard/settings/digital-butler/actions";

describe("publishDigitalButlerFlowAction diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ id: "owner-1" });
    h.getActiveStoreForRead.mockResolvedValue("store-zhubei");
    h.createDiagnosticId.mockReturnValue("DBP-ABC123DEF456");
  });

  it("returns the logged diagnostic ID when publishing fails", async () => {
    const failure = Object.assign(new Error("database failure"), {
      code: "P2003",
      meta: { field_name: "flowVersionId" },
    });
    h.publishFlow.mockRejectedValue(failure);

    await expect(publishDigitalButlerFlowAction("flow-1")).resolves.toEqual({
      success: false,
      error: "數位管家發布失敗，請稍後再試。\n診斷代碼：DBP-ABC123DEF456",
    });
    expect(h.logFailure).toHaveBeenCalledWith({
      diagnosticId: "DBP-ABC123DEF456",
      storeId: "store-zhubei",
      flowId: "flow-1",
      error: failure,
    });
  });
});
