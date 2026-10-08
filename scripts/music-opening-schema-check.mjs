import { assertMusicOpeningPreviewEnvironment, isMusicOpeningDatabase } from "./music-opening-preview-scope.mjs";

/** Read-only catalog capability check; no tenant records or credential output. */
export const MUSIC_OPENING_SCHEMA_SQL = `
WITH expected_columns(table_name,column_name,udt_name,is_nullable) AS (VALUES
 ('CoursePointCard','musicOpeningStateRequired','bool','NO'),
 ('CourseBooking','musicOpeningTermKey','text','YES'),
 ('CourseBooking','musicOpeningLessonOrdinal','int4','YES'),
 ('CourseBooking','musicOpeningSourceLessonKey','text','YES'),
 ('CourseBooking','musicOpeningMakeupEntitlementId','text','YES'),
 ('CourseMusicOpeningMakeupEntitlement','id','text','NO'),('CourseMusicOpeningMakeupEntitlement','storeId','text','NO'),
 ('CourseMusicOpeningMakeupEntitlement','customerId','text','NO'),('CourseMusicOpeningMakeupEntitlement','templateId','text','NO'),
 ('CourseMusicOpeningMakeupEntitlement','sourceKey','text','NO'),('CourseMusicOpeningMakeupEntitlement','sourceSlotKey','text','NO'),
 ('CourseMusicOpeningMakeupEntitlement','contentHash','text','NO'),('CourseMusicOpeningMakeupEntitlement','snapshot','jsonb','NO'),
 ('CourseMusicOpeningMakeupEntitlement','appliedBatchId','text','NO'),('CourseMusicOpeningMakeupEntitlement','version','int4','NO'),
 ('CourseMusicOpeningMakeupEntitlement','createdAt','timestamptz','NO'),('CourseMusicOpeningMakeupEntitlement','updatedAt','timestamptz','NO'),
 ('CourseMusicOpeningState','id','text','NO'),('CourseMusicOpeningState','storeId','text','NO'),
 ('CourseMusicOpeningState','cardId','text','NO'),('CourseMusicOpeningState','customerId','text','NO'),
 ('CourseMusicOpeningState','sourceKey','text','NO'),('CourseMusicOpeningState','contentHash','text','NO'),
 ('CourseMusicOpeningState','snapshot','jsonb','NO'),('CourseMusicOpeningState','appliedBatchId','text','NO'),
 ('CourseMusicOpeningState','teacherFeePolicy','text','NO'),('CourseMusicOpeningState','createdAt','timestamptz','NO')
), indexes AS (
 SELECT c.relname AS table_name,i.indisunique,i.indisvalid,i.indpred IS NULL AS unfiltered,
 ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
   JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord) AS fields
 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
), fk AS (
 SELECT c.relname AS table_name,r.relname AS target,p.confdeltype,p.convalidated,
 ARRAY(SELECT a.attname::text FROM unnest(p.conkey) WITH ORDINALITY k(attnum,ord)
   JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS fields,
 ARRAY(SELECT a.attname::text FROM unnest(p.confkey) WITH ORDINALITY k(attnum,ord)
   JOIN pg_attribute a ON a.attrelid=p.confrelid AND a.attnum=k.attnum ORDER BY k.ord) AS target_fields
 FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_class r ON r.oid=p.confrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND p.contype='f'
)
SELECT
 NOT EXISTS(SELECT 1 FROM expected_columns e LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
 WHERE c.column_name IS NULL OR c.udt_name<>e.udt_name OR c.is_nullable<>e.is_nullable) AS columns_ready,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='CoursePointCard'
 AND column_name='musicOpeningStateRequired' AND column_default='false') AS native_default_ready,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='CourseMusicOpeningState'
 AND column_name='teacherFeePolicy' AND column_default=$q$'UNVERIFIED'::text$q$) AS policy_default_ready,
 (SELECT count(*)=4 FROM (VALUES
 ('CourseBooking',ARRAY['storeId','cardId','musicOpeningSourceLessonKey']),
 ('CourseBooking',ARRAY['storeId','cardId','musicOpeningTermKey','musicOpeningLessonOrdinal']),
 ('CourseMusicOpeningState',ARRAY['sourceKey']),('CourseMusicOpeningState',ARRAY['cardId','storeId'])
 ) e(t,fields) WHERE EXISTS(SELECT 1 FROM indexes i WHERE i.table_name=e.t AND i.fields=e.fields AND i.indisunique AND i.indisvalid AND i.unfiltered)) AS indexes_ready,
 (SELECT count(*)=4 FROM (VALUES
 ('Store',ARRAY['storeId'],ARRAY['id']),
 ('CoursePointCard',ARRAY['cardId','storeId'],ARRAY['id','storeId']),
 ('Customer',ARRAY['customerId','storeId'],ARRAY['id','storeId']),
 ('CourseCardMember',ARRAY['cardId','customerId'],ARRAY['cardId','customerId'])
 ) e(t,fields,target_fields) WHERE EXISTS(SELECT 1 FROM fk f WHERE f.table_name='CourseMusicOpeningState' AND f.target=e.t
 AND f.fields=e.fields AND f.target_fields=e.target_fields AND f.confdeltype='r' AND f.convalidated)) AS fks_ready,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='CourseMusicOpeningState' AND c.relrowsecurity) AS rls_ready,
 CASE WHEN to_regclass('public."CourseMusicOpeningState"') IS NULL THEN false ELSE
 NOT has_table_privilege('anon','public."CourseMusicOpeningState"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_table_privilege('authenticated','public."CourseMusicOpeningState"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END AS client_access_blocked,
 NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='CourseMusicOpeningState') AS no_client_policies,
 (SELECT count(*)=3 FROM (VALUES
 ('CourseMusicOpeningMakeupEntitlement',ARRAY['sourceKey']),('CourseMusicOpeningMakeupEntitlement',ARRAY['sourceSlotKey']),
 ('CourseMusicOpeningMakeupEntitlement',ARRAY['id','storeId','customerId'])
 ) e(t,fields) WHERE EXISTS(SELECT 1 FROM indexes i WHERE i.table_name=e.t AND i.fields=e.fields AND i.indisunique AND i.indisvalid AND i.unfiltered)) AS makeup_indexes_ready,
 (SELECT count(*)=4 FROM (VALUES
 ('CourseMusicOpeningMakeupEntitlement','Store',ARRAY['storeId'],ARRAY['id']),
 ('CourseMusicOpeningMakeupEntitlement','Customer',ARRAY['customerId','storeId'],ARRAY['id','storeId']),
 ('CourseMusicOpeningMakeupEntitlement','CourseTemplate',ARRAY['templateId','storeId'],ARRAY['id','storeId']),
 ('CourseBooking','CourseMusicOpeningMakeupEntitlement',ARRAY['musicOpeningMakeupEntitlementId','storeId','customerId'],ARRAY['id','storeId','customerId'])
 ) e(t,target,fields,target_fields) WHERE EXISTS(SELECT 1 FROM fk f WHERE f.table_name=e.t AND f.target=e.target AND f.fields=e.fields AND f.target_fields=e.target_fields AND f.confdeltype='r' AND f.convalidated)) AS makeup_fks_ready,
 EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='CourseBooking_opening_makeup_active_key' AND i.indisunique AND i.indisvalid
 AND replace(pg_get_expr(i.indpred,i.indrelid),'"','') LIKE '%musicOpeningMakeupEntitlementId IS NOT NULL%'
 AND pg_get_expr(i.indpred,i.indrelid) LIKE '%status <> %CANCELLED%') AS makeup_active_ready,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='CourseMusicOpeningMakeupEntitlement' AND c.relrowsecurity)
 AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='CourseMusicOpeningMakeupEntitlement')
 AND CASE WHEN to_regclass('public."CourseMusicOpeningMakeupEntitlement"') IS NULL THEN false ELSE
 NOT has_table_privilege('anon','public."CourseMusicOpeningMakeupEntitlement"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_table_privilege('authenticated','public."CourseMusicOpeningMakeupEntitlement"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END AS makeup_access_blocked,
 EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='CourseMusicOpeningMakeupEntitlement' AND t.tgname='CourseMusicOpeningMakeupEntitlement_immutable'
 AND NOT t.tgisinternal AND t.tgenabled='O' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']
 AND p.prosrc LIKE '%TG_OP=''DELETE''%' AND p.prosrc LIKE '%NEW.version<>OLD.version+1%'
 AND p.prosrc LIKE '%to_jsonb(NEW)-''version''-''updatedAt''%') AS makeup_immutable_ready,
 EXISTS(SELECT 1 FROM public."Store" WHERE id='store-lubymusic' AND slug='lubymusic' AND "industryModule"::text='COURSE') AS tenant_ready,
 COALESCE((SELECT json_agg(pg_get_constraintdef(p.oid)) FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND p.contype='c' AND p.convalidated AND c.relname IN ('CourseBooking','CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement')),'[]'::json) AS checks;
`;

