/** Offline Supabase execute_sql packets. This module has no network/DB client or credentials.
 * The orchestrator must send request unchanged to execute_sql, inspect its result, then
 * refresh the source and exact destination UUIDs. After uncertain delivery, reconcile with
 * a fresh dry-run first; there is deliberately no transport or automatic retry here.
 */
import { z } from "zod";
import { planLegacyConsultationImport, sha256, type LegacyApproval, type LegacySourceObservation, type LegacyTarget } from "./consultation-legacy-import";

export const LEGACY_PROJECTS = { production: "qijlnhtpbintanzpxkvf", preview: "ttworfzgwejdeolegkxl" } as const;
export const SOURCE_EVIDENCE_MAX_AGE_MS = 10 * 60 * 1000;
// Public synthetic fixture only. A private manifest can never be repointed to preview.
const PREVIEW_MANIFEST_SHA256 = "df69353cf573abf72b5ac2fcdfaea6ded0e4545e86e8876892348ac7be23537f";
const PREVIEW_SNAPSHOT_SHA256 = "5b77343bd881a4f425bde1ec9979946ec1add11de02010d4c63159977bac4de8";
const iso = z.string().datetime({ precision: 3, offset: false });
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const fail = (code: string): never => { throw new Error(`LEGACY_SQL_${code}`); };
export type LegacySourceEvidence = {
  schemaVersion: 1;
  /** Exact read-only source-tool response/reference retained by the orchestrator. */
  evidenceReference: string;
  observedAt: string;
  observationSha256: string;
  observation: LegacySourceObservation;
  /** Fresh full canonical-tab UUID column, including blank rows through the
   * tab's declared last data row. Four selected rows alone cannot prove uniqueness. */
  uuidScan: {
    spreadsheetId: string; sheetId: number; column: "AB"; firstDataRow: 2;
    lastDataRow: number; scannedAt: string; values: string[]; valuesSha256: string;
  };
};
export type LegacySqlPacket = {
  schemaVersion: 1; mode: "dry-run" | "apply"; target: LegacyTarget;
  request: { project_id: string; query: string }; querySha256: string;
  manifestSha256: string; snapshotSha256: string; sourceObservationSha256: string;
  uuidScanSha256: string; sourceObservedAt: string; uuidScannedAt: string;
  sourceEvidenceReference: string; evidenceExpiresAt: string;
  summary: { candidates: 4; excludedTests: number; excludedMirrors: number; phoneReviewCount: number; executed: false };
};
export type LegacySqlInput = { manifestText: string; snapshotText: string; approval: LegacyApproval; sourceEvidence: LegacySourceEvidence };

