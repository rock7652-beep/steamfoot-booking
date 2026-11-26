import "server-only";
import { aiKnowledgeDraftSchema, EMPTY_AI_KNOWLEDGE, type AiKnowledgeDocument } from "./knowledge-document";
import type { AiDatabase, AiSql } from "./repository";

type Row = Record<string, unknown> & { draft: unknown; published: unknown; revision: number; publishedVersion: number; publishedAt: Date | string | null };
function document(row?: Row): AiKnowledgeDocument {
  return row ? { draft: aiKnowledgeDraftSchema.parse(row.draft), published: row.published === null ? null : aiKnowledgeDraftSchema.parse(row.published),
    revision: row.revision, publishedVersion: row.publishedVersion, publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null }
    : { draft: structuredClone(EMPTY_AI_KNOWLEDGE), published: null, revision: 0, publishedVersion: 0, publishedAt: null };
}
export async function readAiKnowledgeDocument(tx: AiSql, storeId: string) {
  if (!storeId || storeId === "__all__") throw new Error("AI_SCOPE_REQUIRED");
  return document((await tx.query<Row>('SELECT draft,published,revision,"publishedVersion","publishedAt" FROM "AiButlerKnowledgeDocument" WHERE "storeId"=$1', [storeId]))[0]);
}
export class AiKnowledgeRepository {
  constructor(private readonly database: AiDatabase) {}
  read(storeId: string) { return readAiKnowledgeDocument(this.database, storeId); }
  async change(storeId: string, expectedRevision: number, command: "save" | "publish" | "withdraw", input?: unknown, now = new Date()) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("AI_KNOWLEDGE_CONFLICT");
    const draft = command === "save" ? aiKnowledgeDraftSchema.parse(input) : undefined;
    return this.database.transaction(async tx => {
      // Create under the unique key, then lock only our private row; no Store UPDATE grant.
      await tx.query('INSERT INTO "AiButlerKnowledgeDocument" ("storeId",draft) VALUES ($1,$2::jsonb) ON CONFLICT ("storeId") DO NOTHING', [storeId, JSON.stringify(EMPTY_AI_KNOWLEDGE)]);
      await tx.query('SELECT "storeId" FROM "AiButlerKnowledgeDocument" WHERE "storeId"=$1 FOR UPDATE', [storeId]);
      const current = await readAiKnowledgeDocument(tx, storeId);
      if (current.revision !== expectedRevision) throw new Error("AI_KNOWLEDGE_CONFLICT");
      if (command === "publish" && !current.draft.introduction && !current.draft.faqs.length && !Object.values(current.draft.references).some(Boolean)) throw new Error("AI_KNOWLEDGE_EMPTY");
      const next = { ...current, draft: draft ?? current.draft, revision: current.revision + 1,
        published: command === "publish" ? current.draft : command === "withdraw" ? null : current.published,
        publishedVersion: current.publishedVersion + (command === "publish" || command === "withdraw" ? 1 : 0),
        publishedAt: command === "publish" ? now.toISOString() : command === "withdraw" ? null : current.publishedAt };
      await tx.query(`INSERT INTO "AiButlerKnowledgeDocument" ("storeId",draft,published,revision,"publishedVersion","publishedAt") VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6)
        ON CONFLICT ("storeId") DO UPDATE SET draft=EXCLUDED.draft,published=EXCLUDED.published,revision=EXCLUDED.revision,"publishedVersion"=EXCLUDED."publishedVersion","publishedAt"=EXCLUDED."publishedAt"`,
      [storeId, JSON.stringify(next.draft), next.published ? JSON.stringify(next.published) : null, next.revision, next.publishedVersion, next.publishedAt]);
      return next;
    });
  }
}
