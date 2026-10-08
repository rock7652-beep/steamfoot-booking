import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This database is in-memory only. No environment URL, Prisma client, network,
// connected account, or production data is involved.
const db = new PGlite();
const sql = readFileSync("docs/sql/20261008-consultation-leads.sql", "utf8");
const hash = "a".repeat(64);
const addLead = (id: string, requestId = id) => db.query(
  `INSERT INTO "ConsultationLead" (id, "requestId", "payloadHash", "originalPayload", "storeName", industry, "updatedAt")
   VALUES ($1, $2, $3, '{"storeName":"Synthetic studio"}'::jsonb, 'Synthetic studio', '一般店家', NOW())`,
  [id, requestId, hash],
);
const readLead = async (id: string) => (await db.query<Record<string, unknown>>('SELECT * FROM "ConsultationLead" WHERE id=$1', [id])).rows[0];

describe("manual additive consultation SQL in isolated PostgreSQL", () => {
  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE "TrialApplication" (id TEXT PRIMARY KEY, "storeName" TEXT NOT NULL);
      INSERT INTO "TrialApplication" VALUES ('trial-synthetic', 'Synthetic studio');`);
    await db.exec(sql);
  }, 30000);
  afterAll(() => db.close());

  it("creates a separate, unlinked consultation without importing or changing existing trial data", async () => {
    await addLead("lead-separate");
    expect(await readLead("lead-separate")).toMatchObject({ trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null, status: "NEW", revision: 1, sheetStatus: "PENDING", phone: null, lineId: null });
    expect((await db.query('SELECT * FROM "TrialApplication"')).rows).toEqual([{ id: "trial-synthetic", storeName: "Synthetic studio" }]);
  });

  it("enforces unique requestId without matching store names", async () => {
    await addLead("lead-first", "request-duplicate");
    await expect(addLead("lead-duplicate", "request-duplicate")).rejects.toMatchObject({ code: "23505" });
    await addLead("lead-same-store", "request-separate");
    expect((await db.query('SELECT id FROM "ConsultationLead" WHERE id IN (\'lead-first\',\'lead-same-store\')')).rows).toHaveLength(2);
  });

  it("prevents changing original identity, content, fingerprint, or creation time while allowing HQ status edits", async () => {
    await addLead("lead-immutable");
    for (const assignment of [
      '"originalPayload"=\'{"changed":true}\'::jsonb',
      `"payloadHash"='${"b".repeat(64)}'`,
      '"requestId"=\'changed\'',
      '"createdAt"=\'2020-01-01\'',
      'id=\'changed-id\'',
    ]) {
      await expect(db.exec(`UPDATE "ConsultationLead" SET ${assignment} WHERE id='lead-immutable'`)).rejects.toThrow("CONSULTATION_ORIGINAL_IMMUTABLE");
    }
    await db.exec(`UPDATE "ConsultationLead" SET status='CONTACTED', revision=revision+1 WHERE id='lead-immutable'`);
    expect(await readLead("lead-immutable")).toMatchObject({ originalPayload: { storeName: "Synthetic studio" }, payloadHash: hash, requestId: "lead-immutable", status: "CONTACTED", revision: 2 });
  });

  it("uses conditional updates for a single irreversible Sheet attempt and preserves UNKNOWN", async () => {
    await addLead("lead-single-attempt");
    const claim = () => db.query(`UPDATE "ConsultationLead" SET "sheetStatus"='SENDING', "sheetAttemptedAt"=NOW() WHERE id='lead-single-attempt' AND "sheetStatus"='PENDING' AND "sheetAttemptedAt" IS NULL RETURNING id`);
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.map((result) => result.rows.length)).toEqual([1, 0]);
    await db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='UNKNOWN' WHERE id='lead-single-attempt'`);
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='PENDING', "sheetAttemptedAt"=NULL WHERE id='lead-single-attempt'`)).rejects.toThrow("CONSULTATION_SHEET_TRANSITION_INVALID");
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='SENDING' WHERE id='lead-single-attempt'`)).rejects.toThrow("CONSULTATION_SHEET_TRANSITION_INVALID");
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetAttemptedAt"='2020-01-01' WHERE id='lead-single-attempt'`)).rejects.toThrow("CONSULTATION_SHEET_ATTEMPT_IMMUTABLE");
    expect((await claim()).rows).toHaveLength(0);
    expect((await readLead("lead-single-attempt")).sheetStatus).toBe("UNKNOWN");
  });

  it("keeps Preview-only receipts terminal and impossible to claim", async () => {
    await db.query(`INSERT INTO "ConsultationLead" (id, "requestId", "payloadHash", "originalPayload", "storeName", industry, "sheetStatus", "updatedAt")
      VALUES ('lead-preview-only', 'request-preview-only', $1, '{}'::jsonb, 'Synthetic preview studio', '一般店家', 'NOT_SENT_PREVIEW', NOW())`, [hash]);
    expect(await readLead("lead-preview-only")).toMatchObject({ sheetStatus: "NOT_SENT_PREVIEW", sheetAttemptedAt: null, sheetConfirmedAt: null });
    const result = await db.query(`UPDATE "ConsultationLead" SET "sheetStatus"='SENDING', "sheetAttemptedAt"=NOW()
      WHERE id='lead-preview-only' AND "sheetStatus"='PENDING' AND "sheetAttemptedAt" IS NULL RETURNING id`);
    expect(result.rows).toHaveLength(0);
    for (const status of ["PENDING", "SENDING", "UNKNOWN", "CONFIRMED"]) {
      await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='${status}' WHERE id='lead-preview-only'`)).rejects.toThrow("CONSULTATION_SHEET_TRANSITION_INVALID");
    }
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetAttemptedAt"=NOW() WHERE id='lead-preview-only'`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`UPDATE "ConsultationLead" SET status='CONTACTED', revision=revision+1 WHERE id='lead-preview-only'`);
    expect(await readLead("lead-preview-only")).toMatchObject({ sheetStatus: "NOT_SENT_PREVIEW", status: "CONTACTED" });
  });

  it("retains confirmed delivery and rejects incomplete status timestamps", async () => {
    await addLead("lead-confirmed");
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='SENDING' WHERE id='lead-confirmed'`)).rejects.toMatchObject({ code: "23514" });
    await db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='SENDING', "sheetAttemptedAt"=NOW() WHERE id='lead-confirmed'`);
    await db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='CONFIRMED', "sheetConfirmedAt"=NOW() WHERE id='lead-confirmed'`);
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetStatus"='UNKNOWN', "sheetConfirmedAt"=NULL WHERE id='lead-confirmed'`)).rejects.toThrow("CONSULTATION_SHEET_TRANSITION_INVALID");
    await expect(db.exec(`UPDATE "ConsultationLead" SET "sheetConfirmedAt"='2020-01-01' WHERE id='lead-confirmed'`)).rejects.toThrow("CONSULTATION_SHEET_CONFIRMATION_IMMUTABLE");
  });

  it("requires a real trial ID plus manual actor/time and keeps unlinking explicit", async () => {
    await addLead("lead-manual-link");
    await expect(db.exec(`UPDATE "ConsultationLead" SET "trialApplicationId"='trial-synthetic' WHERE id='lead-manual-link'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`UPDATE "ConsultationLead" SET "trialApplicationId"='trial-synthetic', "trialLinkedAt"=NOW() WHERE id='lead-manual-link'`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`UPDATE "ConsultationLead" SET "trialApplicationId"='missing-trial', "trialLinkedAt"=NOW(), "trialLinkedBy"='admin-synthetic' WHERE id='lead-manual-link'`)).rejects.toMatchObject({ code: "23503" });
    await db.exec(`UPDATE "ConsultationLead" SET "trialApplicationId"='trial-synthetic', "trialLinkedAt"=NOW(), "trialLinkedBy"='admin-synthetic' WHERE id='lead-manual-link'`);
    expect(await readLead("lead-manual-link")).toMatchObject({ trialApplicationId: "trial-synthetic", trialLinkedBy: "admin-synthetic" });
    await expect(db.exec(`DELETE FROM "TrialApplication" WHERE id='trial-synthetic'`)).rejects.toMatchObject({ code: "23001" });
    await db.exec(`UPDATE "ConsultationLead" SET "trialApplicationId"=NULL, "trialLinkedAt"=NULL, "trialLinkedBy"=NULL WHERE id='lead-manual-link'`);
    expect((await readLead("lead-manual-link")).trialApplicationId).toBeNull();
  });

  it("requires authored notes and makes activity append-only", async () => {
    await addLead("lead-activity");
    await db.exec(`INSERT INTO "ConsultationLeadActivity" (id,"leadId","actorId",type,note) VALUES ('activity-synthetic','lead-activity','admin-synthetic','NOTE','Synthetic contact note')`);
    await expect(db.exec(`UPDATE "ConsultationLeadActivity" SET note='Changed' WHERE id='activity-synthetic'`)).rejects.toThrow("CONSULTATION_ACTIVITY_APPEND_ONLY");
    await expect(db.exec(`DELETE FROM "ConsultationLeadActivity" WHERE id='activity-synthetic'`)).rejects.toThrow("CONSULTATION_ACTIVITY_APPEND_ONLY");
    await expect(db.exec(`INSERT INTO "ConsultationLeadActivity" (id,"leadId","actorId",type,note) VALUES ('activity-no-actor','lead-activity','','NOTE','Synthetic note')`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.exec(`DELETE FROM "ConsultationLead" WHERE id='lead-activity'`)).rejects.toMatchObject({ code: "23001" });
    expect((await db.query('SELECT note FROM "ConsultationLeadActivity" WHERE id=\'activity-synthetic\'')).rows).toEqual([{ note: "Synthetic contact note" }]);
  });

  it("enables RLS and grants no browser-role access to either table", async () => {
    const tables = (await db.query<{ relname: string; relrowsecurity: boolean }>(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('ConsultationLead','ConsultationLeadActivity') ORDER BY relname`)).rows;
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        for (const table of ["ConsultationLead", "ConsultationLeadActivity"]) {
          await expect(db.exec(`SELECT * FROM "${table}"`)).rejects.toMatchObject({ code: "42501" });
          await expect(db.exec(`DELETE FROM "${table}"`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await db.exec("RESET ROLE");
      }
    }
  });
});
