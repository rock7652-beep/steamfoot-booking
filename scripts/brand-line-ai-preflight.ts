// Read-only readiness tool. Never applies migrations, grants, toggles or sends.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isSystemLineDeliveryPaused } from "../src/lib/line-delivery-pause";
import { isPreviewExternalIntegrationBlocked } from "../src/lib/runtime-env";
import {
  getSteamButlerLineAccessToken,
  getSteamButlerLineSecret,
} from "../src/lib/line-config";
import { dayRange, toLocalDateStr } from "../src/lib/date-utils";
import { BRAND_AI_MODELS } from "../src/server/services/brand-ai-provider";
import {
  beautyProductionCaPath,
  verifyBeautyProductionCa,
} from "./beauty-production-ca.mjs";

const migration = "20261127140000_brand_ai_reply_log";
type Row = Record<string, unknown>;
type Reader = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Row[] }>;
};

export function inspectBrandAiConfig() {
  const ids = (process.env.BRAND_AI_ALLOWED_LINE_USER_IDS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    enabled: process.env.BRAND_AI_ENABLED === "1",
    version: process.env.BRAND_AI_VERSION ?? "1",
    contextStorageRequired: process.env.BRAND_AI_VERSION === "2",
    productionMigrationTargetPresent: Boolean(
      process.env.PRODUCTION_MIGRATION_TARGET,
    ),
    whitelistCount: new Set(ids).size,
    modelAllowed: BRAND_AI_MODELS.includes(
      process.env.BRAND_AI_MODEL || "gpt-6-luna",
    ),
    keyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
    brandLineTokenPresent: Boolean(getSteamButlerLineAccessToken()),
    brandLineSecretPresent: Boolean(getSteamButlerLineSecret()),
    globalLinePaused: isSystemLineDeliveryPaused(),
    outboundBlocked: isPreviewExternalIntegrationBlocked(),
    restrictedKeyAndProviderHardBudget: "manual_verification_required",
  };
}

export function readOnlyConnection(
  expectedProject: string,
  value = process.env.DATABASE_URL,
) {
  if (
    !["ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"].includes(
      expectedProject,
    ) ||
    !value
  )
    throw Error("TARGET_REQUIRED");
  const url = new URL(value);
  const pooled = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(
    url.hostname,
  );
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.pathname !== "/postgres" ||
    url.hash ||
    !["", "5432", "6543"].includes(url.port) ||
    !(
      url.hostname === `db.${expectedProject}.supabase.co` ||
      (pooled &&
        decodeURIComponent(url.username).endsWith(`.${expectedProject}`))
    )
  )
    throw Error("TARGET_MISMATCH");
  const allowed = [
    "schema",
    "sslmode",
    "sslaccept",
    "sslcert",
    "connection_limit",
    "pool_timeout",
    "connect_timeout",
    "socket_timeout",
    "statement_cache_size",
    "pgbouncer",
  ];
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw Error("CONNECTION_OVERRIDE_REJECTED");
  }
  if (
    url.searchParams.has("schema") &&
    url.searchParams.get("schema") !== "public"
  )
    throw Error("SCHEMA_REJECTED");
  if (
    url.searchParams.has("sslaccept") &&
    url.searchParams.get("sslaccept") !== "strict"
  )
    throw Error("TLS_REJECTED");
  if (
    url.searchParams.has("sslmode") &&
    !["require", "verify-ca", "verify-full"].includes(
      url.searchParams.get("sslmode")!,
    )
  )
    throw Error("TLS_REJECTED");
  if (
    url.searchParams.has("sslcert") &&
    url.searchParams.get("sslcert") !== beautyProductionCaPath()
  )
    throw Error("TLS_CA_REJECTED");
  url.search = ""; // Prisma query parameters must not override node-pg SSL settings.
  if (!pooled) verifyBeautyProductionCa();
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(!pooled
        ? { ca: readFileSync(beautyProductionCaPath(), "utf8") }
        : {}),
    },
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  };
}

