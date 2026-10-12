import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "Store" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Customer" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, UNIQUE ("storeId", "id"));
    CREATE TABLE "ShopConfig" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL);
    CREATE TABLE "InventoryOrder" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL);
    INSERT INTO "Store" VALUES ('a'), ('b'); INSERT INTO "User" VALUES ('u');
    INSERT INTO "Customer" VALUES ('ca','a'), ('cb','b');
    INSERT INTO "ShopConfig" VALUES ('sa','a');
    INSERT INTO "InventoryOrder" VALUES ('oa','a'),('ob','b');`);
  await db.exec(readFileSync("docs/sql/store-member-workorder-line-draft-20261012.sql", "utf8"));
});
afterAll(() => db.close());
const request = (id: string, store: string, customer: string, line: string) => db.query(`INSERT INTO "StoreMemberConnection" ("id","storeId","customerId","identityProvider","lineUserId","channelKey","phone","verificationCode","expiresAt","updatedAt") VALUES ($1,$2,$3,'line-provider:901',$4,'channel','0912345678','ABC123',now()+interval '1 day',now())`, [id,store,customer,line]);
const event = (id: string, store: string, order: string, customer: string, key: string) => db.query(`INSERT INTO "WorkOrderReadyNotification" ("id","storeId","orderId","customerId","retryKey","retryUntil","updatedAt") VALUES ($1,$2,$3,$4,$5,now()+interval '23 hours',now()) ON CONFLICT ("storeId","orderId") DO NOTHING`, [id,store,order,customer,key]);

describe("local PostgreSQL draft constraints; no external services", () => {
  it("defaults notification OFF and creates no historical queue", async () => {
    expect((await db.query<{ enabled: boolean }>('SELECT "workOrderReadyNotificationEnabled" AS enabled FROM "ShopConfig"')).rows[0].enabled).toBe(false);
    expect((await db.query('SELECT * FROM "WorkOrderReadyNotification"')).rows).toEqual([]);
  });
  it("supports the same provider identity at A/B without cross-store customers", async () => {
    await request('ra','a','ca','line'); await request('rb','b','cb','line');
    await expect(request('cross','a','cb','other')).rejects.toThrow(/foreign key/);
    expect((await db.query('SELECT * FROM "StoreMemberConnection"')).rows).toHaveLength(2);
  });
  it("requires durable approval evidence and rejects duplicate in-store identities", async () => {
    await expect(request('duplicate','a','ca','line')).rejects.toThrow(/unique/);
    await expect(db.query(`UPDATE "StoreMemberConnection" SET status='APPROVED' WHERE id='ra'`)).rejects.toThrow(/check/);
    await db.exec(`UPDATE "StoreMemberConnection" SET status='APPROVED', "centralUserId"='u', "confirmedAt"=now() WHERE id='ra'`);
  });
  it("twenty submitted events leave exactly one queue row; cross-store work orders fail", async () => {
    await Promise.all(Array.from({length:20},(_,i) => event('e'+i,'a','oa','ca','key'+i)));
    expect((await db.query('SELECT * FROM "WorkOrderReadyNotification"')).rows).toHaveLength(1);
    await expect(event('cross','a','ob','ca','different')).rejects.toThrow(/foreign key/);
  });
  it("rollback leaves neither an event nor partial identity writes", async () => {
    await db.exec('BEGIN');
    await event('rolled','b','ob','cb','rolled-key');
    await db.exec('ROLLBACK');
    expect((await db.query(`SELECT * FROM "WorkOrderReadyNotification" WHERE id='rolled'`)).rows).toEqual([]);
  });
  it("browser roles cannot read or mutate connection or delivery tables", async () => {
    await db.exec('SET ROLE authenticated');
    await expect(db.query('SELECT * FROM "StoreMemberConnection"')).rejects.toThrow(/permission denied/);
    await expect(db.query('DELETE FROM "WorkOrderReadyNotification"')).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });
});
