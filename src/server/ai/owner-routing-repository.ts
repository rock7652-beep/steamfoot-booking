import "server-only";
import { ownerDatabase, type AiStorageKind } from "./owner-storage";
import { AI_LIMITS } from "./contracts";
import type { AiDatabase, AiOwnerIdentity, AiSql } from "./owner-repository";
const assertIdentity = (id: AiOwnerIdentity) => {
  if (!id.ownerId || id.ownerId === "__all__" || !/^[a-f0-9]{64}$/.test(id.scopeKey) || !/^[a-f0-9]{64}$/.test(id.eventKey)) throw new Error("AI_SCOPE_INVALID");
};
async function lock(tx: AiSql) {
  const rows = await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE');
  if (rows.length !== 1) throw new Error("AI_CONTROL_MISSING");
}
export class AiOwnerRoutingRepository {
  private readonly db: AiDatabase;
  constructor(database: AiDatabase, kind: AiStorageKind) { this.db = ownerDatabase(database, kind); }
  async claim(id: AiOwnerIdentity, fingerprint: string, interrupt: boolean, now: Date) {
    assertIdentity(id);
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("AI_SCOPE_INVALID");
    return this.db.transaction(async tx => {
      await lock(tx);
      const prior = await tx.query<{ fingerprint: string; status: string }>('SELECT fingerprint,status FROM "AiButlerDispatch" WHERE "ownerId"=$1 AND "eventKey"=$2', [id.ownerId,id.eventKey]);
      if (prior.length) return { state: prior[0].fingerprint !== fingerprint ? "EVENT_CONFLICT" as const : prior[0].status === "CLAIMED" ? "IN_PROGRESS" as const : prior[0].status === "UNKNOWN" ? "RESULT_UNKNOWN" as const : "DUPLICATE" as const, revision: 0 };
      await tx.query('INSERT INTO "AiButlerConversation" ("ownerId","scopeKey","expiresAt") VALUES ($1,$2,$3::timestamptz) ON CONFLICT ("ownerId","scopeKey") DO NOTHING', [id.ownerId,id.scopeKey,new Date(now.getTime()+AI_LIMITS.retentionDays*86400_000)]);
      const [conversation] = await tx.query<{ revision: number; handoff: boolean }>('SELECT revision,handoff FROM "AiButlerConversation" WHERE "ownerId"=$1 AND "scopeKey"=$2', [id.ownerId,id.scopeKey]);
      if (!conversation) throw new Error("AI_SCOPE_INVALID");
      const busy = await tx.query('SELECT 1 FROM "AiButlerDispatch" WHERE "ownerId"=$1 AND "scopeKey"=$2 AND "scopeRevision"=$3 AND status IN (\'CLAIMED\',\'UNKNOWN\') LIMIT 1', [id.ownerId,id.scopeKey,conversation.revision]);
      if (busy.length && !interrupt && !conversation.handoff) return { state: "BUSY" as const, revision: conversation.revision };
      await tx.query('INSERT INTO "AiButlerDispatch" ("ownerId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES ($1,$2,$3,$4,$5,\'CLAIMED\',$6::timestamptz)',[id.ownerId,id.scopeKey,id.eventKey,fingerprint,conversation.revision,now]);
      return { state: "CLAIMED" as const, revision: conversation.revision, handoff: conversation.handoff };
    });
  }
  async finish(id: AiOwnerIdentity, revision: number, route: string, outcome: string, handoff: boolean, now: Date) {
    assertIdentity(id);
    if (!Number.isSafeInteger(revision) || revision<0 || !/^[A-Z_]{1,80}$/.test(route) || !/^[A-Z_]{1,80}$/.test(outcome)) throw new Error("AI_ROUTE_INVALID");
    return this.db.transaction(async tx => {
      await lock(tx);
      const [current] = await tx.query<{ revision: number; handoff: boolean }>('SELECT revision,handoff FROM "AiButlerConversation" WHERE "ownerId"=$1 AND "scopeKey"=$2',[id.ownerId,id.scopeKey]);
      const allowed = current?.revision === revision && current.handoff === handoff;
      const changed = await tx.query('UPDATE "AiButlerDispatch" SET status=$3,route=$4,outcome=$5,"finishedAt"=$6::timestamptz WHERE "ownerId"=$1 AND "eventKey"=$2 AND "scopeKey"=$7 AND status=\'CLAIMED\' RETURNING "eventKey"',[id.ownerId,id.eventKey,allowed ? "COMPLETE":"SUPPRESSED",allowed?route:"SILENT",allowed?outcome:"SCOPE_CHANGED",now,id.scopeKey]);
      return allowed && changed.length === 1;
    });
  }
  async unknown(id: AiOwnerIdentity, now: Date) {
    assertIdentity(id);
    await this.db.query('UPDATE "AiButlerDispatch" SET status=\'UNKNOWN\',route=\'BLOCKED\',outcome=\'ROUTING_UNKNOWN\',"finishedAt"=$3::timestamptz WHERE "ownerId"=$1 AND "eventKey"=$2 AND "scopeKey"=$4 AND status=\'CLAIMED\'',[id.ownerId,id.eventKey,now,id.scopeKey]);
  }
  async globalStopped() {
    const [control] = await this.db.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl" WHERE id=\'global\'');
    return control?.stopped ?? true;
  }
}