// These signatures come from the two reviewed 20261008 consultation DDL files.
// Any schema/guard drift is a blocker requiring inspection, never a reason to weaken the checks.
const EXPECTED_CONSTRAINTS = [{"name":"ConsultationLead_legacy_provenance_check","hash":"6812aac45aef17ac184cdfceb3992ecd979dc56ac781d350a018cd0933da8a5d"},{"name":"ConsultationLead_manual_link_check","hash":"175c4d311e3805270712f0e417998e83003ff99c70698688f758da17bdfd02b5"},{"name":"ConsultationLead_originalPayload_check","hash":"abc9b9e2bef16a0a5edf67a4e2c0821f812d75312d42f48f8b35f1762f45f79c"},{"name":"ConsultationLead_payloadHash_check","hash":"d2369f0345b1220c432b98512ef2a4bfc42431c789a496f9801c84430f2a4248"},{"name":"ConsultationLead_pkey","hash":"8c8464f42472e42ee190fc91ca8db79b5351d3a4609040516578d229c56f6fa5"},{"name":"ConsultationLead_revision_check","hash":"7c0ddfd91f9bdc7bd607f558b7220a0d09efdbea0973a07402460329265b9c9f"},{"name":"ConsultationLead_sheetStatus_check","hash":"95cd3ec13e649562ae511e7d339ffbada84fe062b182130cc3be9a6cb1d512af"},{"name":"ConsultationLead_sheet_attempt_check","hash":"038752731ab962c18a9004a0fb2abf10f7567fbee087da5d005b1a35f9945c18"},{"name":"ConsultationLead_status_check","hash":"426506949adcbd2e24441b05273a9de4e22b091280b4964279ec2efefa66be6b"},{"name":"ConsultationLead_trialApplicationId_fkey","hash":"c89bfab881d73fc343cec63d11a90138915f8c777e0dc273a19980eb5790908d"}] as const;
const EXPECTED_COLUMNS = [{"name":"contactName","type":"text","required":false,"default":null},{"name":"contactWay","type":"text","required":false,"default":null},{"name":"createdAt","type":"timestamp(3) without time zone","required":true,"default":"CURRENT_TIMESTAMP"},{"name":"facebookUrl","type":"text","required":false,"default":null},{"name":"id","type":"text","required":true,"default":null},{"name":"industry","type":"text","required":true,"default":null},{"name":"instagramUrl","type":"text","required":false,"default":null},{"name":"legacyImport","type":"jsonb","required":false,"default":null},{"name":"lineId","type":"text","required":false,"default":null},{"name":"originalPayload","type":"jsonb","required":true,"default":null},{"name":"payloadHash","type":"text","required":true,"default":null},{"name":"phone","type":"text","required":false,"default":null},{"name":"requestId","type":"text","required":true,"default":null},{"name":"revision","type":"integer","required":true,"default":"1"},{"name":"sheetAttemptedAt","type":"timestamp(3) without time zone","required":false,"default":null},{"name":"sheetConfirmedAt","type":"timestamp(3) without time zone","required":false,"default":null},{"name":"sheetStatus","type":"text","required":true,"default":"'PENDING'::text"},{"name":"status","type":"text","required":true,"default":"'NEW'::text"},{"name":"storeName","type":"text","required":true,"default":null},{"name":"trialApplicationId","type":"text","required":false,"default":null},{"name":"trialLinkedAt","type":"timestamp(3) without time zone","required":false,"default":null},{"name":"trialLinkedBy","type":"text","required":false,"default":null},{"name":"updatedAt","type":"timestamp(3) without time zone","required":true,"default":null},{"name":"websiteUrl","type":"text","required":false,"default":null}] as const;
const EXPECTED_FUNCTIONS = [{"name":"guard_consultation_activity_append_only","hash":"7eb1fddcec99ca18df5b912d5290346aa2af321e88c228b80617627d9b1680aa","args":"","result":"trigger","volatility":"v"},{"name":"guard_consultation_lead_update","hash":"9f5d65b6f692c4723099b87d0c4509ab3d5588839734e360cafe1b72b0e0fe38","args":"","result":"trigger","volatility":"v"},{"name":"guard_consultation_legacy_provenance","hash":"50b457eef80659fb97ddd7b219f6ecb009835705d66af02b81815665edb96219","args":"","result":"trigger","volatility":"v"},{"name":"valid_consultation_legacy_provenance","hash":"81f9f1d1b536649fa6df6693e277e68061106bf55dd497cc80f30b96e3b44b4b","args":"jsonb, text, timestamp without time zone","result":"boolean","volatility":"i"}] as const;

/** E-strings escape both quotes and backslashes independently of session settings.
 * Dollar quoting is used only for our static DO body, never around user data. */
function sqlText(value: string): string {
  if (value.includes("\0")) fail("NUL_IN_INPUT");
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}
const sqlJson = (value: unknown) => `${sqlText(JSON.stringify(value))}::jsonb`;
function verifyTarget(target: LegacyTarget) {
  if (!target || !Object.hasOwn(LEGACY_PROJECTS, target.environment)
    || target.projectId !== LEGACY_PROJECTS[target.environment]
    || target.database !== "postgres" || target.schema !== "public") fail("TARGET_MISMATCH");
}
export function assertLegacyPacketBinding(packet: LegacySqlPacket, connectorTarget: LegacyTarget) {
  verifyTarget(connectorTarget); verifyTarget(packet.target);
  if (packet.target.environment !== connectorTarget.environment
    || packet.request.project_id !== connectorTarget.projectId
    || packet.querySha256 !== sha256(packet.request.query)) fail("PACKET_TARGET_OR_HASH_MISMATCH");
}

