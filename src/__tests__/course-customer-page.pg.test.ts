import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
const proxy=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:proxy.query}}));
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
      'CREATE TABLE "CourseSession" (id text,"storeId" text,"startsAt" timestamptz)',
      'CREATE TABLE "CourseBooking" ("customerId" text,"sessionId" text,"storeId" text,status text,"cardId" text,"pointCost" int)',
      'CREATE TABLE "CoursePointCard" (id text,"storeId" text,unit text,remaining int,"closedAt" timestamptz,"expiresAt" timestamptz)',
      'CREATE TABLE "CourseCardMember" ("cardId" text,"storeId" text,"customerId" text)',
    ])await db!.$executeRawUnsafe(ddl);
    await db!.$executeRawUnsafe(`INSERT INTO "Customer" SELECT 'a-'||n,'a',NULL,'顧客'||lpad(n::text,4,'0'),'09'||lpad(n::text,8,'0'),NULL,'UNLINKED','CUSTOMER',CASE WHEN n<=10 THEN 'manager-a' ELSE 'manager-b' END,NULL,NULL,'2026-09-01'::timestamptz FROM generate_series(1,1000) n`);
    await db!.$executeRawUnsafe(`INSERT INTO "Customer" VALUES ('foreign','b',NULL,'顧客0000','foreign',NULL,'LINKED','LEAD','manager-a',NULL,NULL,'2026-09-21')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseSession" VALUES ('s','a','2026-09-20T17:00:00Z'),('s-b','b','2026-09-21T01:00:00Z')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseBooking" VALUES ('a-1000','s','a','ATTENDED',NULL,0),('a-999','s-b','b','ATTENDED',NULL,0)`);
    await db!.$executeRawUnsafe(`INSERT INTO "CoursePointCard" VALUES ('shared','a','POINT',100,NULL,'2026-10-01'),('expired','a','POINT',10000,NULL,'2026-09-01'),('closed','a','POINT',10000,'2026-09-20','2026-10-01'),('session','a','SESSION',5,NULL,'2026-10-01')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseCardMember" VALUES ('shared','a','a-999'),('shared','a','a-998'),('expired','a','a-999'),('closed','a','a-999'),('session','a','a-999')`);
    await db!.$executeRawUnsafe(`INSERT INTO "CourseBooking" VALUES ('a-999','s','a','RESERVED','shared',30),('a-999','s','a','CANCELLED','shared',60),('foreign','s-b','b','RESERVED','shared',100)`);
    proxy.query.mockImplementation(query=>db!.$queryRaw(query));
  });
  afterAll(async()=>{vi.unstubAllEnvs();if(created)await db!.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await db?.$disconnect();});
  it("paginates 1000 customers with stable disjoint pages and clamps stale URLs",async()=>{
    const first=await page();const second=await page("page=2");const last=await page("page=99999");
    expect(first.total).toBe(1000);expect(first.rows).toHaveLength(20);expect(second.rows).toHaveLength(20);
    expect(first.rows[0].id).toBe("a-1000");expect(second.rows.every(r=>!first.rows.some(p=>p.id===r.id))).toBe(true);
    expect(last.page).toBe(50);expect(last.rows).toHaveLength(20);expect((await page("search=no-result&page=40"))).toMatchObject({total:0,page:1,rows:[]});
  });
  it("searches the entire store before pagination and treats SQL wildcard characters literally",async()=>{
    expect((await page("search=顧客0999")).rows.map(r=>r.id)).toEqual(["a-999"]);
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
});