export function assertMusicOpeningSchema(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Music opening schema capability result is unavailable.");
  const row = rows[0];
  for (const field of ["columns_ready","native_default_ready","policy_default_ready","indexes_ready","fks_ready","rls_ready","client_access_blocked","no_client_policies","tenant_ready","makeup_indexes_ready","makeup_fks_ready","makeup_active_ready","makeup_access_blocked","makeup_immutable_ready"]) {
    if (row[field] !== true) throw new Error(`Music opening schema capability failed: ${field}.`);
  }
  if (!Array.isArray(row.checks)) throw new Error("Music opening schema checks are unavailable.");
  const checks = row.checks.map(value => String(value).replaceAll('"','').replace(/\s+/g,' '));
  const identity = checks.find(value => value.includes("musicOpeningTermKey") && value.includes("musicOpeningSourceLessonKey"));
  const makeup = checks.find(value => value.includes("musicOpeningMakeupEntitlementId") && value.includes("OPENING_MAKEUP"));
  const values = checks.find(value => value.includes("OPENING_MAKEUP") && value.includes("TEACHER_MAKEUP") && value.includes("TRIAL") && value.includes("CARD"));
  if (!values) throw new Error("Music opening booking-values constraint does not include the dedicated kind.");
  const snapshot = checks.find(value => value.includes("SEPARATE_VERIFIED") && value.includes("nativeSourceBooking"));
  if (!makeup || !["customerId IS NOT NULL", "cardId IS NULL", "pointCost = 0", "makeupForBookingId IS NULL", "musicOpeningSourceLessonKey IS NULL", "ATTENDED", "CANCELLED"].every(part => makeup.includes(part)) ||
      !snapshot || !["OUTSTANDING", "VERIFIED", "cutoffBusinessDate", "completedPair"].every(part => snapshot.includes(part))) {
    throw new Error("Music opening makeup constraints do not match the reviewed contract.");
  }
  if (!identity || !["musicOpeningLessonOrdinal IS NOT NULL","musicOpeningLessonOrdinal >= 1","musicOpeningLessonOrdinal <= 100000","cardId IS NOT NULL","customerId IS NOT NULL"].every(part=>identity.includes(part)) ||
      !checks.some(value=>value.includes("contentHash") && value.includes("^[a-f0-9]{64}$")) ||
      !checks.some(value=>value.includes("jsonb_typeof(snapshot)") && value.includes("object")) ||
      !checks.some(value=>value.includes("teacherFeePolicy") && value.includes("UNVERIFIED") && value.includes("MUSIC_V2_ORIGINAL_PRICE"))) {
    throw new Error("Music opening schema constraints do not match the reviewed contract.");
  }
}

