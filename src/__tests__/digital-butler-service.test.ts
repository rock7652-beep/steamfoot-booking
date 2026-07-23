import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digital-butler-entitlement", () => ({
  requireDigitalButlerEntitlement: vi.fn(),
}));

import { DigitalButlerService } from "@/server/services/digital-butler";

const repository = {
  createDraftFlow: vi.fn(),
  getFlow: vi.fn(),
  upsertPhoneAnswer: vi.fn(),
  createLead: vi.fn(),
};
const gate = { requireEntitledStore: vi.fn() };

describe("DigitalButlerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64url");
  });

  it("checks the HQ entitlement before every store-scoped operation", async () => {
    const service = new DigitalButlerService(repository as never, gate);
    await service.createDraftFlow({ storeId: "store-a", name: "draft", draftDefinition: {} });
    await service.getFlow("store-a", "flow-a");
    await service.recordPhoneAnswer({
      storeId: "store-a", conversationId: "conversation-a", stepId: "step-a", normalizedPhone: "0912345678",
    });
    await service.createLead({
      storeId: "store-a", flowId: "flow-a", conversationId: "conversation-a", completionActionKey: "complete", submittedAnswers: {},
    });
    expect(gate.requireEntitledStore).toHaveBeenNthCalledWith(1, "store-a");
    expect(gate.requireEntitledStore).toHaveBeenNthCalledWith(4, "store-a");
  });

  it("never forwards a plaintext phone to the repository", async () => {
    const service = new DigitalButlerService(repository as never, gate);
    await service.recordPhoneAnswer({
      storeId: "store-a", conversationId: "conversation-a", stepId: "step-a", normalizedPhone: "0912345678",
    });
    const input = repository.upsertPhoneAnswer.mock.calls[0][0];
    expect(input).not.toHaveProperty("normalizedPhone");
    expect(input.phoneHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.encryptedPhone.ciphertext.equals(Buffer.from("0912345678"))).toBe(false);
  });

  it("rejects sensitive submittedAnswers before a lead can reach persistence", async () => {
    const service = new DigitalButlerService(repository as never, gate);
    await expect(service.createLead({
      storeId: "store-a", flowId: "flow-a", conversationId: "conversation-a", completionActionKey: "complete",
      submittedAnswers: { phone: "0912345678" },
    })).rejects.toThrow("DIGITAL_BUTLER_SENSITIVE_ANSWER_JSON_REJECTED");
    expect(repository.createLead).not.toHaveBeenCalled();
  });

  it("rejects missing store scope before database access", async () => {
    const service = new DigitalButlerService(repository as never, gate);
    await expect(service.getFlow("  ", "flow-a")).rejects.toThrow("DIGITAL_BUTLER_STORE_ID_REQUIRED");
    expect(gate.requireEntitledStore).not.toHaveBeenCalled();
    expect(repository.getFlow).not.toHaveBeenCalled();
  });
});
