import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { connectVerifiedBeautyBooking } from "@/server/beauty/verified-booking-identity";
let db: PGlite;
const subject = "U" + "b".repeat(32);
const config = { storeId: "s", slug: "beauty", identityMode: "CENTRAL", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-beauty", basicId: "@beauty", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET" };
const compile = (s: TemplateStringsArray) => s.reduce((r,p,i)=>r+(i?`$${i}`:"")+p, "");
const tx = {
  $queryRaw: async (s: TemplateStringsArray,...v:unknown[]) => (await db.query(compile(s),v)).rows,
  $executeRaw: async (s: TemplateStringsArray,...v:unknown[]) => (await db.query(compile(s),v)).affectedRows ?? 0,
} as unknown as Parameters<typeof connectVerifiedBeautyBooking>[0];
const input = { storeId: "s", customerId: "c", lineUserId: subject, name: "新預約人" };
async function run(failAfter = false) {
  await db.exec("BEGIN");
  try { await connectVerifiedBeautyBooking(tx,input); if(failAfter)throw Error("booking failed"); await db.exec("COMMIT"); }
  catch(e){await db.exec("ROLLBACK");throw e;}
}
beforeAll(async()=>{
  db = new PGlite(); await db.exec(`
    CREATE TABLE "User" (id text PRIMARY KEY,name text,phone text,role text,status text,"createdAt" timestamptz,"updatedAt" timestamptz);
    CREATE TABLE "Account" (id text PRIMARY KEY,"userId" text REFERENCES "User",type text,provider text,"providerAccountId" text,UNIQUE(provider,"providerAccountId"));
    CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,"userId" text,"lineUserId" text,"lineLinkStatus" text,"mergedIntoCustomerId" text);
    CREATE TABLE "CustomerIdentityLink" (id text PRIMARY KEY,"userId" text REFERENCES "User","storeId" text,"customerId" text REFERENCES "Customer",provider text,"providerAccountId" text,"lineUserId" text,"createdAt" timestamptz,"updatedAt" timestamptz,
      UNIQUE(provider,"providerAccountId","storeId"),UNIQUE("customerId",provider),UNIQUE("userId","storeId",provider));
  `);
});
afterAll(async()=>db.close()); afterEach(()=>vi.unstubAllEnvs());
beforeEach(async()=>{
  vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify([config]));vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON","");vi.stubEnv("CENTRAL_LINE_PROVIDER_ID","901");
  await db.exec('TRUNCATE "CustomerIdentityLink","Account","User","Customer" CASCADE');
  await db.query('INSERT INTO "Customer" VALUES ($1,$2,NULL,$3,$4,NULL)',["c","s",subject,"LINKED"]);
});
it("creates a scoped verified membership without claiming the submitted phone as a global login",async()=>{
  await run();
  const users=(await db.query<{id:string;phone:string|null}>('SELECT id,phone FROM "User"')).rows;
  expect(users).toHaveLength(1); expect(users[0].phone).toBeNull();
  expect((await db.query('SELECT "userId","storeId","customerId",provider,"providerAccountId" FROM "CustomerIdentityLink"')).rows).toEqual([{userId:users[0].id,storeId:"s",customerId:"c",provider:"line",providerAccountId:subject}]);
  await run(); expect((await db.query('SELECT id FROM "Account"')).rows).toHaveLength(1);
});
it("reuses a verified central account across stores without changing the other membership",async()=>{
  await db.exec(`INSERT INTO "User" (id,name,role,status) VALUES ('u','原會員','CUSTOMER','ACTIVE'); INSERT INTO "Customer" VALUES ('other','other-store',NULL,NULL,'LINKED',NULL)`);
  await db.query('INSERT INTO "Account" VALUES ($1,$2,$3,$4,$5)',["a","u","oauth","line",subject]);
  await db.query('INSERT INTO "CustomerIdentityLink" (id,"userId","storeId","customerId",provider,"providerAccountId") VALUES ($1,$2,$3,$4,$5,$6)',["old","u","other-store","other","line",subject]);
  await run(); expect((await db.query('SELECT id FROM "User"')).rows).toHaveLength(1);
  expect((await db.query('SELECT "storeId" FROM "CustomerIdentityLink" ORDER BY "storeId"')).rows).toEqual([{storeId:"other-store"},{storeId:"s"}]);
});
it.each([["STAFF","ACTIVE"],["CUSTOMER","SUSPENDED"]])("rejects %s/%s accounts without creating or modifying membership",async(role,status)=>{
  await db.query('INSERT INTO "User" (id,name,role,status) VALUES ($1,$2,$3,$4)',["u","原帳號",role,status]);
  await db.query('INSERT INTO "Account" VALUES ($1,$2,$3,$4,$5)',["a","u","oauth","line",subject]);
  await expect(run()).rejects.toThrow("店家協助核對"); expect((await db.query('SELECT id FROM "CustomerIdentityLink"')).rows).toEqual([]);
});
it("never transfers an existing customer's login owner",async()=>{
  await db.exec(`UPDATE "Customer" SET "userId"='existing-owner' WHERE id='c'`);
  await expect(run()).rejects.toThrow("店家協助核對"); expect((await db.query('SELECT id FROM "User"')).rows).toEqual([]);
});
it("rejects a same-store identity already linked to a different customer",async()=>{
  await db.exec(`INSERT INTO "User" (id,name,role,status) VALUES ('u','原會員','CUSTOMER','ACTIVE'); INSERT INTO "Customer" VALUES ('other','s',NULL,NULL,'LINKED',NULL)`);
  await db.query('INSERT INTO "Account" VALUES ($1,$2,$3,$4,$5)',["a","u","oauth","line",subject]);
  await db.query('INSERT INTO "CustomerIdentityLink" (id,"userId","storeId","customerId",provider,"providerAccountId") VALUES ($1,$2,$3,$4,$5,$6)',["old","u","s","other","line",subject]);
  await expect(run()).rejects.toThrow("店家協助核對");
  expect((await db.query('SELECT "customerId" FROM "CustomerIdentityLink"')).rows).toEqual([{customerId:"other"}]);
});
it("rolls every identity write back if the identity synchronization transaction fails",async()=>{
  await expect(run(true)).rejects.toThrow("booking failed");
  for(const table of ["User","Account","CustomerIdentityLink"])expect((await db.query(`SELECT id FROM "${table}"`)).rows).toEqual([]);
});
it("does not link a different store, blocked customer, or unverified LINE subject",async()=>{
  await db.exec(`UPDATE "Customer" SET "lineLinkStatus"='BLOCKED' WHERE id='c'`);
  await expect(run()).rejects.toThrow("店家協助核對"); expect((await db.query('SELECT id FROM "Account"')).rows).toEqual([]);
});
it("keeps independent Provider membership out of the central namespace",async()=>{
  vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify([{...config,identityMode:"PROVIDER"}]));
  await run(); expect((await db.query('SELECT provider FROM "Account"')).rows).toEqual([{provider:"line-provider:901"}]);
});
