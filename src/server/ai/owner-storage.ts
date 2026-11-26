import "server-only";
import type { AiDatabase, AiSql } from "./owner-repository";

export type AiStorageKind = "STORE" | "BRAND";
const tables = ["Setting", "Conversation", "Request", "Dispatch", "HandoffAudit", "KnowledgeDocument"] as const;
/** Closed, server-owned identifier map. No caller-controlled table/schema names. */
export function ownerDatabase(database: AiDatabase, kind: AiStorageKind): AiDatabase {
  if (kind !== "STORE" && kind !== "BRAND") throw new Error("AI_OWNER_INVALID");
  const wrap = (sql: AiSql): AiSql => ({
    async query<T extends Record<string, unknown>>(statement: string, values?: unknown[]): Promise<T[]> {
      if (statement === "/* AI_PEER_TOTALS */") {
        const peer = kind === "STORE" ? "AiBrandRequest" : "AiButlerRequest";
        const [schema] = await sql.query<{ installed: boolean }>('SELECT to_regclass($1) IS NOT NULL AS installed', [`public."${peer}"`]);
        if (!schema || typeof schema.installed !== "boolean") throw new Error("AI_SCHEMA_UNKNOWN");
        if (!schema.installed) {
          if (kind === "BRAND") throw new Error("AI_SCHEMA_REQUIRED");
          return [{ total: "0", concurrent: "0" }] as unknown as T[];
        }
        // Narrow aggregate capability sees the entire peer ledger despite per-owner RLS.
        // Missing EXECUTE/function or inaccessible ledgers are fatal; no raw-SELECT fallback.
        return sql.query<T>("SELECT total, concurrent FROM public.ai_owner_peer_totals($1)", [kind]);
      }
      let mapped = statement.replaceAll('"ownerId"', kind === "STORE" ? '"storeId"' : '"serviceId"');
      if (kind === "BRAND") {
        for (const suffix of tables) mapped = mapped.replaceAll(`"AiButler${suffix}"`, `"AiBrand${suffix}"`);
        mapped = mapped.replaceAll('"StoreFeatureEntitlement"', '"AiBrandGrant"').replaceAll("'ai_digital_butler'", "'ai_brand_support'");
      }
      return sql.query<T>(mapped, values);
    },
  });
  return { ...wrap(database), transaction: work => database.transaction(tx => work(wrap(tx))) };
}
