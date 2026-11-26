import "server-only";
import { createHmac } from "node:crypto";
import { AI_LIMITS } from "./contracts";
import type { AiDatabase, AiSql } from "./repository";
import { aiHandoffKeySchema, type AiHandoffPage } from "./handoff-contract";

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
const unresolved = `(EXISTS (SELECT 1 FROM "AiButlerRequest" r WHERE r."storeId"=c."storeId" AND r."scopeKey"=c."scopeKey" AND r.status IN ('RESERVED','UNKNOWN'))
 OR EXISTS (SELECT 1 FROM "AiButlerDispatch" d WHERE d."storeId"=c."storeId" AND d."scopeKey"=c."scopeKey" AND d.status IN ('CLAIMED','UNKNOWN')))`;
async function controlLock(tx: AiSql) {
  if ((await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE')).length !== 1) throw new Error("AI_CONTROL_MISSING");
}
/** Same conversation state as Routing/Service; no synthetic leads or message copies. */
export class AiHandoffRepository {
  constructor(private readonly db: AiDatabase) {}
  async list(storeId: string, after?: string): Promise<AiHandoffPage> {
    storeScope(storeId); if (after !== undefined) aiHandoffKeySchema.parse(after);
    const [snapshot] = await this.db.query<{ total: string; rows: { scopeKey: string; revision: number; needsReview: boolean; lastEventAt: string | null }[] }>(`
      WITH page AS (
      SELECT c."scopeKey",c.revision,${unresolved} AS "needsReview",
        GREATEST((SELECT MAX(r."createdAt") FROM "AiButlerRequest" r WHERE r."storeId"=c."storeId" AND r."scopeKey"=c."scopeKey"),
          (SELECT MAX(d."createdAt") FROM "AiButlerDispatch" d WHERE d."storeId"=c."storeId" AND d."scopeKey"=c."scopeKey")) AS "lastEventAt"
      FROM "AiButlerConversation" c WHERE c."storeId"=$1 AND c.handoff=true
        AND ($2::text IS NULL OR c."scopeKey">$2::text) ORDER BY c."scopeKey" LIMIT 26)
      SELECT (SELECT COUNT(*)::text FROM "AiButlerConversation" WHERE "storeId"=$1 AND handoff=true) AS total,
        COALESCE((SELECT json_agg(page ORDER BY "scopeKey") FROM page),'[]'::json) AS rows`, [storeId, after ?? null]);
    const total = Number(snapshot.total), rows = snapshot.rows;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("AI_HANDOFF_READ_FAILED");
    return { total, nextCursor: rows.length > 25 ? rows[24].scopeKey : null,
      rows: rows.slice(0, 25).map(row => ({ ...row, lastEventAt: row.lastEventAt ? new Date(row.lastEventAt).toISOString() : null })) };
  }
  async resume(input: { storeId: string; scopeKey: string; revision: number; actorKey: string; commandKey: string }, now: Date, authorize: () => Promise<void>) {
    storeScope(input.storeId);
    for (const key of [input.scopeKey, input.actorKey, input.commandKey]) aiHandoffKeySchema.parse(key);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("AI_HANDOFF_CONFLICT");
    return this.db.transaction(async tx => {
      await controlLock(tx); // Stopped AI does not prevent an authorized operator from resolving a handoff.
      await authorize();
      const [prior] = await tx.query<{ scopeKey: string; actorKey: string; expectedRevision: number; resultRevision: number }>(
        'SELECT "scopeKey","actorKey","expectedRevision","resultRevision" FROM "AiButlerHandoffAudit" WHERE "storeId"=$1 AND "commandKey"=$2', [input.storeId, input.commandKey]);
      if (prior) {
        if (prior.scopeKey !== input.scopeKey || prior.actorKey !== input.actorKey || prior.expectedRevision !== input.revision) throw new Error("AI_HANDOFF_CONFLICT");
        return { duplicate: true, revision: prior.resultRevision };
      }
      const [current] = await tx.query<{ revision: number; handoff: boolean; needsReview: boolean }>(
        `SELECT c.revision,c.handoff,${unresolved} AS "needsReview" FROM "AiButlerConversation" c WHERE c."storeId"=$1 AND c."scopeKey"=$2 FOR UPDATE`, [input.storeId, input.scopeKey]);
      if (!current?.handoff || current.revision !== input.revision) throw new Error("AI_HANDOFF_CONFLICT");
      if (current.needsReview) throw new Error("AI_HANDOFF_REVIEW_REQUIRED");
      const changed = await tx.query<{ revision: number }>(`UPDATE "AiButlerConversation" SET handoff=false,summary='[]',revision=revision+1,"expiresAt"=$4::timestamptz
        WHERE "storeId"=$1 AND "scopeKey"=$2 AND revision=$3 AND handoff=true RETURNING revision`,
      [input.storeId, input.scopeKey, input.revision, new Date(now.getTime() + AI_LIMITS.retentionDays * 86400_000)]);
      if (changed.length !== 1) throw new Error("AI_HANDOFF_CONFLICT");
      await tx.query(`INSERT INTO "AiButlerHandoffAudit" ("storeId","commandKey","scopeKey","actorKey","expectedRevision","resultRevision","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)`, [input.storeId, input.commandKey, input.scopeKey, input.actorKey, input.revision, changed[0].revision, now]);
      return { duplicate: false, revision: changed[0].revision };
    });
  }
}
