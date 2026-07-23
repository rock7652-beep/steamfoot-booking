import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  conversationFindFirst: vi.fn(),
  stepFindFirst: vi.fn(),
  answerUpsert: vi.fn(),
  leadUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => h.transaction(callback),
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
});
