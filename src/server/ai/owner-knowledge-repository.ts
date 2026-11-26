import "server-only";
import { ownerDatabase, type AiStorageKind } from "./owner-storage";
import { aiKnowledgeDraftSchema, EMPTY_AI_KNOWLEDGE, type AiKnowledgeDocument } from "./knowledge-document";
import type { AiDatabase, AiSql } from "./repository";

type Row = Record<string, unknown> & { draft: unknown; published: unknown; revision: number; publishedVersion: number; publishedAt: Date | string | null };
function document(row?: Row): AiKnowledgeDocument {
  return row ? { draft: aiKnowledgeDraftSchema.parse(row.draft), published: row.published === null ? null : aiKnowledgeDraftSchema.parse(row.published),
    revision: row.revision, publishedVersion: row.publishedVersion, publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null }
    : { draft: structuredClone(EMPTY_AI_KNOWLEDGE), published: null, revision: 0, publishedVersion: 0, publishedAt: null };
}
export async function readAiOwnerKnowledgeDocument(tx: AiSql, ownerId: string) {
  if (!ownerId || ownerId === "__all__") throw new Error("AI_SCOPE_REQUIRED");
  return document((await tx.query<Row>('SELECT draft,published,revision,"publishedVersion","publishedAt" FROM "AiButlerKnowledgeDocument" WHERE "ownerId"=$1', [ownerId]))[0]);
}
export class AiOwnerKnowledgeRepository {
  private readonly database: AiDatabase;
  constructor(database: AiDatabase, kind: AiStorageKind, private readonly validate: (input: unknown) => void = () => undefined) { this.database = ownerDatabase(database, kind); }
  async read(ownerId: string) { const doc = await readAiOwnerKnowledgeDocument(this.database, ownerId); this.validate(doc.draft); if (doc.published) this.validate(doc.published); return doc; }
  async change(ownerId: string, expectedRevision: number, command: "save" | "publish" | "withdraw", input?: unknown, now = new Date()) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("AI_KNOWLEDGE_CONFLICT");
    const draft = command === "save" ? aiKnowledgeDraftSchema.parse(input) : undefined;
    if (draft) this.validate(draft);
    return this.database.transaction(async tx => {
      // Create under the unique key, then lock only our private row; no Store UPDATE grant.
      await tx.query('INSERT INTO "AiButlerKnowledgeDocument" ("ownerId",draft) VALUES ($1,$2::jsonb) ON CONFLICT ("ownerId") DO NOTHING', [ownerId, JSON.stringify(EMPTY_AI_KNOWLEDGE)]);
      await tx.query('SELECT "ownerId" FROM "AiButlerKnowledgeDocument" WHERE "ownerId"=$1 FOR UPDATE', [ownerId]);
      const current = await readAiOwnerKnowledgeDocument(tx, ownerId);
      this.validate(current.draft);
      if (current.published) this.validate(current.published);
      if (current.revision !== expectedRevision) throw new Error("AI_KNOWLEDGE_CONFLICT");
      if (command === "publish" && !current.draft.introduction && !current.draft.faqs.length && !Object.values(current.draft.references).some(Boolean)) throw new Error("AI_KNOWLEDGE_EMPTY");
      const next = { ...current, draft: draft ?? current.draft, revision: current.revision + 1,
        published: command === "publish" ? current.draft : command === "withdraw" ? null : current.published,
        publishedVersion: current.publishedVersion + (command === "publish" || command === "withdraw" ? 1 : 0),
        publishedAt: command === "publish" ? now.toISOString() : command === "withdraw" ? null : current.publishedAt };
      await tx.query(`INSERT INTO "AiButlerKnowledgeDocument" ("ownerId",draft,published,revision,"publishedVersion","publishedAt") VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6::timestamptz)
        ON CONFLICT ("ownerId") DO UPDATE SET draft=EXCLUDED.draft,published=EXCLUDED.published,revision=EXCLUDED.revision,"publishedVersion"=EXCLUDED."publishedVersion","publishedAt"=EXCLUDED."publishedAt"`,
      [ownerId, JSON.stringify(next.draft), next.published ? JSON.stringify(next.published) : null, next.revision, next.publishedVersion, next.publishedAt]);
      return next;
    });
  }
}