// The two old preview trigger functions have verified identical bodies and NULL
// proconfig. Only preview accepts that observed baseline; production requires empty search_path.
const securityGuards = (target: LegacyTarget) => `
  IF current_database() <> 'postgres' OR current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'LEGACY_SQL_DATABASE_OR_TRANSACTION_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public."ConsultationLead"'::regclass,
      'public."ConsultationLeadActivity"'::regclass) AND relkind='r' AND relrowsecurity)=2 IS NOT TRUE
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid IN ('public."ConsultationLead"'::regclass,
      'public."ConsultationLeadActivity"'::regclass))
    OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class IN ('public."ConsultationLead"'::regclass,
      'public."ConsultationLeadActivity"'::regclass)) THEN
    RAISE EXCEPTION 'LEGACY_SQL_RLS_OR_RULE_DRIFT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid IN ('public."ConsultationLead"'::regclass,'public."ConsultationLeadActivity"'::regclass) AND (a.grantee=0 OR (a.grantee<>c.relowner AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname='service_role'))))
    OR EXISTS (SELECT 1 FROM pg_attribute a, LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid IN ('public."ConsultationLead"'::regclass,'public."ConsultationLeadActivity"'::regclass) )
    OR EXISTS (SELECT 1 FROM pg_roles r CROSS JOIN (VALUES ('public."ConsultationLead"'),('public."ConsultationLeadActivity"')) t(name)
      WHERE r.rolname IN ('anon','authenticated') AND (has_table_privilege(r.oid,t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(r.oid,t.name,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
    RAISE EXCEPTION 'LEGACY_SQL_BROWSER_GRANT_DRIFT';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public."ConsultationLead"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      IS DISTINCT FROM ${sqlJson(EXPECTED_COLUMNS)} THEN
    RAISE EXCEPTION 'LEGACY_SQL_COLUMN_DRIFT';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('name',conname,'hash',encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')) ORDER BY conname)
    FROM pg_constraint WHERE conrelid='public."ConsultationLead"'::regclass AND contype<>'n')
      IS DISTINCT FROM ${sqlJson(EXPECTED_CONSTRAINTS)}
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."ConsultationLead"'::regclass AND NOT convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='requestId'
      WHERE i.indrelid='public."ConsultationLead"'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indimmediate AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indexprs IS NULL AND i.indpred IS NULL) THEN
    RAISE EXCEPTION 'LEGACY_SQL_CONSTRAINT_DRIFT';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'hash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
      'args',oidvectortypes(p.proargtypes),'result',format_type(p.prorettype,NULL),'volatility',p.provolatile) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('guard_consultation_lead_update',
      'guard_consultation_activity_append_only','guard_consultation_legacy_provenance','valid_consultation_legacy_provenance')
      AND NOT p.prosecdef AND l.lanname='plpgsql' AND (p.proconfig=ARRAY['search_path=""']::text[]
        OR (${target.environment === "preview" ? "true" : "false"} AND p.proconfig IS NULL
          AND p.proname IN ('guard_consultation_lead_update','guard_consultation_activity_append_only'))))
      IS DISTINCT FROM ${sqlJson(EXPECTED_FUNCTIONS)} THEN
    RAISE EXCEPTION 'LEGACY_SQL_FUNCTION_DRIFT';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public."ConsultationLead"'::regclass AND NOT tgisinternal) <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public."ConsultationLead"'::regclass
      AND tgname='ConsultationLead_immutable_original' AND tgenabled='O' AND tgtype=19 AND tgnargs=0 AND tgqual IS NULL
      AND tgfoid='public.guard_consultation_lead_update()'::regprocedure)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public."ConsultationLead"'::regclass
      AND tgname='ConsultationLead_immutable_legacy_provenance' AND tgenabled='O' AND tgtype=19 AND tgnargs=0 AND tgqual IS NULL
      AND tgfoid='public.guard_consultation_legacy_provenance()'::regprocedure)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public."ConsultationLead"'::regclass AND (tgtype & 4)=4
      AND (NOT tgisinternal OR tgfoid <> 'pg_catalog."RI_FKey_check_ins"()'::regprocedure)) THEN
    RAISE EXCEPTION 'LEGACY_SQL_TRIGGER_DRIFT';
  END IF;`;

