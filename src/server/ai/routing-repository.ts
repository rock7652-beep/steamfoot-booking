import "server-only";
import { AI_LIMITS } from "./contracts";
import type { AiDatabase, AiIdentity, AiSql } from "./repository";
const assertIdentity = (id: AiIdentity) => {
  if (!id.storeId || id.storeId === "__all__" || !/^[a-f0-9]{64}$/.test(id.scopeKey) || !/^[a-f0-9]{64}$/.test(id.eventKey)) throw new Error("AI_SCOPE_INVALID");
};
async function lock(tx: AiSql) {
  const rows = await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
  if (rows.length !== 1) throw new Error("AI_CONTROL_MISSING");
}
export class AiRoutingRepository {
  constructor(private readonly db: AiDatabase) {}
  async claim(id: AiIdentity, fingerprint: string, interrupt: boolean, now: Date) {
    assertIdentity(id);
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("AI_SCOPE_INVALID");
    return this.db.transaction(async tx => {
      await lock(tx);
      const prior = await tx.query<{ fingerprint: string; status: string }>('SELECT fingerprint,status FROM "AiButlerDispatch" WHERE "storeId"=$1 AND "eventKey"=$2', [id.storeId,id.eventKey]);
      if (prior.length) return { state: prior[0].fingerprint !== fingerprint ? "EVENT_CONFLICT" as const : prior[0].status === "CLAIMED" ? "IN_PROGRESS" as const : prior[0].status === "UNKNOWN" ? "RESULT_UNKNOWN" as const : "DUPLICATE" as const, revision: 0 };
      await tx.query('INSERT INTO "AiButlerConversation" ("storeId","scopeKey","expiresAt") VALUES ($1,$2,$3::timestamptz) ON CONFLICT ("storeId","scopeKey") DO NOTHING', [id.storeId,id.scopeKey,new Date(now.getTime()+AI_LIMITS.retentionDays*86400_000)]);
      const [conversation] = await tx.query<{ revision: number; handoff: boolean }>('SELECT revision,handoff FROM "AiButlerConversation" WHERE "storeId"=$1 AND "scopeKey"=$2', [id.storeId,id.scopeKey]);
      if (!conversation) throw new Error("AI_SCOPE_INVALID");
      const busy = await tx.query('SELECT 1 FROM "AiButlerDispatch" WHERE "storeId"=$1 AND "scopeKey"=$2 AND "scopeRevision"=$3 AND status=\'CLAIMED\' LIMIT 1', [id.storeId,id.scopeKey,conversation.revision]);
      if (busy.length && !interrupt && !conversation.handoff) return { state: "BUSY" as const, revision: conversation.revision };
      await tx.query('INSERT INTO "AiButlerDispatch" ("storeId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES ($1,$2,$3,$4,$5,\'CLAIMED\',$6::timestamptz)',[id.storeId,id.scopeKey,id.eventKey,fingerprint,conversation.revision,now]);
      return { state: "CLAIMED" as const, revision: conversation.revision, handoff: conversation.handoff };
    });
  }
  async finish(id: AiIdentity, revision: number, route: string, outcome: string, handoff: boolean, now: Date) {
    assertIdentity(id);
    if (!Number.isSafeInteger(revision) || revision<0 || !/^[A-Z_]{1,80}$/.test(route) || !/^[A-Z_]{1,80}$/.test(outcome)) throw new Error("AI_ROUTE_INVALID");
    return this.db.transaction(async tx => {
      await lock(tx);
      const [current] = await tx.query<{ revision: number; handoff: boolean }>('SELECT revision,handoff FROM "AiButlerConversation" WHERE "storeId"=$1 AND "scopeKey"=$2',[id.storeId,id.scopeKey]);
      const allowed = current?.revision === revision && current.handoff === handoff;
      const changed = await tx.query('UPDATE "AiButlerDispatch" SET status=$3,route=$4,outcome=$5,"finishedAt"=$6::timestamptz WHERE "storeId"=$1 AND "eventKey"=$2 AND "scopeKey"=$7 AND status=\'CLAIMED\' RETURNING "eventKey"',[id.storeId,id.eventKey,allowed ? "COMPLETE":"SUPPRESSED",allowed?route:"SILENT",allowed?outcome:"SCOPE_CHANGED",now,id.scopeKey]);
      return allowed && changed.length === 1;
    });
  }
  async unknown(id: AiIdentity, now: Date) {
    assertIdentity(id);
    await this.db.query('UPDATE "AiButlerDispatch" SET status=\'UNKNOWN\',route=\'BLOCKED\',outcome=\'ROUTING_UNKNOWN\',"finishedAt"=$3::timestamptz WHERE "storeId"=$1 AND "eventKey"=$2 AND "scopeKey"=$4 AND status=\'CLAIMED\'',[id.storeId,id.eventKey,now,id.scopeKey]);
  }
  async globalStopped() {
    const [control] = await this.db.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl" WHERE id=\'global\'');
    return control?.stopped ?? true;
  }
}
