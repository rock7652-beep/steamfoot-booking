import "server-only";
import { AiOwnerRoutingRepository } from "./owner-routing-repository";
import { storeOwnerIdentity, type AiDatabase, type AiIdentity } from "./repository";
export class AiRoutingRepository {
  private readonly core: AiOwnerRoutingRepository;
  constructor(db: AiDatabase) { this.core = new AiOwnerRoutingRepository(db, "STORE"); }
  claim(id: AiIdentity, fingerprint: string, interrupt: boolean, now: Date) { return this.core.claim(storeOwnerIdentity(id), fingerprint, interrupt, now); }
  finish(id: AiIdentity, revision: number, route: string, outcome: string, handoff: boolean, now: Date) { return this.core.finish(storeOwnerIdentity(id), revision, route, outcome, handoff, now); }
  unknown(id: AiIdentity, now: Date) { return this.core.unknown(storeOwnerIdentity(id), now); }
  globalStopped() { return this.core.globalStopped(); }
}
