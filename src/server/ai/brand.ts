import "server-only";
import { AiServiceCore } from "./service-core";
import { AiRoutingCore } from "./routing-core";
import { AiOwnerRepository, assertAiOwnerEntitlement, type AiDatabase, type AiOwnerIdentity } from "./owner-repository";
import { AiOwnerRoutingRepository } from "./owner-routing-repository";
import { AiOwnerHandoffRepository } from "./owner-handoff-repository";
import { AiOwnerKnowledgeRepository } from "./owner-knowledge-repository";
import { brandIdentity, brandScopeSchema, type TrustedBrandScope } from "./principal";
import { selectBrandKnowledge, validateBrandDraft, type AiBrandKnowledge, type AiBrandSnapshot } from "./brand-knowledge";
import type { AiProvider, AiRate } from "./provider";
import type { AiModel } from "./contracts";

/** Explicit dependency injection only. No route, sender, credentials, Store fallback or automatic activation. */
export function createBrandAi(input: {
  serviceId: string; database: AiDatabase; provider: AiProvider; identitySecret: string;
  authorize(scope: TrustedBrandScope): Promise<void>;
  authorizeOperator(operation: "KNOWLEDGE_READ" | "KNOWLEDGE_WRITE" | "HANDOFF_READ" | "HANDOFF_RESUME" | "SETTINGS_READ" | "SETTINGS_WRITE"): Promise<void>;
  rateForModel(model: AiModel): AiRate | null;
  enabled?: () => boolean; clock?: () => Date;
}) {
  input = Object.freeze({ ...input });
  const capture = (scope: TrustedBrandScope) => { const parsed = brandScopeSchema.parse(scope); return Object.freeze({ ...parsed, principal: Object.freeze(parsed.principal) }); };
  const assertOwner = (ownerId: string) => {
    brandScopeSchema.shape.principal.parse({ kind: "BRAND", serviceId: ownerId });
    if (ownerId !== input.serviceId) throw new Error("AI_OWNER_MISMATCH");
  };
  assertOwner(input.serviceId);
  const authorize = async (scope: TrustedBrandScope) => {
    const parsed = capture(scope);
    assertOwner(parsed.principal.serviceId);
    await input.authorize(parsed);
    await assertAiOwnerEntitlement(repository.db, parsed.principal.serviceId, clock());
  };
  const repository = new AiOwnerRepository(input.database, "BRAND");
  const receipts = new AiOwnerRoutingRepository(input.database, "BRAND");
  const clock = input.clock ?? (() => new Date());
  const service = new AiServiceCore<TrustedBrandScope, AiOwnerIdentity, AiBrandKnowledge, AiBrandSnapshot>(
    repository, input.provider, authorize, input.identitySecret, input.rateForModel, input.enabled ?? (() => false), clock, ["TEST"], {
      handoffText: "這個問題目前無法確認，請由真人客服協助您。", stoppedText: "AI 目前暫停服務。",
      capture, identity: brandIdentity, ownerId: scope => scope.principal.serviceId, select: selectBrandKnowledge,
      matches: (scope, snapshot) => scope.principal.serviceId === snapshot.serviceId,
    });
  const routing = new AiRoutingCore<TrustedBrandScope, AiOwnerIdentity>(receipts, repository, input.identitySecret, clock, ["TEST"], {
    capture, identity: brandIdentity, namespace: scope => `BRAND:${scope.principal.serviceId}`,
  });
  // Owner-bound facade prevents accidental management of another brand by this adapter.
  const knowledge = new AiOwnerKnowledgeRepository(input.database, "BRAND", validateBrandDraft);
  const handoff = new AiOwnerHandoffRepository(input.database, "BRAND", assertOwner);
  return {
    service,
    routing: { respond: (scope: TrustedBrandScope, eventId: string, scenario: string, message: string, ports: import("./routing-core").AiRoutingPorts<TrustedBrandScope>) =>
      routing.respond(scope, eventId, scenario, message, { ...ports, authorize: async s => { await authorize(s); await ports.authorize(s); } }) },
    settings: { read: async () => { await input.authorizeOperator("SETTINGS_READ"); return repository.setting(input.serviceId); },
      save: async (setting: import("./contracts").AiSetting, revision: number, now: Date) => { await input.authorizeOperator("SETTINGS_WRITE"); return repository.saveSetting(input.serviceId, setting, revision, now); } },
    knowledge: { read: async () => { await input.authorizeOperator("KNOWLEDGE_READ"); return knowledge.read(input.serviceId); },
      change: async (...args: Parameters<typeof knowledge.change> extends [string, ...infer Rest] ? Rest : never) => { await input.authorizeOperator("KNOWLEDGE_WRITE"); return knowledge.change(input.serviceId, ...args); } },
    handoff: { list: async (after?: string) => { await input.authorizeOperator("HANDOFF_READ"); return handoff.list(input.serviceId, after); },
      resume: (command: Omit<Parameters<typeof handoff.resume>[0], "ownerId">, now: Date, authorizeOperator: () => Promise<void>) => handoff.resume({ ...command, ownerId: input.serviceId }, now, async () => { await input.authorizeOperator("HANDOFF_RESUME"); await authorizeOperator(); }) },
  };
}
