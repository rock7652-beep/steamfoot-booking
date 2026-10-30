import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {afterAll,beforeAll,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),rule:vi.fn(),query:vi.fn(),permission:vi.fn()}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:m.rule},$queryRaw:m.query}}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.read,courseManager:vi.fn(),courseTransaction:vi.fn()}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:vi.fn()}));
import {loadCombinedCourseStoreNotices} from "@/server/actions/course-digital-manager-notices";
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY); INSERT INTO "Store" VALUES ('a'),('b');
 CREATE TABLE "CourseStoreNotice"(id text PRIMARY KEY,"storeId" text,kind text,"subjectKey" text,"customerName" text,"courseName" text,"coachName" text,"previousCoachName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int,details jsonb,"handledAt" timestamptz,"handledByName" text,revision int,"createdAt" timestamptz,"updatedAt" timestamptz);
 INSERT INTO "CourseStoreNotice" VALUES ('old','a','LEAVE','booking:1','學員','吉他','老師',null,'2026-10-31',null,1,'{}',null,null,0,'2026-10-30','2026-10-30');`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('p1','a','purchase:1','TRANSFER_PENDING_CONFIRMATION','private-purchase','2026-10-30'),('p2','b','purchase:2','TRANSFER_PENDING_CONFIRMATION','foreign','2026-10-30');`);
},30000);
afterAll(async()=>db.close());
beforeEach(()=>{
 m.read.mockResolvedValue({storeId:'a',user:{role:'STAFF',staffId:'s'},isChildStoreView:false});
 m.rule.mockResolvedValue({backendNoticesEnabled:true});m.permission.mockResolvedValue(true);
 m.query.mockImplementation(async(strings:TemplateStringsArray,...args:unknown[])=>{let q=strings[0];for(let i=0;i<args.length;i++)q+=`$${i+1}${strings[i+1]}`;return (await db.query(q,args)).rows;});
});
it('combines payment and course notices with one scoped count and no payment details',async()=>{
 const result=await loadCombinedCourseStoreNotices({storeId:'a',handled:false,offset:0});
 expect(result).toMatchObject({success:true,count:2,items:[{id:'digital:p1',kind:'PAYMENT',canViewCourse:true},{id:'old',kind:'LEAVE'}]});
 expect(JSON.stringify(result)).not.toContain('private-purchase');expect(JSON.stringify(result)).not.toContain('p2');
});
it('shows a generic notice without linking to finance when access is missing',async()=>{
 m.permission.mockImplementation(async(_r,_s,p)=>p!=='transaction.read');
 expect(await loadCombinedCourseStoreNotices({storeId:'a',handled:false})).toMatchObject({success:true,items:expect.arrayContaining([expect.objectContaining({id:'digital:p1',canViewCourse:false})])});
 expect(await loadCombinedCourseStoreNotices({storeId:'b',handled:false})).toMatchObject({success:false});
});
it('includes store inquiries and human support without exposing their targets',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('lead','a','digital-butler-lead:l','DIGITAL_BUTLER_LEAD_CREATED','private-lead','2026-10-30'),('support','a','human-support-requested:s','HUMAN_SUPPORT_REQUESTED','private-support','2026-10-30');`);
 const result=await loadCombinedCourseStoreNotices({storeId:'a',handled:false});
 expect(result).toMatchObject({success:true,count:4,items:expect.arrayContaining([expect.objectContaining({id:'digital:lead',kind:'LEAD'}),expect.objectContaining({id:'digital:support',kind:'SUPPORT'})])});
 expect(JSON.stringify(result)).not.toContain('private-lead');expect(JSON.stringify(result)).not.toContain('private-support');
});
