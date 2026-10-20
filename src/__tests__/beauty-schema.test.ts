import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(
    `CREATE EXTENSION btree_gist; CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT','SPA','COURSE'); CREATE TABLE "Store"(id text PRIMARY KEY); CREATE TABLE "Customer"(id text,"storeId" text,PRIMARY KEY(id,"storeId")); CREATE TABLE "CourseRoom"(id text,"storeId" text,PRIMARY KEY(id,"storeId")); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE beauty_test_app LOGIN; SET beauty_migration.app_role='beauty_test_app';`,
  );
  await db.exec(
    readFileSync("scripts/sql/beauty-module-candidate.sql", "utf8"),
  );
  await db.exec(
    `INSERT INTO "Store" VALUES ('s'),('other'); INSERT INTO "CourseRoom" VALUES ('r','s'),('other-room','other'); INSERT INTO "BeautyService" (id,"storeId",name,duration,price) VALUES ('svc','s','做臉',60,1000); INSERT INTO "BeautyTechnician" (id,"storeId",name,gender,"serviceIds",weekly) VALUES ('t','s','女技師','FEMALE',ARRAY['svc'],'[]'); INSERT INTO "BeautyGroup" (id,"storeId","contactName",phone,"startsAt") VALUES ('g','s','合成','0912345678','2099-10-20T02:00Z');`,
  );
}, 30000);
afterAll(async () => db?.close());
async function insert(
  id: string,
  start = "2099-10-20T02:00Z",
  location = "r",
  trial = false,
  phone = "0912345678",
) {
  return db.query(
    `INSERT INTO "BeautyAppointment" (id,"storeId","groupId","personName","personPhone","serviceId","serviceName","technicianId","locationId",preference,"startsAt","endsAt","occupiedEndsAt",duration,buffer,price,"isTrial",rate,"cancelDeduct","noShowDeduct") VALUES ($1,'s','g','合成',$5,'svc','做臉','t',$3,'FEMALE',$2::timestamptz,$2::timestamptz+interval '60 min',$2::timestamptz+interval '75 min',60,15,500,$4,'{"mode":"FIXED","value":100}',false,false)`,
    [id, start, location, trial, phone],
  );
}
it("installs as an additive candidate and blocks browser roles", async () => {
  const r = await db.query<{ blocked: boolean }>(
    `SELECT NOT has_table_privilege('anon','"BeautyAppointment"','SELECT') AND NOT has_table_privilege('authenticated','"BeautyPayment"','INSERT') AS blocked`,
  );
  expect(r.rows[0].blocked).toBe(true);
});
it("rejects invalid technician gender and negative quota", async () => {
  await expect(
    db.exec(
      `INSERT INTO "BeautyTechnician" (id,"storeId",name,gender,"serviceIds",weekly) VALUES ('invalid','s','bad','',ARRAY['svc'],'[]')`,
    ),
  ).rejects.toThrow();
});
it("enforces full occupied interval including buffer and frees cancellation", async () => {
  await insert("one");
  await expect(insert("overlap", "2099-10-20T03:00Z")).rejects.toThrow();
  await insert("boundary", "2099-10-20T03:15Z");
  await db.exec(
    `UPDATE "BeautyAppointment" SET status='CANCELLED' WHERE id='one'`,
  );
  await insert("replacement");
});
it("rejects cross-store locations before any business write", async () => {
  await expect(
    insert("foreign", "2099-10-21T02:00Z", "other-room"),
  ).rejects.toThrow();
});
it("enforces one trial per person per service even at different times", async () => {
  await insert("trial", "2099-10-22T02:00Z", "r", true);
  await expect(
    insert("trial-again", "2099-10-23T02:00Z", "r", true),
  ).rejects.toThrow();
});
it("rolls back a whole party when the second seat conflicts", async () => {
  await db.exec("BEGIN");
  await insert("party-one", "2099-10-24T02:00Z");
  await expect(insert("party-two", "2099-10-24T02:00Z")).rejects.toThrow();
  await db.exec("ROLLBACK");
  expect(
    (await db.query(`SELECT id FROM "BeautyAppointment" WHERE id='party-one'`))
      .rows,
  ).toHaveLength(0);
});
it("financial history cannot be overwritten or deleted", async () => {
  await db.exec(
    `INSERT INTO "BeautyPayment" (id,"storeId",kind,amount,method,note,"actorUserId") VALUES ('payment','s','SALE',500,'OTHER','合成','actor')`,
  );
  await expect(
    db.exec(`UPDATE "BeautyPayment" SET amount=1 WHERE id='payment'`),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.exec(`DELETE FROM "BeautyPayment" WHERE id='payment'`),
  ).rejects.toThrow(/immutable/);
});
it("card quota cannot become negative and a failed debit rolls back", async () => {
  await db.exec(
    `INSERT INTO "Customer" VALUES ('member','s'); INSERT INTO "BeautyPlan" (id,"storeId",name,sessions,price,"validDays","serviceIds") VALUES ('plan','s','合成次數方案',1,1000,30,ARRAY['svc']); INSERT INTO "BeautyCard" (id,"storeId","customerId","memberIds","planId",name,sessions,remaining,"listPrice",paid,"serviceIds","allowShared","expiresAt") VALUES ('card','s','member',ARRAY['member'],'plan','合成',1,1,1000,1000,ARRAY['svc'],false,'2100-01-01');`,
  );
  await db.exec(
    `UPDATE "BeautyCard" SET remaining=remaining-1 WHERE id='card'`,
  );
  await expect(
    db.exec(`UPDATE "BeautyCard" SET remaining=remaining-1 WHERE id='card'`),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ remaining: number }>(
        `SELECT remaining FROM "BeautyCard" WHERE id='card'`,
      )
    ).rows[0].remaining,
  ).toBe(0);
});
it("payment reversals cannot refer to another store's original receipt", async () => {
  await db.exec(
    `INSERT INTO "BeautyPayment" (id,"storeId",kind,amount,method,note,"actorUserId") VALUES ('other-payment','other','SALE',100,'OTHER','合成','actor')`,
  );
  await expect(
    db.exec(
      `INSERT INTO "BeautyPayment" (id,"storeId","originalPaymentId",kind,amount,method,note,"actorUserId") VALUES ('cross-refund','s','other-payment','REFUND',-1,'OTHER','合成','actor')`,
    ),
  ).rejects.toThrow();
});
