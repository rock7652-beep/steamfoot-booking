import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
const proxy=vi.hoisted(()=>({query:vi.fn(),cards:vi.fn()}));
vi.mock("@/server/services/customer-label-filter",()=>({customerLabelFilterIds:vi.fn().mockResolvedValue(null)}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointCard:{findMany:proxy.cards}}}));
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:proxy.query}}));
import { syntheticOpeningCard, syntheticOpeningRecord } from "./fixtures/music-opening";
import { getCourseCustomerPage } from "@/server/queries/course-customer-page";

const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema=`course_customer_page_${randomUUID().replaceAll("-","")}`;
const url=databaseUrl ? new URL(databaseUrl):null;
url?.searchParams.set("schema",schema);
const db=url ? new PrismaClient({datasourceUrl:url.toString()}):null;
const now=new Date("2026-09-21T02:00:00Z");
const page=(params="",role="ADMIN",staffId:string|null=null,cards=true)=>getCourseCustomerPage("a",role,staffId,new URLSearchParams(params),cards,now);

(db ? describe:describe.skip)("course customer pagination — disposable PostgreSQL",()=>{
  let created=false;
  beforeAll(async()=>{
    await db!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
    for(const ddl of [
      'CREATE TABLE "User" (id text PRIMARY KEY,status text)',
      'CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,"userId" text,name text,phone text,"lineName" text,"lineLinkStatus" text,"customerStage" text,"assignedStaffId" text,"sponsorId" text,"mergedIntoCustomerId" text,"createdAt" timestamptz)',
      'CREATE TABLE "CourseSession" (id text,"storeId" text,"startsAt" timestamptz,"cancelledAt" timestamptz,"releasedAt" timestamptz)',
      'CREATE TABLE "CourseBooking" ("customerId" text,"sessionId" text,"storeId" text,status text,"cardId" text,"pointCost" int)',
      'CREATE TABLE "CoursePointCard" (id text,"storeId" text,unit text,remaining int,"closedAt" timestamptz,"expiresAt" timestamptz,"musicOpeningStateRequired" boolean NOT NULL DEFAULT false,"musicValidityDays" int,"musicActivatedAt" timestamptz)',
      'CREATE TABLE "CourseMusicOpeningState" ("cardId" text,"storeId" text,"customerId" text,"sourceKey" text,"contentHash" text,snapshot jsonb,"appliedBatchId" text)',
      'CREATE TABLE "CourseCardMember" ("cardId" text,"storeId" text,"customerId" text)',
    ])await db!.$executeRawUnsafe(ddl);
    await db!.$executeRawUnsafe(`INSERT INTO "Customer" SELECT 'a-'||n,'a',NULL,'synthetic-customer-'||lpad(n::text,4,'0'),'synthetic-contact-'||lpad(n::text,8,'0'),NULL,'UNLINKED','CUSTOMER',CASE WHEN n<=10 THEN 'manager-a' ELSE 'manager-b' END,NULL,NULL,'2026-09-01'::timestamptz FROM generate_series(1,1000) n`);
    await db!.$executeRawUnsafe(`INSERT INTO "Customer" VALUES ('foreign','b',NULL,'synthetic-customer-0000','synthetic-foreign-contact',NULL,'LINKED','LEAD','manager-a',NULL,NULL,'2026-09-21')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseSession" (id,"storeId","startsAt") VALUES ('s','a','2026-09-20T17:00:00Z'),('s-b','b','2026-09-21T01:00:00Z')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseBooking" VALUES ('a-1000','s','a','ATTENDED',NULL,0),('a-999','s-b','b','ATTENDED',NULL,0)`);
    await db!.$executeRawUnsafe(`INSERT INTO "CoursePointCard"(id,"storeId",unit,remaining,"closedAt","expiresAt") VALUES ('shared','a','POINT',100,NULL,'2026-10-01'),('expired','a','POINT',10000,NULL,'2026-09-01'),('closed','a','POINT',10000,'2026-09-20','2026-10-01'),('session','a','SESSION',5,NULL,'2026-10-01')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseCardMember" VALUES ('shared','a','a-999'),('shared','a','a-998'),('expired','a','a-999'),('closed','a','a-999'),('session','a','a-999')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseBooking" VALUES ('a-999','s','a','RESERVED','shared',30),('a-999','s','a','CANCELLED','shared',60),('foreign','s-b','b','RESERVED','shared',100)`);
    proxy.query.mockImplementation(query=>db!.$queryRaw(query));
    proxy.cards.mockResolvedValue([]);
  });
  afterAll(async()=>{vi.unstubAllEnvs();if(created)await db!.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await db?.$disconnect();});
  it("paginates 1000 customers with stable disjoint pages and clamps stale URLs",async()=>{
    const first=await page();const second=await page("page=2");const last=await page("page=99999");
    expect(first.total).toBe(1000);expect(first.rows).toHaveLength(20);expect(second.rows).toHaveLength(20);
    expect(first.rows[0].id).toBe("a-1000");expect(second.rows.every(r=>!first.rows.some(p=>p.id===r.id))).toBe(true);
    expect(last.page).toBe(50);expect(last.rows).toHaveLength(20);expect((await page("search=no-result&page=40"))).toMatchObject({total:0,page:1,rows:[]});
  });
  it("searches the entire store before pagination and treats SQL wildcard characters literally",async()=>{
    expect((await page("search=synthetic-customer-0999")).rows.map(r=>r.id)).toEqual(["a-999"]);
    expect((await page("search=%25")).total).toBe(0);expect((await page("search=foreign")).total).toBe(0);
  });
  it("sorts shared available points without expired, closed, cancelled or foreign holds",async()=>{
    const result=await page("sort=points");expect(result.rows.slice(0,2).map(r=>r.id)).toEqual(["a-998","a-999"]);
    expect(result.rows[1]).toMatchObject({points:70,sessions:5,lastVisitAt:null});
    expect((await page("sort=points","ADMIN",null,false)).rows.every(r=>r.points===0 && r.sessions===0)).toBe(true);
  });
  it("retains manager visibility, explicit staff filters and Taiwan attendance month semantics",async()=>{
    vi.stubEnv("MANAGER_VISIBILITY_MODE","SELF_ONLY");
    expect((await page("","PARTNER","manager-a")).total).toBe(10);
    expect((await page("staff=manager-b","PARTNER","manager-a")).total).toBe(0);
    expect((await page("visit=month")).rows.map(r=>r.id)).toEqual(["a-1000"]);
    expect((await page("visit=never")).total).toBe(999);
  });
  it("counts only a verified unlimited source and rejects a snapshot changed after projection",async()=>{
    const record=syntheticOpeningRecord();record.expiresAt=null;record.expiryVerification={kind:"NO_EXPIRY",evidenceKey:"synthetic-proof"};
    const card={...syntheticOpeningCard(record),expiresAt:null,musicValidityDays:null},source=card.musicOpeningState;
    await db!.$executeRaw`INSERT INTO "Customer" (id,"storeId",name,"createdAt") VALUES(${source.customerId},${card.storeId},'Synthetic unlimited learner',now())`;
    await db!.$executeRaw`INSERT INTO "CoursePointCard" (id,"storeId",unit,remaining,"expiresAt","musicOpeningStateRequired","musicValidityDays","musicActivatedAt") VALUES(${card.id},${card.storeId},'SESSION',2,NULL,true,NULL,${card.musicActivatedAt})`;
    await db!.$executeRaw`INSERT INTO "CourseCardMember" VALUES(${card.id},${card.storeId},${source.customerId})`;
    await db!.$executeRaw`INSERT INTO "CourseMusicOpeningState" VALUES(${card.id},${card.storeId},${source.customerId},${source.sourceKey},${source.contentHash},${JSON.stringify(source.snapshot)}::jsonb,${source.appliedBatchId})`;
    proxy.cards.mockResolvedValue([card]);
    const read=()=>getCourseCustomerPage(card.storeId,"ADMIN",null,new URLSearchParams(),true,new Date("2026-10-08"),true);
    try{
      expect((await read()).rows[0]).toMatchObject({id:source.customerId,sessions:2});
      await db!.$executeRaw`UPDATE "CourseMusicOpeningState" SET "contentHash"=${"b".repeat(64)} WHERE "cardId"=${card.id}`;
      expect((await read()).rows[0]).toMatchObject({id:source.customerId,sessions:0});
    }finally{proxy.cards.mockResolvedValue([]);}
  });

});
