import "server-only";
import { createHmac } from "node:crypto";
import type { AiDatabase, AiIdentity } from "./repository";

/** Reuse private Dispatch ledger; aliases have no pending Conversation of their own. */
export class AiLineReceiptRepository {
  constructor(private readonly db: AiDatabase) {}
  async claim(event: AiIdentity, message: AiIdentity, fingerprint: string, now: Date) {
    if (event.storeId !== message.storeId || event.scopeKey !== message.scopeKey || event.eventKey === message.eventKey ||
      ![event.scopeKey, event.eventKey, message.eventKey, fingerprint].every(key => /^[a-f0-9]{64}$/.test(key))) throw new Error("AI_LINE_RECEIPT_SCOPE_REQUIRED");
    return this.db.transaction(async tx => {
      if ((await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE')).length !== 1) throw new Error("AI_CONTROL_MISSING");
      const prior = await tx.query<{ fingerprint: string; status: string }>('SELECT fingerprint,status FROM "AiButlerDispatch" WHERE "storeId"=$1 AND "scopeKey"=$2 AND "eventKey" IN ($3,$4)', [event.storeId, event.scopeKey, event.eventKey, message.eventKey]);
      if (prior.length) return prior.some(row => row.fingerprint !== fingerprint) ? "EVENT_CONFLICT" : prior.some(row => row.status === "CLAIMED") ? "IN_PROGRESS" : prior.some(row => row.status === "UNKNOWN") ? "RESULT_UNKNOWN" : "DUPLICATE";
      for (const id of [event, message]) await tx.query(`INSERT INTO "AiButlerDispatch" ("storeId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES ($1,$2,$3,$4,0,'CLAIMED',$5::timestamptz)`, [id.storeId, id.scopeKey, id.eventKey, fingerprint, now]);
      return "CLAIMED";
    });
  }
  async finish(event: AiIdentity, message: AiIdentity, unknown: boolean, now: Date) {
    await this.db.query(`UPDATE "AiButlerDispatch" SET status=$5,route='SILENT',outcome=$6,"finishedAt"=$7::timestamptz WHERE "storeId"=$1 AND "scopeKey"=$2 AND "eventKey" IN ($3,$4) AND status='CLAIMED'`,
      [event.storeId, event.scopeKey, event.eventKey, message.eventKey, unknown ? "UNKNOWN" : "COMPLETE", unknown ? "LINE_RESULT_UNKNOWN" : "LINE_PROCESSED", now]);
  }
}
export function aiLineFingerprint(secret: string, parts: unknown[]) {
  if (secret.length < 32) throw new Error("AI_LINE_SECRET_REQUIRED");
  return createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
}
