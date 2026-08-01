import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(), aggregate: vi.fn(), publishFlow: vi.fn(),
  PrismaError: class PrismaError extends Error {
    code: string;
    constructor(message: string, input: { code: string }) {
      super(message);
      this.code = input.code;
    }
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: h.PrismaError },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    storeDigitalButlerFlow: { findMany: h.findMany },
    digitalButlerFlowVersion: { aggregate: h.aggregate },
  },
}));

vi.mock("@/server/repositories/digital-butler", () => ({
  DigitalButlerRepository: class { publishFlow = h.publishFlow; },
  DigitalButlerScopeError: class DigitalButlerScopeError extends Error {},
}));

import {
  applyZhubeiMessengerV13Publish,
  classifyZhubeiV13PublishFailure,
  ZhubeiV13PublishError,
} from "@/server/services/zhubei-messenger-v13-publish";
import { DigitalButlerDefinitionError } from "@/lib/digital-butler-flow-definition";

const definition = {
  trigger: { keywords: ["我想了解蒸足"] },
  steps: [
    { stepKey: "menu", type: "SINGLE_CHOICE", config: { text: "請選擇", options: [{ label: "我想預約體驗", value: "BOOKING", nextStepKey: "inquiry-name" }, { label: "請店家聯絡我", value: "CONTACT_STORE", nextStepKey: "inquiry-name" }] } },
    { stepKey: "inquiry-name", type: "FREE_TEXT", required: true, config: { text: "姓名", nextStepKey: "inquiry-phone" } },
    { stepKey: "inquiry-phone", type: "TAIWAN_MOBILE", required: true, config: { text: "手機", nextStepKey: "inquiry-create-lead" } },
    { stepKey: "inquiry-create-lead", type: "CREATE_LEAD", config: { requireCompleteContact: true, nameStepKey: "inquiry-name", phoneStepKey: "inquiry-phone", nextStepKey: "complete" } },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

function publishedVersion(value = definition) {
  return {
    id: "version-12", version: 12, definition: value,
    steps: value.steps.map((step) => ({ stepKey: step.stepKey, type: step.type, config: step.config })),
  };
}

function setCandidate(value = definition, max = 12) {
  h.findMany.mockResolvedValue([{ id: "flow-zhubei", name: "Messenger", storeId: "store-zhubei", currentPublishedVersionId: "version-12", publishedVersion: publishedVersion(value) }]);
  h.aggregate.mockResolvedValue({ _max: { version: max } });
}

describe("Zhubei Messenger v13 publish service diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCandidate();
    h.publishFlow.mockResolvedValue({ id: "version-13", version: 13 });
  });

  it("passes only the repaired immutable definition to the publish transaction", async () => {
    await expect(applyZhubeiMessengerV13Publish({ storeId: "store-zhubei", actorUserId: "owner-1" }))
      .resolves.toMatchObject({ result: "PUBLISHED", version: { id: "version-13", version: 13 } });
    expect(h.publishFlow).toHaveBeenCalledTimes(1);
    const input = h.publishFlow.mock.calls[0]?.[0];
    expect(input.definition.steps.find((step: { stepKey: string }) => step.stepKey === "inquiry-create-lead").config)
      .toMatchObject({ requestTypeFromStepKey: "menu" });
    expect(definition.steps.find((step) => step.stepKey === "inquiry-create-lead")?.config)
      .not.toHaveProperty("requestTypeFromStepKey");
  });

  it("publishes a normalized clone for the known v12 legacy required flags", async () => {
    const legacy = structuredClone(definition);
    const name = legacy.steps.find((step) => step.stepKey === "inquiry-name");
    const phone = legacy.steps.find((step) => step.stepKey === "inquiry-phone");
    if (!name || !phone) throw new Error("fixture is missing legacy contact steps");
    delete name.required;
    delete phone.required;
    setCandidate(legacy);

    await applyZhubeiMessengerV13Publish({ storeId: "store-zhubei", actorUserId: "owner-1" });

    const input = h.publishFlow.mock.calls[0]?.[0];
    expect(input.definition.steps.find((step: { stepKey: string }) => step.stepKey === "inquiry-name").required).toBe(true);
    expect(input.definition.steps.find((step: { stepKey: string }) => step.stepKey === "inquiry-phone").required).toBe(true);
    expect(legacy.steps.find((step) => step.stepKey === "inquiry-name")).not.toHaveProperty("required");
    expect(legacy.steps.find((step) => step.stepKey === "inquiry-phone")).not.toHaveProperty("required");
  });

  it("does not start a publish transaction when the active version is already upgraded", async () => {
    const upgraded = structuredClone(definition);
    const createLead = upgraded.steps.find((step) => step.stepKey === "inquiry-create-lead") as { config: Record<string, unknown> } | undefined;
    if (!createLead) throw new Error("fixture is missing inquiry-create-lead");
    createLead.config.requestTypeFromStepKey = "menu";
    setCandidate(upgraded);

    await expect(applyZhubeiMessengerV13Publish({ storeId: "store-zhubei", actorUserId: "owner-1" }))
      .resolves.toMatchObject({ result: "ALREADY_UPGRADED", version: { version: 12 } });
    expect(h.publishFlow).not.toHaveBeenCalled();
  });

  it("classifies a lock-time precondition change without exposing its detail", async () => {
    h.publishFlow.mockRejectedValue(new ZhubeiV13PublishError("ZHUBEI_V13_PRECONDITION_CHANGED"));
    const error = await applyZhubeiMessengerV13Publish({ storeId: "store-zhubei", actorUserId: "owner-1" }).catch((value) => value);
    expect(classifyZhubeiV13PublishFailure(error)).toBe("PRECONDITION_CHANGED");
  });

  it("classifies invalid definitions, database constraints, and transaction failures", () => {
    expect(classifyZhubeiV13PublishFailure(new DigitalButlerDefinitionError("流程格式不正確"))).toBe("DEFINITION_INVALID");
    expect(classifyZhubeiV13PublishFailure(new Error("ZHUBEI_INQUIRY_CREATE_LEAD_STEP_NOT_FOUND"))).toBe("DEFINITION_INVALID");
    expect(classifyZhubeiV13PublishFailure(new h.PrismaError("unique", { code: "P2002" }))).toBe("DATABASE_CONSTRAINT");
    expect(classifyZhubeiV13PublishFailure(new h.PrismaError("conflict", { code: "P2034" }))).toBe("TRANSACTION_FAILED");
  });
});
