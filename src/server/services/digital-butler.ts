import { hashDigitalButlerSensitiveValue, encryptDigitalButlerValue } from "@/lib/digital-butler-crypto";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import {
  DigitalButlerRepository,
  type CreateDigitalButlerDraftFlowInput,
  type CreateDigitalButlerLeadInput,
  type UpsertDigitalButlerPhoneAnswerInput,
} from "@/server/repositories/digital-butler";

type EntitlementGate = { requireEntitledStore(storeId: string): Promise<void> };
type Repository = Pick<
  DigitalButlerRepository,
  "createDraftFlow" | "getFlow" | "upsertPhoneAnswer" | "createLead"
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
