import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLegacyConsultationImport, type LegacyExisting, type LegacyInsert, type LegacyImportStore } from "@/lib/consultation-legacy-import";
import { legacyFixture } from "./fixtures/consultation-legacy";

const db = new PGlite();
const f = legacyFixture();
let original: LegacyInsert;
let sequence = 0;
const insert = async (row: LegacyInsert) => {
  const keys = Object.keys(row);
  await db.query(`INSERT INTO public."ConsultationLead" (${keys.map(key => `"${key}"`).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(row).map(value => value && typeof value === "object" ? JSON.stringify(value) : value));
};
const findByRequestIds = async (ids: readonly string[]) => (await db.query<LegacyExisting>(`SELECT id,"requestId","payloadHash","originalPayload",
  to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt","sheetStatus","sheetAttemptedAt","sheetConfirmedAt","legacyImport"
  FROM public."ConsultationLead" WHERE "requestId"=ANY($1::text[]) ORDER BY "requestId"`, [ids])).rows;
const read = { identity: async () => f.target, source: async () => f.source, findByRequestIds };
const store: LegacyImportStore = { ...read, transaction: async work => {
  await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const result = await work({ ...read, insert: async row => { original ??= structuredClone(row); await insert(row); } });
    await db.exec("COMMIT"); return result;
  } catch (error) { await db.exec("ROLLBACK"); throw error; }
} };
const extra = () => {
  const row = structuredClone(original); row.id = `synthetic-extra-${++sequence}`;
  row.requestId = `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  row.legacyImport!.requestId = row.requestId; return row;
};

describe("legacy additive DDL in isolated in-memory Postgres", () => {
  beforeAll(async () => {
    await db.exec('SET TIME ZONE \'UTC\'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public."TrialApplication" (id text PRIMARY KEY);');
    await db.exec(readFileSync("docs/sql/20261008-consultation-leads.sql", "utf8"));
    await db.exec(`INSERT INTO public."ConsultationLead" (id,"requestId","payloadHash","originalPayload","storeName",industry,"updatedAt")
      VALUES ('synthetic-live','synthetic-live-request',repeat('a',64),'{}','Synthetic live','Synthetic',CURRENT_TIMESTAMP);`);
    await db.exec(readFileSync("docs/sql/20261008-consultation-legacy-import.sql", "utf8"));
  }, 60000);
  afterAll(() => db.close());
  it("preserves existing live data and the old immutable guard", async () => {
    expect((await db.query('SELECT "sheetStatus","legacyImport" FROM public."ConsultationLead" WHERE id=\'synthetic-live\'')).rows).toEqual([{ sheetStatus: "PENDING", legacyImport: null }]);
    const triggers = (await db.query<{ tgname: string }>("SELECT tgname FROM pg_trigger WHERE tgrelid='public.\"ConsultationLead\"'::regclass AND NOT tgisinternal")).rows.map(row => row.tgname);
    expect(triggers).toContain("ConsultationLead_immutable_original"); expect(triggers).toContain("ConsultationLead_immutable_legacy_provenance");
  });
  it("applies 4 synthetic rows in a transaction, then safely skips the same 4", async () => {
    const input = { manifestText: f.manifestText, snapshotText: f.snapshotText, approval: f.approval };
    const options = { mode: "apply" as const, explicitApply: true, actorId: "synthetic-actor", now: () => new Date("2026-10-08T16:00:00.000Z") };
    expect(await runLegacyConsultationImport(store, input, options)).toMatchObject({ inserted: 4, skipped: 0 });
    expect(await runLegacyConsultationImport(store, input, options)).toMatchObject({ inserted: 0, skipped: 4 });
    const rows = await findByRequestIds(f.approval.requestIds);
    expect(rows[0].createdAt).toBe("2026-03-02T23:17:53.984Z");
    expect(rows.every(row => row.sheetStatus === "LEGACY_IMPORTED" && row.sheetAttemptedAt === null && row.sheetConfirmedAt === null)).toBe(true);
  });
  it.each(["null", "empty", "array", "missing", "json-null", "bad-hash", "bad-import-date", "wrong-source-date", "string-bool", "empty-actor", "bad-source-row"])("rejects malformed provenance: %s", async kind => {
    const row = extra(); const p = row.legacyImport!;
    if (kind === "null") row.legacyImport = null;
    if (kind === "empty") row.legacyImport = {} as typeof p;
    if (kind === "array") row.legacyImport = [] as unknown as typeof p;
    if (kind === "missing") delete (p as Partial<typeof p>).sourceRowSha256;
    if (kind === "json-null") (p as unknown as Record<string, unknown>).sourceKind = null;
    if (kind === "bad-hash") p.manifestSha256 = "bad";
    if (kind === "bad-import-date") p.importedAt = "2026-02-30T00:00:00.000Z";
    if (kind === "wrong-source-date") p.sourceCreatedAt = "2026-03-03T00:00:00.000Z";
    if (kind === "string-bool") (p as unknown as Record<string, unknown>).phoneNeedsReview = "true";
    if (kind === "empty-actor") p.importedBy = " ";
    if (kind === "bad-source-row") p.sourceRow = 1;
    await expect(insert(row)).rejects.toThrow(/legacy_provenance_check/);
  });
  it("forbids fabricated HQ attempts and provenance on ordinary live records", async () => {
    const sent = extra(); sent.sheetAttemptedAt = "2026-03-03T00:00:00.000Z";
    await expect(insert(sent)).rejects.toThrow(/sheet_attempt_check/);
    const live = extra(); live.sheetStatus = "PENDING";
    await expect(insert(live)).rejects.toThrow(/legacy_provenance_check/);
  });
  it("keeps provenance and original content immutable, but permits HQ status edits", async () => {
    await expect(db.query('UPDATE public."ConsultationLead" SET "legacyImport"=jsonb_set("legacyImport",\'{sourceRow}\',\'99\') WHERE id=$1', [original.id])).rejects.toThrow(/PROVENANCE_IMMUTABLE/);
    await expect(db.query('UPDATE public."ConsultationLead" SET "originalPayload"=\'{}\' WHERE id=$1', [original.id])).rejects.toThrow(/ORIGINAL_IMMUTABLE/);
    await expect(db.query('UPDATE public."ConsultationLead" SET "createdAt"=CURRENT_TIMESTAMP WHERE id=$1', [original.id])).rejects.toThrow(/ORIGINAL_IMMUTABLE/);
    await db.query('UPDATE public."ConsultationLead" SET status=\'CONTACTED\', revision=revision+1 WHERE id=$1', [original.id]);
    expect((await db.query<{ status: string }>('SELECT status FROM public."ConsultationLead" WHERE id=$1', [original.id])).rows[0].status).toBe("CONTACTED");
  });
  it("is terminal and never eligible for the existing delivery claim", async () => {
    await expect(db.query('UPDATE public."ConsultationLead" SET "sheetStatus"=\'PENDING\' WHERE id=$1', [original.id])).rejects.toThrow(/TRANSITION_INVALID/);
    const result = await db.query('UPDATE public."ConsultationLead" SET "sheetStatus"=\'SENDING\',"sheetAttemptedAt"=CURRENT_TIMESTAMP WHERE id=$1 AND "sheetStatus"=\'PENDING\' AND "sheetAttemptedAt" IS NULL RETURNING id', [original.id]);
    expect(result.rows).toEqual([]);
    expect((await db.query('SELECT * FROM public."TrialApplication"')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public."ConsultationLeadActivity"')).rows).toEqual([]);
  });
  it("keeps the ordinary live delivery transitions working", async () => {
    await db.exec(`UPDATE public."ConsultationLead" SET "sheetStatus"='SENDING',"sheetAttemptedAt"=CURRENT_TIMESTAMP WHERE id='synthetic-live';
      UPDATE public."ConsultationLead" SET "sheetStatus"='CONFIRMED',"sheetConfirmedAt"=CURRENT_TIMESTAMP WHERE id='synthetic-live';`);
    expect((await db.query<{ sheetStatus: string }>('SELECT "sheetStatus" FROM public."ConsultationLead" WHERE id=\'synthetic-live\'')).rows[0].sheetStatus).toBe("CONFIRMED");
  });
  it("preserves browser-role isolation and SECURITY INVOKER helpers", async () => {
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid IN ('public.\"ConsultationLead\"'::regclass,'public.\"ConsultationLeadActivity\"'::regclass)");
    expect(rls.rows).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }]);
    for (const role of ["anon", "authenticated"]) {
      try { await db.exec(`SET ROLE ${role}`); await expect(db.query('SELECT * FROM public."ConsultationLead"')).rejects.toThrow(/permission denied/); }
      finally { await db.exec("RESET ROLE"); }
    }
    expect((await db.query<{ prosecdef: boolean }>("SELECT prosecdef FROM pg_proc WHERE proname IN ('valid_consultation_legacy_provenance','guard_consultation_legacy_provenance')")).rows.every(row => !row.prosecdef)).toBe(true);
  });
});
