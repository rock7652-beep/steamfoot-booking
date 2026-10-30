import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { recordDigitalManagerNotice, resolveDigitalManagerNotice } from "@/server/services/digital-manager-notices";
import type { Prisma } from "@prisma/client";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE TABLE public."Store" (id text PRIMARY KEY); INSERT INTO public."Store" VALUES (\'a\'),(\'b\');');
  await db.exec(readFileSync("scripts/sql/digital-manager-notice-candidate.sql", "utf8"));
});
afterAll(async () => db.close());
function adapter(sql: { query: (statement: string, args?: unknown[]) => Promise<unknown> }) {
  return { $executeRaw: async (strings: TemplateStringsArray, ...args: unknown[]) => {
    let statement = strings[0];
    for (let i = 0; i < args.length; i++) statement += `$${i + 1}${strings[i + 1]}`;
    return sql.query(statement, args);
  } } as unknown as Pick<Prisma.TransactionClient, "$executeRaw">;
}
const event = { storeId: "a", eventKey: "course-purchase:1", eventType: "TRANSFER_PENDING_CONFIRMATION" as const, targetId: "purchase-1" };
it("deduplicates retries within each store without reopening a handled notice", async () => {
  await recordDigitalManagerNotice(adapter(db), event);
  await db.exec(`UPDATE "DigitalManagerNotice" SET "handledAt"=now() WHERE "storeId"='a'`);
  await recordDigitalManagerNotice(adapter(db), event);
  await recordDigitalManagerNotice(adapter(db), { ...event, storeId: "b" });
  const rows = await db.query<{storeId:string;handledAt:Date|null}>(`SELECT "storeId","handledAt" FROM "DigitalManagerNotice" ORDER BY "storeId"`);
  expect(rows.rows).toHaveLength(2);
  expect(rows.rows[0].handledAt).not.toBeNull();
  expect(rows.rows[1].handledAt).toBeNull();
});
it("rolls the notice back when the business transaction fails", async () => {
  await expect(db.transaction(async tx => {
    await recordDigitalManagerNotice(adapter(tx), { ...event, eventKey: "rollback" });
    throw new Error("business operation failed");
  })).rejects.toThrow("business operation failed");
  expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "eventKey"='rollback'`)).rows).toHaveLength(0);
});
it("rejects a missing store and keeps row-level security enabled", async () => {
  await expect(recordDigitalManagerNotice(adapter(db), { ...event, storeId: "unknown" })).rejects.toThrow();
  const result = await db.query<{relrowsecurity:boolean}>(`SELECT relrowsecurity FROM pg_class WHERE oid='public."DigitalManagerNotice"'::regclass`);
  expect(result.rows[0].relrowsecurity).toBe(true);
});
it("resolves only the matching store and keeps retry receipts stable", async () => {
  await recordDigitalManagerNotice(adapter(db), { ...event, eventKey: "payment-2" });
  await recordDigitalManagerNotice(adapter(db), { ...event, eventKey: "payment-2", storeId: "b" });
  const input = { storeId: "a", eventKey: "payment-2", actorUserId: "u", actorName: "值班人員" };
  await resolveDigitalManagerNotice(adapter(db), input);
  await resolveDigitalManagerNotice(adapter(db), input);
  const rows = await db.query<{storeId:string;handledAt:Date|null;revision:number}>(`SELECT "storeId","handledAt",revision FROM "DigitalManagerNotice" WHERE "eventKey"='payment-2' ORDER BY "storeId"`);
  expect(rows.rows[0]).toMatchObject({storeId:"a",revision:1});
  expect(rows.rows[0].handledAt).not.toBeNull();
  expect(rows.rows[1]).toMatchObject({storeId:"b",handledAt:null,revision:0});
});
