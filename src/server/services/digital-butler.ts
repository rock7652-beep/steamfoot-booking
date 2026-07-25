import { Prisma } from "@prisma/client";
import { hashDigitalButlerSensitiveValue, encryptDigitalButlerValue } from "@/lib/digital-butler-crypto";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import { assertDigitalButlerSubmittedAnswersSafe } from "@/lib/digital-butler-sensitive-json";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";
import {
  DigitalButlerRepository,
  type CreateDigitalButlerDraftFlowInput,
  type CreateDigitalButlerLeadInput,
  type UpsertDigitalButlerPhoneAnswerInput,
} from "@/server/repositories/digital-butler";

type EntitlementGate = { requireEntitledStore(storeId: string): Promise<void> };
type Repository = Pick<
  DigitalButlerRepository,
  "createDraftFlow" | "getFlow" | "listFlows" | "updateDraft" | "publishFlow" | "setFlowEnabled" | "upsertPhoneAnswer" | "createLead"
>;

const productionGate: EntitlementGate = {
  requireEntitledStore: requireDigitalButlerEntitlement,
};

function requiredStoreId(storeId: string): void {
  if (!storeId.trim()) throw new Error("DIGITAL_BUTLER_STORE_ID_REQUIRED");
}

/**
 * PR-1 domain service. There is deliberately no public Action or webhook call
 * path yet: later PRs must use this service so the entitlement is rechecked
 * before every sensitive write and no cross-store ID can escape its scope.
 */
export class DigitalButlerService {
  constructor(
    private readonly repository: Repository = new DigitalButlerRepository(),
    private readonly entitlementGate: EntitlementGate = productionGate,
  ) {}

  async createDraftFlow(input: CreateDigitalButlerDraftFlowInput) {
    requiredStoreId(input.storeId);
    await this.entitlementGate.requireEntitledStore(input.storeId);
    return this.repository.createDraftFlow(input);
  }

  async getFlow(storeId: string, flowId: string) {
    requiredStoreId(storeId);
    await this.entitlementGate.requireEntitledStore(storeId);
    return this.repository.getFlow(storeId, flowId);
  }

  async listFlows(storeId: string) {
    requiredStoreId(storeId);
    await this.entitlementGate.requireEntitledStore(storeId);
    return this.repository.listFlows(storeId);
  }

  async updateDraft(storeId: string, flowId: string, name: string, draftDefinition: Prisma.JsonValue) {
    requiredStoreId(storeId);
    await this.entitlementGate.requireEntitledStore(storeId);
    if (!name.trim()) throw new Error("DIGITAL_BUTLER_FLOW_NAME_REQUIRED");
    parseDigitalButlerDraftDefinition(draftDefinition);
    await this.repository.updateDraft(storeId, flowId, {
      name: name.trim(),
      draftDefinition: draftDefinition as Prisma.InputJsonValue,
    });
  }

  async publishFlow(storeId: string, flowId: string) {
    requiredStoreId(storeId);
    await this.entitlementGate.requireEntitledStore(storeId);
    const flow = await this.repository.getFlow(storeId, flowId);
    if (!flow) throw new Error("DIGITAL_BUTLER_FLOW_NOT_FOUND");
    const definition = flow.draftDefinition;
    if (!definition) throw new Error("DIGITAL_BUTLER_DRAFT_REQUIRED");
    const parsed = parseDigitalButlerDraftDefinition(definition);
    return this.repository.publishFlow({
      storeId,
      flowId,
      definition: parsed as unknown as Prisma.InputJsonValue,
      steps: parsed.steps.map((step, position) => ({
        stepKey: step.stepKey,
        position,
        type: step.type,
        config: step.config as Prisma.InputJsonValue,
        required: step.required ?? false,
      })),
    });
  }

  async setFlowEnabled(storeId: string, flowId: string, enabled: boolean) {
    requiredStoreId(storeId);
    await this.entitlementGate.requireEntitledStore(storeId);
    await this.repository.setFlowEnabled(storeId, flowId, enabled);
  }

  async recordPhoneAnswer(input: Omit<UpsertDigitalButlerPhoneAnswerInput, "encryptedPhone" | "phoneHash"> & { normalizedPhone: string }) {
    requiredStoreId(input.storeId);
    await this.entitlementGate.requireEntitledStore(input.storeId);
    const { normalizedPhone, ...repositoryInput } = input;
    const encryptedPhone = encryptDigitalButlerValue(normalizedPhone);
    return this.repository.upsertPhoneAnswer({
      ...repositoryInput,
      encryptedPhone,
      phoneHash: hashDigitalButlerSensitiveValue(normalizedPhone),
    });
  }

  async createLead(input: Omit<CreateDigitalButlerLeadInput, "encryptedPhone" | "phoneHash"> & { normalizedPhone?: string }) {
    requiredStoreId(input.storeId);
    await this.entitlementGate.requireEntitledStore(input.storeId);
    const { normalizedPhone, ...repositoryInput } = input;
    assertDigitalButlerSubmittedAnswersSafe(repositoryInput.submittedAnswers);
    const encryptedPhone = normalizedPhone
      ? encryptDigitalButlerValue(normalizedPhone)
      : undefined;
    return this.repository.createLead({
      ...repositoryInput,
      encryptedPhone,
      phoneHash: normalizedPhone
        ? hashDigitalButlerSensitiveValue(normalizedPhone)
        : undefined,
    });
  }
}
