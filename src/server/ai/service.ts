import "server-only";
import { AiServiceCore } from "./service-core";
import { aiIdentity, type TrustedAiScope } from "./identity";
import { selectAiKnowledge } from "./knowledge";
import type { AiKnowledge, AiChannel } from "./contracts";
import type { AiKnowledgeSnapshot } from "./knowledge-sources";
import type { AiButlerRepository, AiIdentity } from "./repository";
import type { AiProvider, AiRate } from "./provider";
export { aiIdentity, type TrustedAiScope } from "./identity";
export type { AiServiceResult } from "./service-core";
/** Store compatibility adapter; legacy receipt identities remain unchanged. */
export class AiButlerService extends AiServiceCore<TrustedAiScope, AiIdentity, AiKnowledge, AiKnowledgeSnapshot> {
  constructor(repository: AiButlerRepository, provider: AiProvider, authorize: (scope: TrustedAiScope) => Promise<void>, identitySecret: string,
    rateForModel: (model: import("./contracts").AiModel) => AiRate | null, enabled: () => boolean, clock = () => new Date(), channels: readonly AiChannel[] = ["TEST"]) {
    super(repository, provider, authorize, identitySecret, rateForModel, enabled, clock, channels, {
      capture: scope => Object.freeze({ ...scope }),
      identity: aiIdentity, ownerId: scope => scope.storeId,
      select: (scope, records, now) => selectAiKnowledge(scope.storeId, scope.module, records, now),
      matches: (scope, snapshot) => snapshot.module === scope.module,
      selected: (scope, details) => {
        // Preserve the existing synthetic-only diagnostics; no text, actors or credentials.
        if (provider.kind === "openai" && /^ai-preview-(steamfoot|beauty|fitness|music)$/.test(scope.storeId)) console.info("[ai-preview] source_selection", details);
      },
    });
  }
}
