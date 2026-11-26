import "server-only";
import { AiRoutingCore } from "./routing-core";
import { aiIdentity, type TrustedAiScope } from "./identity";
import type { AiButlerRepository, AiIdentity } from "./repository";
import type { AiRoutingRepository } from "./routing-repository";
import type { AiChannel } from "./contracts";
export class AiButlerRouting extends AiRoutingCore<TrustedAiScope, AiIdentity> {
  constructor(receipts: AiRoutingRepository, conversations: AiButlerRepository, secret: string, clock = () => new Date(), channels: readonly AiChannel[] = ["TEST"]) {
    super(receipts, conversations, secret, clock, channels, { capture: scope => Object.freeze({ ...scope }), identity: aiIdentity, namespace: scope => scope.module });
  }
}