/** Injection exists for local unit tests, never as an environment bypass. */
export async function checkMusicOpeningSchema(env, readSchema) {
  assertMusicOpeningPreviewEnvironment(env);
  for (const url of [env.DATABASE_URL,env.DIRECT_URL]) assertMusicOpeningSchema(await readSchema(url));
}

/** Stable diagnostic categories only; never forward driver messages or URLs. */
export function musicOpeningConnectionFailure(error, connectionKind) {
  const code = [error?.code, error?.errorCode].find(value => typeof value === "string" && /^P\d{4}$/.test(value));
  const message = typeof error?.message === "string" ? error.message : "";
  const category = code ?? (/query engine|engine.*not found|could not locate/i.test(message) ? "ENGINE_UNAVAILABLE" : "UNKNOWN");
  const kind = connectionKind === "pooled" ? "pooled" : "direct";
  return new Error(`Music opening isolated schema verification failed (${kind}:${category}); startup/build blocked.`);
}

/** One read-only statement does not need interactive transaction setup/commit.
 * A cold pool acquisition timeout gets one bounded retry against the SAME target.
 * Missing schema, authentication and all other errors never retry or fall back.
 */
export async function readMusicOpeningSchemaConnection(value, createClient) {
  if (!isMusicOpeningDatabase(value)) throw new Error("Music opening connection target rejected.");
  const url = new URL(value);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "10");
  url.searchParams.set("pool_timeout", "15");
  url.searchParams.set("socket_timeout", "15");
  const pooled = url.hostname.endsWith(".pooler.supabase.com");
  if (pooled) url.searchParams.set("pgbouncer", "true");
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = createClient({ datasources: { db: { url: url.toString() } }, log: [] });
    try {
      return await client.$queryRawUnsafe(MUSIC_OPENING_SCHEMA_SQL);
    } catch (error) {
      if (attempt === 1 || (error?.code !== "P2024" && error?.errorCode !== "P2024")) {
        throw musicOpeningConnectionFailure(error, pooled ? "pooled" : "direct");
      }
    } finally { await client.$disconnect().catch(() => {}); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Music opening schema verification exhausted; startup/build blocked.");
}

/** Reuse platform-provided existing credentials without reading/saving them elsewhere. */
export async function runMusicOpeningSchemaPreflight(env = process.env) {
  assertMusicOpeningPreviewEnvironment(env);
  const { PrismaClient } = await import("@prisma/client");
  await checkMusicOpeningSchema(env, value => readMusicOpeningSchemaConnection(value, options => new PrismaClient(options)));
  console.info("[music-opening-preflight] isolated_database=true schema_ready=true tenant_verified=true");
}
