import { readFileSync, mkdtempSync, chmodSync, writeFileSync, statSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLegacyPacketBinding, buildLegacyConsultationSqlPacket, LEGACY_PROJECTS, SOURCE_EVIDENCE_MAX_AGE_MS,
  type LegacySourceEvidence, type LegacySqlInput } from "@/lib/consultation-legacy-sql-adapter";
import { sha256 } from "@/lib/consultation-legacy-import";
import { runLegacyPacketCli, readLegacyPrivateFile, writeLegacyPrivatePacket } from "../../scripts/consultation-legacy-import";
import { legacyFixture } from "./fixtures/consultation-legacy";

function fixture() {
  const f = legacyFixture(); f.target.projectId = LEGACY_PROJECTS.preview; f.target.environment = "preview";
  const observedAt = new Date().toISOString(); const values = f.source.rows.map(row => row.formattedValues[27]);
  const sourceEvidence: LegacySourceEvidence = { schemaVersion: 1, evidenceReference: "synthetic-read-reference", observedAt,
    observation: f.source, observationSha256: sha256(JSON.stringify(f.source)),
    uuidScan: { spreadsheetId: f.source.spreadsheetId, sheetId: f.source.sheetId, column: "AB", firstDataRow: 2,
      lastDataRow: 5, scannedAt: observedAt, values, valuesSha256: sha256(JSON.stringify(values)) } };
  return { f, input: { manifestText: f.manifestText, snapshotText: f.snapshotText, approval: f.approval, sourceEvidence } };
}
const apply = { mode: "apply" as const, explicitApply: true, actorId: "synthetic-importer" };
const db = new PGlite();
async function execute(input: LegacySqlInput, mode: Parameters<typeof buildLegacyConsultationSqlPacket>[1] = apply) {
  const packet = buildLegacyConsultationSqlPacket(input, mode);
  assertLegacyPacketBinding(packet, input.approval.target);
  try {
    const result = await db.exec(packet.request.query);
    return result.flatMap(item => item.rows).find(row => Object.hasOwn(row as object, "result")) as { result: Record<string, unknown> };
  } catch (error) { await db.exec("ROLLBACK"); throw error; }
}
const rows = async () => (await db.query('SELECT * FROM public."ConsultationLead" ORDER BY "requestId"')).rows;

