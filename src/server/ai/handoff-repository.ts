import "server-only";
import { createHmac } from "node:crypto";
import { AiOwnerHandoffRepository } from "./owner-handoff-repository";
import type { AiDatabase } from "./repository";
function storeScope(storeId: string) {
  if (!/^ai-preview-(steamfoot|beauty|fitness|music)$/.test(storeId)) throw new Error("AI_SYNTHETIC_STORE_REQUIRED");
}
function hash(secret: string, parts: string[]) {
  if (secret.length < 32) throw new Error("AI_IDENTITY_REQUIRED");
  return createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
}
export function aiHandoffViewKey(storeId: string, actorId: string, secret: string) {
  storeScope(storeId);
  if (!actorId) throw new Error("AI_IDENTITY_REQUIRED");
  return hash(secret, ["ai-handoff-view", storeId, actorId]);
}
export function aiHandoffCommandKeys(storeId: string, actorId: string, commandId: string, secret: string) {
  return { actorKey: hash(secret, ["ai-handoff-operator", storeId, actorId]),
    commandKey: hash(secret, [aiHandoffViewKey(storeId, actorId, secret), commandId]) };
}
export class AiHandoffRepository {
  private readonly core: AiOwnerHandoffRepository;
  constructor(db: AiDatabase) { this.core = new AiOwnerHandoffRepository(db, "STORE", storeScope); }
  list(storeId: string, after?: string) { return this.core.list(storeId, after); }
  resume(input: { storeId: string; scopeKey: string; revision: number; actorKey: string; commandKey: string }, now: Date, authorize: () => Promise<void>) {
    const { storeId, ...rest } = input;
    return this.core.resume({ ...rest, ownerId: storeId }, now, authorize);
  }
}
