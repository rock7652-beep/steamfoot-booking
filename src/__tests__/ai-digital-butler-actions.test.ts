import { beforeEach, describe, it, expect, vi } from "vitest";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), entitlement: vi.fn(), save: vi.fn(), handoff: vi.fn(), repository: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mocks.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: mocks.entitlement }));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs", () => ({ assertAiPreview: vi.fn() }));
vi.mock("@/server/ai/database", () => ({ aiButlerRepository: mocks.repository }));
import { saveAiButlerSetting, testAiButler } from "../app/(dashboard)/dashboard/settings/digital-butler/ai-actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ id: "synthetic-owner", role: "OWNER" });
  mocks.store.mockResolvedValue("ai-preview-steamfoot");
  mocks.entitlement.mockResolvedValue(undefined);
  mocks.repository.mockReturnValue({ saveSetting: mocks.save, handoff: mocks.handoff });
  mocks.save.mockResolvedValue({ setting: DEFAULT_AI_SETTING, revision: 1 });
});
describe("AI server action trust boundary", () => {
  it("derives the store from the verified staff scope and checks independent AI entitlement", async () => {
    const result = await saveAiButlerSetting({ setting: DEFAULT_AI_SETTING, revision: 0 });
    expect(result.success).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("plans.edit");
    expect(mocks.entitlement).toHaveBeenCalledWith("ai-preview-steamfoot", "ai_digital_butler");
    expect(mocks.save).toHaveBeenCalledWith("ai-preview-steamfoot", DEFAULT_AI_SETTING, 0, expect.any(Date));
  });
  it("rejects submitted store scope and arbitrary test text before database access", async () => {
    expect((await saveAiButlerSetting({ setting: DEFAULT_AI_SETTING, revision: 0, storeId: "foreign" } as never)).success).toBe(false);
    expect((await testAiButler({ eventId: "f1ce29a0-865e-4d89-8658-e0e18173d08c", scenario: "hours", module: "STEAMFOOT", provider: "mock", text: "private customer data" } as never)).success).toBe(false);
    expect(mocks.repository).not.toHaveBeenCalled();
  });
  it.each([null, "__all__", "real-store"])("does not permit non-synthetic scope %s", async store => {
    mocks.store.mockResolvedValue(store);
    expect((await saveAiButlerSetting({ setting: DEFAULT_AI_SETTING, revision: 0 })).success).toBe(false);
    expect(mocks.repository).not.toHaveBeenCalled();
  });
  it("denied permission or HQ entitlement prevents mutations and does not echo raw errors", async () => {
    mocks.permission.mockRejectedValueOnce(new Error("synthetic-secret"));
    const result = await saveAiButlerSetting({ setting: DEFAULT_AI_SETTING, revision: 0 });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    mocks.entitlement.mockRejectedValueOnce(new Error("not entitled"));
    expect((await saveAiButlerSetting({ setting: DEFAULT_AI_SETTING, revision: 0 })).success).toBe(false);
    expect(mocks.repository).not.toHaveBeenCalled();
  });
});
