import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

it("rehearses the actual migration: unique event claims, minimal columns and default-deny RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync(
        "prisma/migrations/20261127140000_brand_ai_reply_log/migration.sql",
        "utf8",
      ),
    );
    const webhookEventId = randomUUID();
    const claims = await Promise.allSettled(
      [1, 2].map(() =>
        db.query('INSERT INTO "BrandAiReplyLog"("webhookEventId") VALUES($1)', [
          webhookEventId,
        ]),
      ),
    );
    expect(claims.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect(
      (await db.query('SELECT outcome FROM "BrandAiReplyLog"')).rows,
    ).toEqual([{ outcome: "ERROR" }]);
    const columns = await db.query<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_name='BrandAiReplyLog' ORDER BY ordinal_position`,
    );
    expect(columns.rows.map((row) => row.name)).toEqual([
      "webhookEventId",
      "outcome",
      "faqId",
      "inputTokens",
      "outputTokens",
      "latencyMs",
      "createdAt",
    ]);
    await expect(
      db.exec(`UPDATE "BrandAiReplyLog" SET "inputTokens"=-1`),
    ).rejects.toThrow(/check constraint/);
    await db.exec(
      'CREATE ROLE brand_ai_browser NOSUPERUSER NOBYPASSRLS;GRANT SELECT,INSERT ON "BrandAiReplyLog" TO brand_ai_browser;SET ROLE brand_ai_browser',
    );
    expect((await db.query('SELECT * FROM "BrandAiReplyLog"')).rows).toEqual(
      [],
    );
    await expect(
      db.query('INSERT INTO "BrandAiReplyLog"("webhookEventId") VALUES($1)', [
        randomUUID(),
      ]),
    ).rejects.toThrow(/row-level security/);
  } finally {
    await db.close();
  }
}, 20_000);