describe("offline connector packet contract", () => {
  it("defaults to read-only with an exact isolated connector project and four candidates", () => {
    const { input } = fixture(); const packet = buildLegacyConsultationSqlPacket(input);
    expect(packet).toMatchObject({ mode: "dry-run", request: { project_id: LEGACY_PROJECTS.preview }, summary: { candidates: 4, executed: false } });
    expect(packet.request.query).toContain("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    expect(packet.request.query).not.toContain("INSERT INTO");
  });
  it("pins both approved projects and refuses every other project/environment/database/schema", () => {
    const { input } = fixture(); input.approval.target = { ...input.approval.target, environment: "production", projectId: LEGACY_PROJECTS.production };
    expect(buildLegacyConsultationSqlPacket(input).request.project_id).toBe(LEGACY_PROJECTS.production);
    for (const target of [{ ...input.approval.target, projectId: LEGACY_PROJECTS.preview },
      { ...input.approval.target, environment: "staging" }, { ...input.approval.target, database: "another" },
      { ...input.approval.target, schema: "private" }]) {
      expect(() => buildLegacyConsultationSqlPacket({ ...input, approval: { ...input.approval, target: target as typeof input.approval.target } })).toThrow("TARGET_MISMATCH");
    }
  });
  it("refuses repointing any other manifest to preview, including a freshly rehashed one", () => {
    const { input } = fixture(); input.manifestText += " "; input.approval.manifestSha256 = sha256(input.manifestText);
    expect(() => buildLegacyConsultationSqlPacket(input, apply)).toThrow("PREVIEW_SYNTHETIC_FIXTURE_REQUIRED");
  });
  it("requires explicit apply, actor and the exact four-row reviewed scope", () => {
    const { input } = fixture();
    expect(() => buildLegacyConsultationSqlPacket(input, { mode: "apply", actorId: "actor" })).toThrow("APPLY_GUARDS_REQUIRED");
    expect(() => buildLegacyConsultationSqlPacket(input, { ...apply, actorId: " " })).toThrow("APPLY_GUARDS_REQUIRED");
    expect(() => buildLegacyConsultationSqlPacket({ ...input, approval: { ...input.approval, expectedCandidates: 3 } }, apply)).toThrow("FOUR_ROW_SCOPE_REQUIRED");
  });
  it("rejects a changed packet, connector target, source hash, or stale source evidence", () => {
    const { input } = fixture(); const packet = buildLegacyConsultationSqlPacket(input);
    expect(() => assertLegacyPacketBinding(packet, { ...input.approval.target, environment: "production", projectId: LEGACY_PROJECTS.production })).toThrow("PACKET_TARGET_OR_HASH_MISMATCH");
    expect(() => assertLegacyPacketBinding({ ...packet, request: { ...packet.request, query: packet.request.query + " " } }, input.approval.target)).toThrow("PACKET_TARGET_OR_HASH_MISMATCH");
    const changed = structuredClone(input); changed.sourceEvidence.observation.rows[0].formattedValues[1] = "changed";
    expect(() => buildLegacyConsultationSqlPacket(changed)).toThrow("SOURCE_EVIDENCE_HASH_MISMATCH");
    expect(() => buildLegacyConsultationSqlPacket(input, { now: () => new Date(Date.parse(input.sourceEvidence.observedAt) + SOURCE_EVIDENCE_MAX_AGE_MS + 1) })).toThrow("STALE_SOURCE_EVIDENCE");
  });
  it.each(["duplicate", "missing", "row", "hash", "range", "stale"])("rejects an invalid complete UUID scan: %s", kind => {
    const { input } = fixture(); const scan = input.sourceEvidence.uuidScan;
    if (kind === "duplicate") { scan.values.push(scan.values[0]); scan.lastDataRow++; }
    if (kind === "missing") scan.values[0] = "";
    if (kind === "row") [scan.values[0],scan.values[1]] = [scan.values[1],scan.values[0]];
    if (kind === "range") scan.lastDataRow++;
    scan.valuesSha256 = sha256(JSON.stringify(scan.values));
    if (kind === "hash") scan.valuesSha256 = "a".repeat(64);
    if (kind === "stale") scan.scannedAt = new Date(Date.now() - SOURCE_EVIDENCE_MAX_AGE_MS - 1).toISOString();
    expect(() => buildLegacyConsultationSqlPacket(input)).toThrow(/UUID_SCAN/);
  });
  it("has no network, notification, delivery, trial-write, activity-write, or upsert dependency", () => {
    const source = readFileSync("src/lib/consultation-legacy-sql-adapter.ts", "utf8");
    expect(source).not.toMatch(/from ["'](?:@prisma|@supabase|.*delivery|.*trial|.*notification)|\bfetch\s*\(|ON CONFLICT|\bUPSERT\b/);
    const sql = buildLegacyConsultationSqlPacket(fixture().input, apply).request.query;
    expect(sql).not.toMatch(/INSERT INTO public\."(?:TrialApplication|ConsultationLeadActivity)"|\bUPDATE public\.|\bDELETE FROM|\bALTER TABLE|\bCREATE (?:TABLE|FUNCTION|TRIGGER)|\bGRANT\b|\bREVOKE\b/);
  });
});

describe("actual generated SQL in isolated Postgres", () => {
  beforeAll(async () => {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public."TrialApplication" (id text PRIMARY KEY);');
    await db.exec(readFileSync("docs/sql/20261008-consultation-leads.sql", "utf8"));
    await db.exec(readFileSync("docs/sql/20261008-consultation-legacy-import.sql", "utf8"));
  }, 60000);
  beforeEach(() => db.exec('TRUNCATE public."ConsultationLeadActivity", public."ConsultationLead";'));
  afterAll(() => db.close());
  it("dry-run validates database guards, reports four proposed inserts and leaves no rows", async () => {
    const result = await execute(fixture().input, { mode: "dry-run" });
    expect(result.result).toMatchObject({ mode: "dry-run", candidates: 4, inserted: 0, proposedInsert: 4, skipped: 0, conflicts: 0 });
    expect(await rows()).toEqual([]);
  });
  it("applies four rows with real database time, NULL sent times, then repeats as a byte-for-byte no-op", async () => {
    const { input } = fixture(); const before = Date.now();
    expect((await execute(input)).result).toMatchObject({ inserted: 4, skipped: 0, conflicts: 0, verified: true });
    const inserted = await rows();
    expect(inserted).toHaveLength(4);
    for (const row of inserted as Record<string, unknown>[]) {
      expect(row).toMatchObject({ status: "NEW", revision: 1, sheetStatus: "LEGACY_IMPORTED", sheetAttemptedAt: null, sheetConfirmedAt: null,
        trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null });
      expect(Date.parse((row.legacyImport as { importedAt: string }).importedAt)).toBeGreaterThanOrEqual(before);
    }
    expect((await execute(input)).result).toMatchObject({ inserted: 0, skipped: 4, conflicts: 0 });
    expect(await rows()).toEqual(inserted);
    expect((await db.query('SELECT * FROM public."TrialApplication"')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public."ConsultationLeadActivity"')).rows).toEqual([]);
  });
  it("preserves later HQ status changes on an idempotent replay", async () => {
    const { input } = fixture(); await execute(input);
    await db.exec('UPDATE public."ConsultationLead" SET status=\'CONTACTED\',revision=2;');
    expect((await execute(input)).result).toMatchObject({ inserted: 0, skipped: 4 });
    expect((await rows()).every(row => (row as { status: string }).status === "CONTACTED")).toBe(true);
  });
  it("prevalidates the whole batch and writes none when the last UUID conflicts", async () => {
    const { input } = fixture();
    await db.query('INSERT INTO public."ConsultationLead" (id,"requestId","payloadHash","originalPayload","storeName",industry,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)',
      ["synthetic-conflict", input.approval.requestIds[3], "a".repeat(64), "{}", "synthetic existing", "synthetic"]);
    const before = await rows();
    expect((await execute(input, { mode: "dry-run" })).result).toMatchObject({ conflicts: 1, proposedInsert: 3 });
    await expect(execute(input)).rejects.toThrow("DESTINATION_CONFLICT");
    expect(await rows()).toEqual(before);
  });
  it("safely quotes legitimate apostrophes, backslashes and both SQL comment/dollar-quote markers", async () => {
    const { input } = fixture();
    const actor = "O'Brien \\ café $legacy_import$ '; DROP TABLE public.\"TrialApplication\"; --";
    await execute(input, { ...apply, actorId: actor });
    expect((await rows())[0]).toMatchObject({ legacyImport: { importedBy: actor } });
    expect((await db.query('SELECT * FROM public."TrialApplication"')).rows).toEqual([]);
  });
  it("escapes SQL-like original JSON content without executing it (synthetic in-memory database)", async () => {
    const { f, input } = fixture();
    // The preview manifest is intentionally immutable. Exercise another entirely
    // synthetic approved envelope through the production branch, still only in PGlite.
    input.approval.target = { ...input.approval.target, environment: "production", projectId: LEGACY_PROJECTS.production };
    const storeName = "O'Brien \\ café $legacy_import$ '; DROP TABLE public.\"TrialApplication\"; --";
    f.rows[0].canonicalHqPayload.storeName = storeName;
    f.rows[0].canonicalHqPayloadHash = sha256(JSON.stringify(f.rows[0].canonicalHqPayload));
    f.source.rows[0].formattedValues[1] = storeName;
    f.rows[0].rawRowSha256 = sha256(JSON.stringify(f.source.rows[0].formattedValues));
    input.manifestText = JSON.stringify(f.manifest); input.approval.manifestSha256 = sha256(input.manifestText);
    input.sourceEvidence.observationSha256 = sha256(JSON.stringify(f.source));
    await execute(input);
    expect((await rows())[0]).toMatchObject({ storeName, originalPayload: { storeName } });
    expect((await db.query('SELECT * FROM public."TrialApplication"')).rows).toEqual([]);
  });
  it("checks source freshness again at execution time", async () => {
    const { input } = fixture(); const old = new Date(Date.now() - SOURCE_EVIDENCE_MAX_AGE_MS - 2000);
    input.sourceEvidence.observedAt = old.toISOString(); input.sourceEvidence.uuidScan.scannedAt = old.toISOString();
    const packet = buildLegacyConsultationSqlPacket(input, { ...apply, now: () => old });
    await expect(db.exec(packet.request.query)).rejects.toThrow("STALE_SOURCE_EVIDENCE"); await db.exec("ROLLBACK");
    expect(await rows()).toEqual([]);
  });
  it("accepts only the verified preview NULL-config baseline without changing those functions", async () => {
    await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      await db.exec("ALTER FUNCTION public.guard_consultation_lead_update() RESET ALL; ALTER FUNCTION public.guard_consultation_activity_append_only() RESET ALL;");
      const packet = buildLegacyConsultationSqlPacket(fixture().input, apply);
      await db.exec(packet.request.query.replace("BEGIN ISOLATION LEVEL SERIALIZABLE;", "").replace(/COMMIT;$/, ""));
      expect(await rows()).toHaveLength(4);
      expect((await db.query("SELECT proconfig FROM pg_proc WHERE proname IN ('guard_consultation_lead_update','guard_consultation_activity_append_only')")).rows)
        .toEqual([{ proconfig: null }, { proconfig: null }]);
    } finally { await db.exec("ROLLBACK"); }
  });
  it("does not allow the preview configuration exception against production", async () => {
    await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      await db.exec("ALTER FUNCTION public.guard_consultation_lead_update() RESET ALL;");
      const { input } = fixture(); input.approval.target = { ...input.approval.target, environment: "production", projectId: LEGACY_PROJECTS.production };
      const packet = buildLegacyConsultationSqlPacket(input, apply);
      await expect(db.exec(packet.request.query.replace("BEGIN ISOLATION LEVEL SERIALIZABLE;", "").replace(/COMMIT;$/, ""))).rejects.toThrow("FUNCTION_DRIFT");
    } finally { await db.exec("ROLLBACK"); }
    expect(await rows()).toEqual([]);
  });
  it.each(["rls", "grant", "column-grant", "function", "trigger", "disabled", "constraint"])("fails closed on %s drift", async kind => {
    await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      if (kind === "rls") await db.exec('ALTER TABLE public."ConsultationLead" DISABLE ROW LEVEL SECURITY;');
      if (kind === "grant") await db.exec('GRANT SELECT ON public."ConsultationLead" TO anon;');
      if (kind === "column-grant") await db.exec('GRANT SELECT (phone) ON public."ConsultationLead" TO authenticated;');
      if (kind === "function") await db.exec("CREATE OR REPLACE FUNCTION public.guard_consultation_legacy_provenance() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END;';");
      if (kind === "trigger") await db.exec('CREATE TRIGGER unexpected_insert BEFORE INSERT ON public."ConsultationLead" FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_legacy_provenance();');
      if (kind === "disabled") await db.exec('ALTER TABLE public."ConsultationLead" DISABLE TRIGGER "ConsultationLead_immutable_original";');
      if (kind === "constraint") await db.exec('ALTER TABLE public."ConsultationLead" DROP CONSTRAINT "ConsultationLead_sheet_attempt_check";');
      // Execute the generated body in this test transaction, preserving injected drift.
      const packet = buildLegacyConsultationSqlPacket(fixture().input, apply);
      await expect(db.exec(packet.request.query.replace("BEGIN ISOLATION LEVEL SERIALIZABLE;", "").replace(/COMMIT;$/, ""))).rejects.toThrow(/LEGACY_SQL_.*DRIFT/);
    } finally { await db.exec("ROLLBACK"); }
    expect(await rows()).toEqual([]);
  });
  it("rolls back an earlier insert if a later insert fails during execution", async () => {
    // Inject an isolated test fault after the first actual INSERT. Production packets
    // never contain this statement; this checks their enclosing transaction boundary.
    const packet = buildLegacyConsultationSqlPacket(fixture().input, apply);
    const injected = packet.request.query.replace("inserted := inserted + 1;", "inserted := inserted + 1; IF inserted=2 THEN RAISE EXCEPTION 'synthetic second insert failure'; END IF;");
    await expect(db.exec(injected)).rejects.toThrow("synthetic second insert failure");
    await db.exec("ROLLBACK"); expect(await rows()).toEqual([]);
  });
});

describe("credential-free private CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "legacy-cli-synthetic-")); chmodSync(dir, 0o700);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, value: string) => { const path = join(dir, name); writeFileSync(path, value, { mode: 0o600 }); return path; };
  function args() {
    const { input } = fixture();
    return ["--manifest", write("manifest.json", input.manifestText), "--snapshot", write("snapshot.json", input.snapshotText),
      "--approval", write("approval.json", JSON.stringify(input.approval)), "--source-evidence", write("evidence.json", JSON.stringify(input.sourceEvidence))];
  }
  it("defaults to summary only and does not claim destination execution", () => {
    const output = runLegacyPacketCli(args());
    expect(JSON.parse(output)).toMatchObject({ mode: "dry-run", executed: false, destinationChecked: false, packetWritten: false, candidates: 4 });
    expect(output).not.toMatch(/合成|900000001|INSERT INTO|10000000-0000|synthetic-read-reference/);
  });
  it("writes only an explicitly requested exclusive mode-0600 packet", () => {
    const output = join(dir, "apply.json");
    expect(JSON.parse(runLegacyPacketCli([...args(), "--apply-packet", "--actor", "synthetic-actor", "--packet-file", output]))).toMatchObject({ mode: "apply", packetWritten: true });
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, "utf8")).request.project_id).toBe(LEGACY_PROJECTS.preview);
    expect(() => writeLegacyPrivatePacket(output, {})).toThrow();
  });
  it("rejects broad permissions, symlinks, repo paths, unknown flags and unguarded apply", () => {
    const broad = write("broad.json", "{}"); chmodSync(broad, 0o644);
    expect(() => readLegacyPrivateFile(broad)).toThrow("PRIVATE_FILE_REQUIRED");
    const link = join(dir, "link.json"); symlinkSync(broad, link);
    expect(() => readLegacyPrivateFile(link)).toThrow();
    const repo = join(dir, "repo"); mkdirSync(repo, { mode: 0o700 }); writeFileSync(join(repo, ".git"), "synthetic");
    expect(() => writeLegacyPrivatePacket(join(repo, "packet.json"), {})).toThrow("REPOSITORY_PATH_REFUSED");
    expect(() => runLegacyPacketCli(["--token", "secret"])).toThrow("UNKNOWN_OR_DUPLICATE_ARGUMENT");
    expect(() => runLegacyPacketCli([...args(), "--apply-packet"])).toThrow("APPLY_REQUIRES_PRIVATE_PACKET_FILE");
  });
});
