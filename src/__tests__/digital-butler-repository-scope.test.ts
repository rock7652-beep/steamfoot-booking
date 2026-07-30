import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  conversationFindFirst: vi.fn(),
  stepFindFirst: vi.fn(),
  answerUpsert: vi.fn(),
  leadUpsert: vi.fn(),
  flowUpdateMany: vi.fn(),
  flowVersionAggregate: vi.fn(),
  flowVersionCreate: vi.fn(),
  flowUpdate: vi.fn(),
  flowFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => h.transaction(callback),
    storeDigitalButlerFlow: { findMany: h.flowFindMany },
  },
}));

import { DigitalButlerRepository, DigitalButlerScopeError } from "@/server/repositories/digital-butler";

function encryptedPhone() {
  return {
    ciphertext: Buffer.from("encrypted"),
    iv: Buffer.alloc(12, 1),
    authTag: Buffer.alloc(16, 2),
    keyVersion: "v1" as const,
  };
}

describe("DigitalButlerRepository cross-store isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.transaction.mockImplementation((callback) => callback({
      digitalButlerConversation: { findFirst: h.conversationFindFirst },
      digitalButlerStep: { findFirst: h.stepFindFirst },
      digitalButlerAnswer: { upsert: h.answerUpsert },
      digitalButlerLead: { upsert: h.leadUpsert },
      storeDigitalButlerFlow: { updateMany: h.flowUpdateMany, update: h.flowUpdate },
      digitalButlerFlowVersion: { aggregate: h.flowVersionAggregate, create: h.flowVersionCreate },
    }));
  });

  it("does not write a phone answer when the conversation is outside the requested store", async () => {
    h.conversationFindFirst.mockResolvedValue(null);
    const repository = new DigitalButlerRepository();
    await expect(repository.upsertPhoneAnswer({
      storeId: "store-a", conversationId: "conversation-from-store-b", stepId: "step-b",
      encryptedPhone: encryptedPhone(), phoneHash: "fingerprint",
    })).rejects.toThrow(DigitalButlerScopeError);
    expect(h.conversationFindFirst).toHaveBeenCalledWith({
      where: { id: "conversation-from-store-b", storeId: "store-a" },
      select: { id: true, flowVersionId: true },
    });
    expect(h.answerUpsert).not.toHaveBeenCalled();
  });

  it("requires flow, conversation, and store to match before an idempotent lead write", async () => {
    h.conversationFindFirst.mockResolvedValue(null);
    const repository = new DigitalButlerRepository();
    await expect(repository.createLead({
      storeId: "store-a", flowId: "flow-b", conversationId: "conversation-b",
      completionActionKey: "complete", submittedAnswers: {},
    })).rejects.toThrow(DigitalButlerScopeError);
    expect(h.conversationFindFirst).toHaveBeenCalledWith({
      where: { id: "conversation-b", storeId: "store-a", flowId: "flow-b" },
      select: { id: true },
    });
    expect(h.leadUpsert).not.toHaveBeenCalled();
  });

  it("rejects direct repository calls that try to persist plaintext contact data in JSON", async () => {
    const repository = new DigitalButlerRepository();
    await expect(repository.createLead({
      storeId: "store-a", flowId: "flow-a", conversationId: "conversation-a",
      completionActionKey: "complete", submittedAnswers: { mobile: "0912345678" },
    })).rejects.toThrow("DIGITAL_BUTLER_SENSITIVE_ANSWER_JSON_REJECTED");
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("locks the scoped flow and creates a Prisma-valid published version", async () => {
    h.flowUpdateMany.mockResolvedValue({ count: 1 });
    h.flowVersionAggregate.mockResolvedValue({ _max: { version: 5 } });
    h.flowVersionCreate.mockResolvedValue({ id: "version-6", version: 6 });
    h.flowUpdate.mockResolvedValue({});

    const repository = new DigitalButlerRepository();
    await repository.publishFlow({
      storeId: "store-a",
      flowId: "flow-a",
      definition: { trigger: { keywords: ["測試"] }, steps: [] },
      steps: [
        { stepKey: "opening", position: 0, type: "TEXT", config: { text: "您好" }, required: false },
        { stepKey: "name", position: 1, type: "FREE_TEXT", config: { text: "姓名" }, required: true },
        { stepKey: "create-lead", position: 2, type: "CREATE_LEAD", config: {}, required: false },
        { stepKey: "complete", position: 3, type: "COMPLETE_FLOW", config: {}, required: false },
      ],
    });

    expect(h.flowUpdateMany).toHaveBeenCalledWith({
      where: { id: "flow-a", storeId: "store-a", status: { not: "ARCHIVED" } },
      data: { updatedAt: expect.any(Date) },
    });
    expect(h.flowVersionAggregate).toHaveBeenCalledWith({
      where: { flowId: "flow-a", storeId: "store-a" },
      _max: { version: true },
    });
    expect(h.flowVersionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ flowId: "flow-a", version: 6 }),
    }));
    const createData = h.flowVersionCreate.mock.calls[0][0].data;
    expect(createData.steps.create).toEqual([
      expect.objectContaining({ stepKey: "opening", position: 0, type: "TEXT" }),
      expect.objectContaining({ stepKey: "name", position: 1, type: "FREE_TEXT" }),
      expect.objectContaining({ stepKey: "create-lead", position: 2, type: "CREATE_LEAD" }),
      expect.objectContaining({ stepKey: "complete", position: 3, type: "COMPLETE_FLOW" }),
    ]);
    expect(createData.steps.create).not.toContainEqual(expect.objectContaining({ storeId: expect.anything() }));
  });

  it("runs an upgrade precondition after acquiring the scoped publish lock", async () => {
    h.flowUpdateMany.mockResolvedValue({ count: 1 });
    h.flowVersionAggregate.mockResolvedValue({ _max: { version: 12 } });
    h.flowVersionCreate.mockResolvedValue({ id: "version-13", version: 13, steps: [] });
    h.flowUpdate.mockResolvedValue({});
    const beforePublish = vi.fn().mockResolvedValue(undefined);
    await new DigitalButlerRepository().publishFlow({
      storeId: "store-a", flowId: "flow-a", definition: { trigger: { keywords: ["測試"] }, steps: [] }, steps: [], beforePublish,
    });
    expect(beforePublish).toHaveBeenCalledTimes(1);
    expect(beforePublish.mock.invocationCallOrder[0]).toBeGreaterThan(h.flowUpdateMany.mock.invocationCallOrder[0]);
    expect(beforePublish.mock.invocationCallOrder[0]).toBeLessThan(h.flowVersionAggregate.mock.invocationCallOrder[0]);
  });

  it("loads the published preview from the current version's ordered step rows", async () => {
    h.flowFindMany.mockResolvedValue([]);
    await new DigitalButlerRepository().listFlows("store-a");

    expect(h.flowFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-a", status: { not: "ARCHIVED" } },
      select: expect.objectContaining({
        currentPublishedVersionId: true,
        publishedVersion: {
          select: expect.objectContaining({
            steps: {
              orderBy: { position: "asc" },
              select: { stepKey: true, position: true, type: true, config: true },
            },
          }),
        },
      }),
    }));
  });
});
