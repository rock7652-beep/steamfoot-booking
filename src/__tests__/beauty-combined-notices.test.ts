import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),user:vi.fn(),permission:vi.fn(),setting:vi.fn(),query:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautySetting:{findUnique:m.setting},$queryRaw:m.query}}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:vi.fn(async()=>true)}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:vi.fn(async()=>null)}));
vi.mock('@/lib/store-read-only',()=>({isReadOnlyStoreTarget:vi.fn(()=>false)}));
import {loadBeautyStoreNotices} from '@/server/actions/beauty-store-notices';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY); INSERT INTO "Store" VALUES ('a'),('b');
 CREATE TABLE "CourseStoreNotice"(id text PRIMARY KEY,"storeId" text,kind text,"subjectKey" text,"customerName" text,"courseName" text,"coachName" text,"previousCoachName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int,details jsonb,"handledAt" timestamptz,"handledByName" text,revision int,"createdAt" timestamptz,"updatedAt" timestamptz);
 INSERT INTO "CourseStoreNotice" VALUES ('booking','a','MOVE','beauty:1','客人','做臉','技師',null,'2026-10-31',null,1,'{}',null,null,0,'2026-10-30','2026-10-30');`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('payment','a','beauty-purchase-pending:1','TRANSFER_PENDING_CONFIRMATION','private-order','2026-10-30'),('foreign','b','beauty-purchase-pending:2','TRANSFER_PENDING_CONFIRMATION','other-order','2026-10-30'),('course','a','course-purchase-pending:3','TRANSFER_PENDING_CONFIRMATION','other-module','2026-10-30');`);
},30000);
afterAll(async()=>db.close());
beforeEach(()=>{
 m.manager.mockResolvedValue({storeId:'a',userId:'u'});m.user.mockResolvedValue({id:'u',role:'OWNER',staffId:'s'});m.permission.mockResolvedValue(true);m.setting.mockResolvedValue({backendNoticesEnabled:true});
 m.query.mockImplementation(async(strings:TemplateStringsArray,...args:unknown[])=>{let q=strings[0];for(let i=0;i<args.length;i++)q+=`$${i+1}${strings[i+1]}`;return (await db.query(q,args)).rows;});
});
it('merges only the current Beauty store payment and appointment notices',async()=>{
 const result=await loadBeautyStoreNotices({storeId:'a',handled:false});
 expect(result).toMatchObject({success:true,count:2,items:expect.arrayContaining([expect.objectContaining({id:'digital:payment',kind:'PAYMENT',canViewCourse:true}),expect.objectContaining({id:'booking',kind:'MOVE'})])});
 expect(JSON.stringify(result)).not.toContain('private-order');expect(JSON.stringify(result)).not.toContain('foreign');expect(JSON.stringify(result)).not.toContain('other-module');
 expect(await loadBeautyStoreNotices({storeId:'b',handled:false})).toMatchObject({success:false});
});
it('includes store-owned incomplete-service reminders and daily digest',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('incomplete','a','beauty-incomplete:1:time','INCOMPLETE_SERVICE_REMINDER','appointment','2026-10-30'),('digest','a','beauty-digest:a:2026-10-30','DAILY_ACTION_DIGEST','a','2026-10-30');`);
 const result=await loadBeautyStoreNotices({storeId:'a',handled:false});
 expect(result).toMatchObject({success:true,count:4,items:expect.arrayContaining([expect.objectContaining({id:'digital:incomplete',kind:'REMINDER'}),expect.objectContaining({id:'digital:digest',kind:'DIGEST'})])});
});
