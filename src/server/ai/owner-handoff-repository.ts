import "server-only";
import { ownerDatabase, type AiStorageKind } from "./owner-storage";
import { AI_LIMITS } from "./contracts";
import { assertAiOwnerEntitlement, type AiDatabase, type AiSql } from "./owner-repository";
import { aiHandoffKeySchema, type AiHandoffPage } from "./handoff-contract";
import { formatTWTime } from "@/lib/date-utils";

const unresolved = `(EXISTS (SELECT 1 FROM "AiButlerRequest" r WHERE r."ownerId"=c."ownerId" AND r."scopeKey"=c."scopeKey" AND r.status IN ('RESERVED','UNKNOWN'))
 OR EXISTS (SELECT 1 FROM "AiButlerDispatch" d WHERE d."ownerId"=c."ownerId" AND d."scopeKey"=c."scopeKey" AND d.status IN ('CLAIMED','UNKNOWN')))`;
async function controlLock(tx: AiSql) {
  if ((await tx.query('SELECT id FROM "AiButlerControl" WHERE id=\'global\' FOR UPDATE')).length !== 1) throw new Error("AI_CONTROL_MISSING");
}
/** Same conversation state as Routing/Service; no synthetic leads or message copies. */
export class AiOwnerHandoffRepository {
  private readonly db: AiDatabase;
  constructor(database: AiDatabase, kind: AiStorageKind, private readonly assertOwner: (ownerId: string) => void) { this.db = ownerDatabase(database, kind); }
  async list(ownerId: string, after?: string): Promise<AiHandoffPage> {
    this.assertOwner(ownerId); if (after !== undefined) aiHandoffKeySchema.parse(after);
    const [snapshot] = await this.db.query<{ total: string; rows: { scopeKey: string; revision: number; needsReview: boolean; lastEventAt: string | null }[] }>(`
      WITH page AS (
      SELECT c."scopeKey",c.revision,${unresolved} AS "needsReview",
        GREATEST((SELECT MAX(r."createdAt") FROM "AiButlerRequest" r WHERE r."ownerId"=c."ownerId" AND r."scopeKey"=c."scopeKey"),
          (SELECT MAX(d."createdAt") FROM "AiButlerDispatch" d WHERE d."ownerId"=c."ownerId" AND d."scopeKey"=c."scopeKey")) AS "lastEventAt"
      FROM "AiButlerConversation" c WHERE c."ownerId"=$1 AND c.handoff=true
        AND ($2::text IS NULL OR c."scopeKey">$2::text) ORDER BY c."scopeKey" LIMIT 26)
      SELECT (SELECT COUNT(*)::text FROM "AiButlerConversation" WHERE "ownerId"=$1 AND handoff=true) AS total,
        COALESCE((SELECT json_agg(page ORDER BY "scopeKey") FROM page),'[]'::json) AS rows`, [ownerId, after ?? null]);
    const total = Number(snapshot.total), rows = snapshot.rows;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("AI_HANDOFF_READ_FAILED");
    return { total, nextCursor: rows.length > 25 ? rows[24].scopeKey : null,
      rows: rows.slice(0, 25).map(row => {
        const lastEventAt = row.lastEventAt ? new Date(row.lastEventAt).toISOString() : null;
        return { ...row, lastEventAt, lastEventLabel: lastEventAt ? formatTWTime(lastEventAt) : null };
      }) };
  }
  async resume(input: { ownerId: string; scopeKey: string; revision: number; actorKey: string; commandKey: string }, now: Date, authorize: () => Promise<void>) {
    this.assertOwner(input.ownerId);
    for (const key of [input.scopeKey, input.actorKey, input.commandKey]) aiHandoffKeySchema.parse(key);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("AI_HANDOFF_CONFLICT");
    // Auth may use the shared pool. Finish it before acquiring the transaction's sole connection.
    await authorize();
    return this.db.transaction(async tx => {
      await controlLock(tx); // Stopped AI does not prevent an authorized operator from resolving a handoff.
      await assertAiOwnerEntitlement(tx, input.ownerId); // Same connection, live HQ state and DB clock.
      const [prior] = await tx.query<{ scopeKey: string; actorKey: string; expectedRevision: number; resultRevision: number }>(
        'SELECT "scopeKey","actorKey","expectedRevision","resultRevision" FROM "AiButlerHandoffAudit" WHERE "ownerId"=$1 AND "commandKey"=$2', [input.ownerId, input.commandKey]);
      if (prior) {
        if (prior.scopeKey !== input.scopeKey || prior.actorKey !== input.actorKey || prior.expectedRevision !== input.revision) throw new Error("AI_HANDOFF_CONFLICT");
        return { duplicate: true, revision: prior.resultRevision };
      }
      const [current] = await tx.query<{ revision: number; handoff: boolean; needsReview: boolean }>(
        `SELECT c.revision,c.handoff,${unresolved} AS "needsReview" FROM "AiButlerConversation" c WHERE c."ownerId"=$1 AND c."scopeKey"=$2 FOR UPDATE`, [input.ownerId, input.scopeKey]);
      if (!current?.handoff || current.revision !== input.revision) throw new Error("AI_HANDOFF_CONFLICT");
      if (current.needsReview) throw new Error("AI_HANDOFF_REVIEW_REQUIRED");
      const changed = await tx.query<{ revision: number }>(`UPDATE "AiButlerConversation" SET handoff=false,summary='[]',revision=revision+1,"expiresAt"=$4::timestamptz
        WHERE "ownerId"=$1 AND "scopeKey"=$2 AND revision=$3 AND handoff=true RETURNING revision`,
      [input.ownerId, input.scopeKey, input.revision, new Date(now.getTime() + AI_LIMITS.retentionDays * 86400_000)]);
      if (changed.length !== 1) throw new Error("AI_HANDOFF_CONFLICT");
      await tx.query(`INSERT INTO "AiButlerHandoffAudit" ("ownerId","commandKey","scopeKey","actorKey","expectedRevision","resultRevision","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)`, [input.ownerId, input.commandKey, input.scopeKey, input.actorKey, input.revision, changed[0].revision, now]);
      return { duplicate: false, revision: changed[0].revision };
    });
  }
}
