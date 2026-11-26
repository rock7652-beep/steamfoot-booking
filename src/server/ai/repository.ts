import "server-only";
import { AiOwnerRepository, type AiOwnerIdentity, type AiOwnerReservation } from "./owner-repository";
import type { AiSetting } from "./contracts";
export type { AiSql, AiDatabase } from "./owner-repository";
import type { AiDatabase, AiSql } from "./owner-repository";
export type AiIdentity = Omit<AiOwnerIdentity, "ownerId"> & { storeId: string };
export type AiReservation = Omit<AiOwnerReservation, "ownerId"> & { storeId: string };
export const storeOwnerIdentity = <T extends { storeId: string }>(input: T) => {
  const { storeId, ...rest } = input;
  return { ...rest, ownerId: storeId };
};
export async function assertAiStoreEntitlement(tx: AiSql, storeId: string, now?: Date) {
  const rows = await tx.query('SELECT 1 AS allowed FROM "StoreFeatureEntitlement" WHERE "storeId"=$1 AND "featureKey"=\'ai_digital_butler\' AND status=\'ENABLED\' AND ("startsAt" IS NULL OR "startsAt" <= COALESCE($2::timestamptz,CURRENT_TIMESTAMP)) AND ("expiresAt" IS NULL OR "expiresAt" >= COALESCE($2::timestamptz,CURRENT_TIMESTAMP))', [storeId, now ?? null]);
  if (rows.length !== 1) throw new Error("AI_NOT_ENTITLED");
}
/** Compatibility facade: Store callers and persisted receipt keys are unchanged. */
export class AiButlerRepository {
  private readonly core: AiOwnerRepository;
  constructor(readonly db: AiDatabase) { this.core = new AiOwnerRepository(db, "STORE"); }
  setting(storeId: string) { return this.core.setting(storeId); }
  saveSetting(storeId: string, setting: AiSetting, revision: number, now: Date) { return this.core.saveSetting(storeId, setting, revision, now); }
  reserve(input: AiReservation, channel: string) { return this.core.reserve(storeOwnerIdentity(input), channel); }
  settle(input: AiIdentity, result: Parameters<AiOwnerRepository["settle"]>[1], now: Date) { return this.core.settle(storeOwnerIdentity(input), result, now); }
  unknown(input: AiIdentity, now: Date) { return this.core.unknown(storeOwnerIdentity(input), now); }
  handoff(input: Pick<AiIdentity, "storeId" | "scopeKey">, value: boolean, now: Date) { return this.core.handoff(storeOwnerIdentity(input), value, now); }
  conversationState(input: Pick<AiIdentity, "storeId" | "scopeKey">) { return this.core.conversationState(storeOwnerIdentity(input)); }
  usage(storeId: string, now: Date) { return this.core.usage(storeId, now); }
}
