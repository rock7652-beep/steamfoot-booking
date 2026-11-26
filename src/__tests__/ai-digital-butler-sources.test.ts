import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ industry: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.industry }));
import { EMPTY_AI_KNOWLEDGE } from "@/server/ai/knowledge-document";
import { readAiAuthority, loadAiPublishedKnowledge } from "@/server/ai/knowledge-sources";
let db: PGlite;
const now = new Date("2026-11-26T01:00:00Z");
const refs = { hours: true, services: true, prices: true };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text);
    CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" int,"isOpen" boolean,"openTime" text,"closeTime" text,"slotInterval" int,"defaultCapacity" int,segments jsonb);
    CREATE TABLE "SpecialBusinessDay" (id text,"storeId" text,date date,type text,reason text,"openTime" text,"closeTime" text,"slotInterval" int,"defaultCapacity" int,segments jsonb);
    CREATE TABLE "SlotOverride" ("storeId" text,date date,"startTime" text,type text,capacity int,reason text);
    CREATE TABLE "ServicePlan" (id text,"storeId" text,name text,price int,"isActive" boolean,"publicVisible" boolean);
    CREATE TABLE "BeautyService" (id text,"storeId" text,name text,duration int,active boolean);
    CREATE TABLE "BeautyPlan" (id text,"storeId" text,name text,price int,active boolean,"customerPurchasable" boolean);
    CREATE TABLE "CourseTemplate" (id text,"storeId" text,name text,"durationMinutes" int,"isActive" boolean,visibility text);
    CREATE TABLE "CoursePointPlan" (id text,"storeId" text,name text,price int,"isActive" boolean,"customerPurchasable" boolean);
    INSERT INTO "BusinessHours" VALUES ('a',4,true,'10:00','18:00',60,6,NULL);
    INSERT INTO "SpecialBusinessDay" VALUES ('holiday','a','2026-11-26','closed',NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO "ServicePlan" VALUES ('1','a','公開蒸足方案',600,true,true),('2','a','私下價格',1,true,false),('3','b','別店方案',2,true,true),('4','a','停用方案',3,false,true);
    INSERT INTO "BeautyService" VALUES ('1','a','公開美業服務',60,true),('2','a','停用美業服務',60,false);
    INSERT INTO "BeautyPlan" VALUES ('1','a','公開美業方案',800,true,true),('2','a','內部美業方案',1,true,false);
    INSERT INTO "CourseTemplate" VALUES ('1','a','公開課程',50,true,'PUBLIC'),('2','a','私課',50,true,'PRIVATE');
    INSERT INTO "CoursePointPlan" VALUES ('1','a','公開課程方案',1200,true,true),('2','a','內部課程方案',1,true,false);`);
  mocks.transaction.mockImplementation(async work => work({ $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) =>
    (await db.query(strings.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""), values)).rows }));
}, 30_000);
afterAll(async () => db.close());
beforeEach(() => mocks.industry.mockResolvedValue("steamfoot"));
it.each(["steamfoot", "beauty", "course"])("reads only the current store's public active catalogue for %s, with special hours", async industry => {
  mocks.industry.mockResolvedValue(industry);
  const source = await readAiAuthority("a", refs, now);
  expect(source.hours).toContain("2026-11-26（台灣時間）不營業");
  expect(source.services).not.toMatch(/私|停用|別店/);
  expect(source.prices).not.toMatch(/私|停用|別店|內部/);
  expect(source.prices).toContain(industry === "steamfoot" ? "NT$600" : industry === "beauty" ? "NT$800" : "NT$1200");
});
it("course subtype follows the authoritative business profile, not a fixture name or submitted selector", async () => {
  mocks.industry.mockResolvedValue("course");
  expect((await readAiAuthority("a", refs, now)).module).toBe("FITNESS");
  await db.exec(`INSERT INTO "StoreFeatureEntitlement" VALUES ('a','business.music','ENABLED')`);
  expect((await readAiAuthority("a", refs, now)).module).toBe("MUSIC");
});
it("missing references yield no answer sources, preserving the published prohibition policy", async () => {
  const sql = { query: async () => [{ draft: EMPTY_AI_KNOWLEDGE, published: { introduction: "介紹", faqs: [], prohibitedTerms: ["醫療"], references: refs }, revision: 1, publishedVersion: 1, publishedAt: now }] };
  const source = await loadAiPublishedKnowledge(sql as never, "empty", now);
  expect(source.records).toEqual([]); expect(source.prohibitedTerms).toEqual(["醫療"]);
});
it("over six public items never silently truncates commercial facts", async () => {
  await db.exec(`INSERT INTO "ServicePlan" SELECT 'overflow-'||n,'overflow','方案'||n,600,true,true FROM generate_series(1,7) n`);
  const source = await readAiAuthority("overflow", { hours: false, services: true, prices: true }, now);
  expect(source.services).toBeNull(); expect(source.prices).toBeNull();
});
