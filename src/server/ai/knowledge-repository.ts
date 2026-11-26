import "server-only";
import { ownerDatabase } from "./owner-storage";
import { AiOwnerKnowledgeRepository, readAiOwnerKnowledgeDocument } from "./owner-knowledge-repository";
import type { AiDatabase, AiSql } from "./repository";
export function readAiKnowledgeDocument(tx: AiSql, storeId: string) {
  const db: AiDatabase = { query: tx.query.bind(tx), transaction: work => work(tx) };
  return readAiOwnerKnowledgeDocument(ownerDatabase(db, "STORE"), storeId);
}
export class AiKnowledgeRepository extends AiOwnerKnowledgeRepository {
  constructor(database: AiDatabase) { super(database, "STORE"); }
}