export async function inspectBrandAiDatabase(db: Reader) {
  await db.query("BEGIN READ ONLY");
  try {
    const context = (
      await db.query(`SELECT current_user AS role,current_setting('server_version') AS version,
      current_setting('transaction_read_only') AS read_only,clock_timestamp() AS now,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl,
      to_regclass('public."BrandAiReplyLog"') IS NOT NULL AS installed`)
    ).rows[0];
    if (!context.installed)
      return { context, schemaReady: false, migration: "not_installed" };
    const columns = (
      await db.query(
        `SELECT column_name,data_type,udt_name,datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name='BrandAiReplyLog' ORDER BY ordinal_position`,
      )
    ).rows;
    const names = columns.map((x) => x.column_name);
    const required = [
      "webhookEventId",
      "outcome",
      "faqId",
      "inputTokens",
      "outputTokens",
      "latencyMs",
      "modelStartedAt",
      "modelLeaseUntil",
      "createdAt",
    ];
    const rights = (
      await db.query(`SELECT c.relrowsecurity AS rls,
      c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owner,
      (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user) AS bypass,
      has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
      has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
      has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
      has_function_privilege(current_user,'pg_catalog.pg_advisory_xact_lock(integer,integer)','EXECUTE') AS advisory_lock
      FROM pg_class c WHERE c.oid='public."BrandAiReplyLog"'::regclass`)
    ).rows[0];
    const policies = (
      await db.query(
        `SELECT policyname,permissive,cmd FROM pg_policies WHERE schemaname='public' AND tablename='BrandAiReplyLog'`,
      )
    ).rows;
    const indexes = (
      await db.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='BrandAiReplyLog'`,
      )
    ).rows;
    const schemaReady =
      required.every((x) => names.includes(x)) &&
      names.every((name) =>
        [...required, "knowledgeVersion", "knowledgeIds"].includes(
          name as string,
        ),
      ) &&
      (["knowledgeVersion", "knowledgeIds"].every((name) =>
        names.includes(name),
      ) ||
        ["knowledgeVersion", "knowledgeIds"].every(
          (name) => !names.includes(name),
        )) &&
      columns
        .filter((x) =>
          ["modelStartedAt", "modelLeaseUntil"].includes(
            x.column_name as string,
          ),
        )
        .every(
          (x) =>
            x.data_type === "timestamp with time zone" &&
            x.datetime_precision === 3,
        ) &&
      columns.some(
        (x) =>
          x.column_name === "outcome" && x.udt_name === "BrandAiReplyOutcome",
      );
    let usage: Row | null = null;
    if (schemaReady) {
      const range = dayRange(toLocalDateStr(context.now as Date));
      usage = (
        await db.query(
          `SELECT count(*) FILTER(WHERE "modelStartedAt">=$1 AND "modelStartedAt"<=$2)::int AS daily,
        count(*) FILTER(WHERE "modelLeaseUntil">clock_timestamp())::int AS active FROM "BrandAiReplyLog"`,
          [range.start, range.end],
        )
      ).rows[0];
    }
    const memoryPresent = (
      await db.query(
        `SELECT to_regclass('public."BrandAiConversation"') IS NOT NULL AS present`,
      )
    ).rows[0].present;
    let v2Memory: Row | null = null;
    if (memoryPresent) {
      const memoryColumns = (
        await db.query(
          `SELECT column_name,udt_name,character_maximum_length,datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name='BrandAiConversation'`,
        )
      ).rows;
      v2Memory = (
        await db.query(`SELECT c.relrowsecurity AS rls,
        has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
        has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
        has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
        has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
        NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) AS private
        FROM pg_class c WHERE c.oid='public."BrandAiConversation"'::regclass`)
      ).rows[0];
      const expectedMemoryTypes: Record<string, string> = {
        scopeKey: "varchar",
        sessionId: "uuid",
        revision: "int4",
        profile: "jsonb",
        expiresAt: "timestamptz",
      };
      v2Memory!.columns = memoryColumns;
      v2Memory!.schemaReady =
        memoryColumns.length === 5 &&
        memoryColumns.every(
          (c) => expectedMemoryTypes[c.column_name as string] === c.udt_name,
        ) &&
        memoryColumns.some(
          (c) =>
            c.column_name === "scopeKey" && c.character_maximum_length === 64,
        ) &&
        memoryColumns.some(
          (c) => c.column_name === "expiresAt" && c.datetime_precision === 3,
        );
    }
    const ledger = (
      await db.query(
        `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`,
      )
    ).rows[0];
    const ledgerReadable =
      ledger.present &&
      (
        await db.query(
          `SELECT has_table_privilege(current_user,'public._prisma_migrations','SELECT') AS allowed`,
        )
      ).rows[0].allowed === true;
    const applied = ledgerReadable
      ? (
          await db.query(
            `SELECT checksum,finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied FROM "_prisma_migrations" WHERE migration_name=$1`,
            [migration],
          )
        ).rows
      : [];
    const checksum = createHash("sha256")
      .update(readFileSync(`prisma/migrations/${migration}/migration.sql`))
      .digest("hex");
    return {
      context,
      schemaReady,
      v2Memory,
      v2Ready:
        schemaReady &&
        names.includes("knowledgeVersion") &&
        names.includes("knowledgeIds") &&
        Boolean(
          v2Memory &&
            [
              "rls",
              "can_select",
              "can_insert",
              "can_update",
              "can_delete",
              "private",
              "schemaReady",
            ].every((key) => v2Memory![key] === true),
        ),
      columns,
      rights,
      policies,
      indexes,
      usage,
      migrationMatches: ledgerReadable
        ? applied.length === 1 &&
          applied[0].applied === true &&
          applied[0].checksum === checksum
        : null,
      limitation:
        "Catalog/SELECT only. RLS predicates and transaction writes require separately authorized actual acceptance.",
    };
  } finally {
    await db.query("ROLLBACK");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  (async () => {
    if (process.argv.includes("--config")) {
      console.log(JSON.stringify(inspectBrandAiConfig()));
      return;
    }
    if (!process.argv.includes("--database")) throw Error("MODE_REQUIRED");
    const ref = process.argv[process.argv.indexOf("--expected-project") + 1];
    if (!process.argv.includes("--expected-project"))
      throw Error("TARGET_REQUIRED");
    const { Client } = createRequire(import.meta.url)("pg");
    const client = new Client(readOnlyConnection(ref));
    try {
      await client.connect();
      console.log(JSON.stringify(await inspectBrandAiDatabase(client)));
    } finally {
      await client.end();
    }
  })().catch(() => {
    console.error(
      "BRAND_AI_PREFLIGHT_FAILED: configuration/connection/permissions require review; no values disclosed",
    );
    process.exitCode = 1;
  });
}