// Both first-pass conflict detection and postverification use the same immutable
// match. Mutable HQ status/contact edits and the original importer may differ on replay.
const immutableMatch = `d."payloadHash" = row_data->>'payloadHash'
  AND d."originalPayload" = row_data->'payload'
  AND d."createdAt" = (row_data->>'createdAt')::timestamptz AT TIME ZONE 'UTC'
  AND d."sheetStatus" = 'LEGACY_IMPORTED' AND d."sheetAttemptedAt" IS NULL AND d."sheetConfirmedAt" IS NULL
  AND (d."legacyImport" - 'importedAt' - 'importedBy') = row_data->'provenance'
  AND public.valid_consultation_legacy_provenance(d."legacyImport",d."requestId",d."createdAt") IS TRUE`;

export function buildLegacyConsultationSqlPacket(input: LegacySqlInput, options: {
  mode?: "dry-run" | "apply"; explicitApply?: boolean; actorId?: string; now?: () => Date;
} = {}): LegacySqlPacket {
  verifyTarget(input.approval.target);
  if (input.approval.expectedCandidates !== 4 || input.approval.requestIds.length !== 4) fail("FOUR_ROW_SCOPE_REQUIRED");
  if (input.approval.target.environment === "preview" && (input.approval.manifestSha256 !== PREVIEW_MANIFEST_SHA256
    || input.approval.snapshotSha256 !== PREVIEW_SNAPSHOT_SHA256)) fail("PREVIEW_SYNTHETIC_FIXTURE_REQUIRED");
  const mode = options.mode ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") fail("INVALID_MODE");
  if (mode === "apply" && (options.explicitApply !== true || !options.actorId?.trim())) fail("APPLY_GUARDS_REQUIRED");
  const evidence = input.sourceEvidence;
  if (evidence.schemaVersion !== 1 || !evidence.evidenceReference?.trim()) fail("SOURCE_EVIDENCE_REQUIRED");
  iso.parse(evidence.observedAt); hash.parse(evidence.observationSha256);
  if (evidence.observationSha256 !== sha256(JSON.stringify(evidence.observation))) fail("SOURCE_EVIDENCE_HASH_MISMATCH");
  const now = (options.now ?? (() => new Date()))().getTime();
  const observedAt = Date.parse(evidence.observedAt);
  if (!Number.isFinite(now) || observedAt > now || now - observedAt > SOURCE_EVIDENCE_MAX_AGE_MS) fail("STALE_SOURCE_EVIDENCE");
  const scan = evidence.uuidScan;
  if (!scan || scan.spreadsheetId !== evidence.observation.spreadsheetId || scan.sheetId !== evidence.observation.sheetId
    || scan.column !== "AB" || scan.firstDataRow !== 2 || !Number.isInteger(scan.lastDataRow)
    || scan.lastDataRow < 2 || scan.lastDataRow > 1_000_000 || scan.values.length !== scan.lastDataRow - 1
    || scan.values.some(value => typeof value !== "string")
    || scan.valuesSha256 !== sha256(JSON.stringify(scan.values))) fail("UUID_SCAN_INVALID");
  iso.parse(scan.scannedAt);
  const scannedAt = Date.parse(scan.scannedAt);
  if (scannedAt > now || now - scannedAt > SOURCE_EVIDENCE_MAX_AGE_MS) fail("STALE_UUID_SCAN");
  for (const id of input.approval.requestIds) {
    const sourceRow = evidence.observation.rows.find(row => row.formattedValues[27] === id)?.sourceRow;
    if (scan.values.filter(value => value === id).length !== 1 || sourceRow === undefined
      || scan.values[sourceRow - scan.firstDataRow] !== id) fail("UUID_SCAN_MISSING_OR_DUPLICATE");
  }
  const plan = planLegacyConsultationImport({ ...input, actualTarget: input.approval.target, source: evidence.observation, existing: [] });
  const manifest = JSON.parse(input.manifestText) as { spreadsheetId: string; sourceSheetId: number };
  const rows = plan.insert.map(row => ({ requestId: row.originalRequestId, payloadHash: row.canonicalHqPayloadHash,
    payload: row.canonicalHqPayload, createdAt: row.sourceDate.createdAt,
    provenance: { sourceKind: "GOOGLE_SHEETS", spreadsheetId: manifest.spreadsheetId, sheetId: manifest.sourceSheetId,
      requestId: row.originalRequestId, sourceRow: row.sourceRow, sourceRowSha256: row.rawRowSha256,
      snapshotSha256: input.approval.snapshotSha256, manifestSha256: input.approval.manifestSha256,
      sourceCreatedAt: row.sourceDate.createdAt, sourceTimezone: row.sourceDate.timezone, sourceStatus: row.originalStatus,
      sourceFollowUpNote: row.originalFollowUpNote, sourceNotificationStatus: row.originalNotificationStatus,
      sourceSubmissionFingerprint: row.sourceSubmissionFingerprint,
      phoneNeedsReview: row.warnings.some(w => w.startsWith("PHONE_STORED_AS_NUMBER:")) } }));
  const evidenceExpiresAt = new Date(Math.min(observedAt, scannedAt) + SOURCE_EVIDENCE_MAX_AGE_MS).toISOString();
  // Protect our static dollar delimiter even when a legitimate field contains it.
  let delimiter = "$legacy_import$";
  while (JSON.stringify(rows).includes(delimiter) || (options.actorId ?? "").includes(delimiter)) delimiter = `$${delimiter.slice(1, -1)}_$`;
  const applySql = mode === "apply" ? `
  IF conflicts <> 0 THEN RAISE EXCEPTION 'LEGACY_SQL_DESTINATION_CONFLICT'; END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(batch) LOOP
    IF NOT EXISTS (SELECT 1 FROM public."ConsultationLead" WHERE "requestId"=row_data->>'requestId') THEN
      INSERT INTO public."ConsultationLead" (id,"requestId","payloadHash","originalPayload","storeName",industry,
        "contactName",phone,"lineId","contactWay","websiteUrl","facebookUrl","instagramUrl",status,revision,
        "sheetStatus","sheetAttemptedAt","sheetConfirmedAt","trialApplicationId","trialLinkedAt","trialLinkedBy",
        "createdAt","updatedAt","legacyImport")
      VALUES (pg_catalog.gen_random_uuid()::text,row_data->>'requestId',row_data->>'payloadHash',row_data->'payload',
        row_data->'payload'->>'storeName',row_data->'payload'->>'industry',
        nullif(row_data->'payload'->>'contactName',''),nullif(row_data->'payload'->>'phone',''),
        nullif(row_data->'payload'->>'lineId',''),nullif(row_data->'payload'->>'contactWay',''),
        nullif(row_data->'payload'->>'websiteUrl',''),nullif(row_data->'payload'->>'facebookUrl',''),
        nullif(row_data->'payload'->>'instagramUrl',''),'NEW',1,'LEGACY_IMPORTED',NULL,NULL,NULL,NULL,NULL,
        (row_data->>'createdAt')::timestamptz AT TIME ZONE 'UTC',import_time AT TIME ZONE 'UTC',
        row_data->'provenance' || jsonb_build_object('importedAt',to_char(import_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'importedBy',${sqlText(options.actorId!.trim())}));
      inserted := inserted + 1;
    END IF;
  END LOOP;
  FOR row_data IN SELECT value FROM jsonb_array_elements(batch) LOOP
    IF (SELECT count(*) FROM public."ConsultationLead" d WHERE d."requestId"=row_data->>'requestId' AND (${immutableMatch})) <> 1 THEN
      RAISE EXCEPTION 'LEGACY_SQL_POST_VERIFICATION_FAILED';
    END IF;
  END LOOP;
  IF inserted + skipped <> 4 THEN RAISE EXCEPTION 'LEGACY_SQL_POST_COUNT_MISMATCH'; END IF;` : "";
  const query = `BEGIN ISOLATION LEVEL SERIALIZABLE${mode === "dry-run" ? " READ ONLY" : ""};
SET LOCAL search_path = pg_catalog, public;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
${mode === "apply" ? 'LOCK TABLE public."ConsultationLead" IN SHARE ROW EXCLUSIVE MODE;' : ""}
DO ${delimiter}
DECLARE batch jsonb := ${sqlJson(rows)}; row_data jsonb; import_time timestamptz := clock_timestamp();
  matched integer; present integer; inserted integer := 0; skipped integer := 0; conflicts integer := 0;
BEGIN
${securityGuards(input.approval.target)}
  IF clock_timestamp() < ${sqlText(new Date(Math.max(observedAt, scannedAt)).toISOString())}::timestamptz
    OR clock_timestamp() > ${sqlText(evidenceExpiresAt)}::timestamptz THEN RAISE EXCEPTION 'LEGACY_SQL_STALE_SOURCE_EVIDENCE'; END IF;
  IF jsonb_array_length(batch) <> 4 THEN RAISE EXCEPTION 'LEGACY_SQL_FOUR_ROW_SCOPE_REQUIRED'; END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(batch) LOOP
    IF import_time < (row_data->>'createdAt')::timestamptz THEN RAISE EXCEPTION 'LEGACY_SQL_IMPORT_BEFORE_SOURCE_DATE'; END IF;
    SELECT count(*), count(*) FILTER (WHERE ${immutableMatch}) INTO present, matched
      FROM public."ConsultationLead" d WHERE d."requestId"=row_data->>'requestId';
    IF present = 1 AND matched = 1 THEN skipped := skipped + 1;
    ELSIF present <> 0 THEN conflicts := conflicts + 1; END IF;
  END LOOP;
${applySql}
  IF clock_timestamp() > ${sqlText(evidenceExpiresAt)}::timestamptz THEN RAISE EXCEPTION 'LEGACY_SQL_STALE_SOURCE_EVIDENCE'; END IF;
  PERFORM set_config('legacy_import.result',jsonb_build_object('mode',${sqlText(mode)},'candidates',4,
    'inserted',inserted,'proposedInsert',4-skipped-conflicts,'skipped',skipped,'conflicts',conflicts,
    'verified',${mode === "apply" ? "true" : "false"},'manifestSha256',${sqlText(input.approval.manifestSha256)})::text,true);
END;
${delimiter};
SELECT current_setting('legacy_import.result')::jsonb AS result;
COMMIT;`;
  return { schemaVersion: 1, mode, target: input.approval.target,
    request: { project_id: input.approval.target.projectId, query }, querySha256: sha256(query),
    manifestSha256: input.approval.manifestSha256, snapshotSha256: input.approval.snapshotSha256,
    sourceObservationSha256: evidence.observationSha256, uuidScanSha256: scan.valuesSha256,
    sourceObservedAt: evidence.observedAt, uuidScannedAt: scan.scannedAt,
    sourceEvidenceReference: evidence.evidenceReference, evidenceExpiresAt,
    summary: { candidates: 4, excludedTests: plan.excludedTests, excludedMirrors: plan.excludedMirrors,
      phoneReviewCount: plan.phoneReviewCount, executed: false } };
}
