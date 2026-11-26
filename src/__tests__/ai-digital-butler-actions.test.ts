import { beforeEach, describe, it, expect, vi } from "vitest";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), entitlement: vi.fn(), save: vi.fn(), handoff: vi.fn(), repository: vi.fn(), knowledgeRead: vi.fn(), knowledgeChange: vi.fn(), authority: vi.fn(), queueResume: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mocks.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: mocks.entitlement }));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs", () => ({ assertAiPreview: vi.fn() }));
vi.mock("@/server/ai/database", () => ({ aiButlerRepository: mocks.repository, aiButlerDatabase: vi.fn() }));
vi.mock("@/server/ai/knowledge-repository", () => ({ AiKnowledgeRepository: class { read = mocks.knowledgeRead; change = mocks.knowledgeChange; } }));
vi.mock("@/server/ai/knowledge-sources", () => ({ readAiAuthority: mocks.authority }));
vi.mock("@/server/ai/handoff-repository", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/ai/handoff-repository")>();
  return { ...actual, AiHandoffRepository: class { resume = mocks.queueResume; } };
});
import { aiHandoffViewKey } from "@/server/ai/handoff-repository";
import { EMPTY_AI_KNOWLEDGE } from "@/server/ai/knowledge-document";
import { saveAiButlerSetting, testAiButler, changeAiButlerKnowledge, readAiButlerKnowledge, testAiButlerRouting, setAiButlerRoutingHandoff, resumeAiButlerConversation } from "../app/(dashboard)/dashboard/settings/digital-butler/ai-actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ id: "synthetic-owner", role: "OWNER" });
  mocks.store.mockResolvedValue("ai-preview-steamfoot");
  mocks.entitlement.mockResolvedValue(undefined);
  mocks.repository.mockReturnValue({ saveSetting: mocks.save, handoff: mocks.handoff });
  mocks.save.mockResolvedValue({ setting: DEFAULT_AI_SETTING, revision: 1 });
  vi.stubEnv("AI_IDENTITY_SECRET", "s".repeat(40));
  mocks.queueResume.mockImplementation(async (...args: unknown[]) => { await (args[2] as () => Promise<void>)(); return { duplicate: false, revision: 2 }; });
});

const resumeInput = () => ({ commandId: "f1ce29a0-865e-4d89-8658-e0e18173d08c", scopeKey: "a".repeat(64), revision: 1,
  viewKey: aiHandoffViewKey("ai-preview-steamfoot", "synthetic-owner", "s".repeat(40)) });
it("operator resume verifies current writable scope again before the serialized mutation", async () => {
  expect(await resumeAiButlerConversation(resumeInput())).toEqual({ success: true, duplicate: false });
  expect(mocks.permission).toHaveBeenCalledWith("plans.edit");
  expect(mocks.queueResume.mock.calls[0][0]).toMatchObject({ storeId: "ai-preview-steamfoot", scopeKey: "a".repeat(64), revision: 1 });
  expect(mocks.permission).toHaveBeenCalledTimes(3);
});
it("operator input cannot override the tenant, and stale view proofs never reach persistence", async () => {
  expect((await resumeAiButlerConversation({ ...resumeInput(), storeId: "foreign" } as never)).success).toBe(false);
  expect((await resumeAiButlerConversation({ ...resumeInput(), viewKey: "b".repeat(64) })).success).toBe(false);
  expect(mocks.queueResume).not.toHaveBeenCalled();
});
it("switching actor after the initial guard rejects the mutation", async () => {
  mocks.permission.mockResolvedValueOnce({ id: "synthetic-owner" }).mockResolvedValueOnce({ id: "synthetic-owner" }).mockResolvedValueOnce({ id: "other-actor" });
  expect(await resumeAiButlerConversation(resumeInput())).toMatchObject({ success: false, uncertain: false });
});
it.each(["AI_HANDOFF_CONFLICT", "AI_HANDOFF_REVIEW_REQUIRED"])("known operator failure %s is safe to reload", async code => {
  mocks.queueResume.mockRejectedValueOnce(new Error(code));
  expect(await resumeAiButlerConversation(resumeInput())).toMatchObject({ success: false, uncertain: false });
});
it("unclassified operator failure retains the command and never echoes SQL or credentials", async () => {
  mocks.queueResume.mockRejectedValueOnce(new Error("private-sql-secret"));
  const result = await resumeAiButlerConversation(resumeInput());
  expect(result).toMatchObject({ success: false, uncertain: true }); expect(JSON.stringify(result)).not.toContain("private-sql-secret");
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


it("publishes the saved revision using the runtime projection module and verified store", async () => {
  mocks.knowledgeRead.mockResolvedValue({ draft: { ...EMPTY_AI_KNOWLEDGE, introduction: "合成介紹" }, published: null, revision: 1, publishedVersion: 0, publishedAt: null });
  mocks.authority.mockResolvedValue({ module: "STEAMFOOT", hours: null, services: null, prices: null });
  mocks.knowledgeChange.mockResolvedValue({ revision: 2 });
  expect((await changeAiButlerKnowledge({ command: "publish", revision: 1 })).success).toBe(true);
  expect(mocks.knowledgeChange).toHaveBeenCalledWith("ai-preview-steamfoot", 1, "publish", undefined);
});
it("knowledge read and publish reject denied permissions, foreign scope and unavailable references", async () => {
  mocks.permission.mockRejectedValueOnce(new Error("denied"));
  expect((await readAiButlerKnowledge()).success).toBe(false);
  expect(mocks.knowledgeRead).not.toHaveBeenCalled();
  expect((await changeAiButlerKnowledge({ command: "publish", revision: 1, storeId: "foreign" } as never)).success).toBe(false);
  expect(mocks.knowledgeChange).not.toHaveBeenCalled();
  mocks.knowledgeRead.mockResolvedValue({ draft: { ...EMPTY_AI_KNOWLEDGE, references: { hours: true, services: false, prices: false } }, published: null, revision: 1, publishedVersion: 0, publishedAt: null });
  mocks.authority.mockResolvedValue({ module: "STEAMFOOT", hours: null, services: null, prices: null });
  const result = await changeAiButlerKnowledge({ command: "publish", revision: 1 });
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("引用來源") });
  expect(mocks.knowledgeChange).not.toHaveBeenCalled();
});

it("routing only accepts fixed Mock scenarios and derives permission-bound scope", async()=>{
  for(const extra of [{provider:"openai"},{storeId:"foreign"},{module:"MUSIC"},{question:"private"}])
    expect((await testAiButlerRouting({eventId:"f1ce29a0-865e-4d89-8658-e0e18173d08c",scenario:"known",...extra} as never)).success).toBe(false);
  expect(mocks.repository).not.toHaveBeenCalled();
  mocks.permission.mockRejectedValueOnce(new Error("private-error"));
  const result=await setAiButlerRoutingHandoff(true);expect(result.success).toBe(false);expect(JSON.stringify(result)).not.toContain("private-error");
  expect(mocks.repository).not.toHaveBeenCalled();
});
