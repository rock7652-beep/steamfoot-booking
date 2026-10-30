import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:vi.fn()}));
vi.mock('@/server/services/store-manager-line-notifications',()=>({notifyStoreManagerOnLine:vi.fn()}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:vi.fn(),resolveDigitalManagerNotice:vi.fn()}));
import {getUnrecordedSteamIncomplete,getUnrecordedCourseIncomplete} from '@/server/services/incomplete-service-reminders';

it('finds unrecorded service and course reminders after 300 older ones',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY,slug text,"industryModule" text,"isDemo" boolean,"operatingStatus" text);
   INSERT INTO "Store" VALUES ('s','s','STEAMFOOT',false,'ACTIVE'),('c','c','COURSE',false,'ACTIVE');
   CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,name text);INSERT INTO "Customer" VALUES ('person','s','QA');
   CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingDate" date,"slotTime" text,"bookingStatus" text);
   CREATE TABLE "CourseSession"(id text PRIMARY KEY,"storeId" text,"startsAt" timestamptz,"endsAt" timestamptz,"cancelledAt" timestamptz);
   CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,"sessionId" text,"customerName" text,status text);
   INSERT INTO "Booking" SELECT 'steam-'||lpad(i::text,3,'0'),'s','person','2026-10-30'::date,'09:00','PENDING' FROM generate_series(1,301) i;
   INSERT INTO "CourseSession" VALUES ('lesson','c','2026-10-30T00:00:00Z','2026-10-30T01:00:00.123Z',null);
   INSERT INTO "CourseBooking" SELECT 'course-'||lpad(i::text,3,'0'),'c','lesson','QA','RESERVED' FROM generate_series(1,301) i;`);
  await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
  await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId") SELECT 'n-'||id,'s','incomplete-service-reminder:'||id||':2026-10-30:09:00','INCOMPLETE_SERVICE_REMINDER',id FROM "Booking" WHERE id<>'steam-301';
   INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId") SELECT 'n-'||id,'c','course-incomplete-attendance:'||id||':2026-10-30T01:00:00.123Z','INCOMPLETE_SERVICE_REMINDER',id FROM "CourseBooking" WHERE id<>'course-301';`);
  m.query.mockImplementation(async(strings:TemplateStringsArray,...args:unknown[])=>{let text=strings[0];for(let i=0;i<args.length;i++)text+=`$${i+1}${strings[i+1]}`;return (await db.query(text,args)).rows;});
  const steam=await getUnrecordedSteamIncomplete(new Date('2026-10-28T00:00:00Z'),new Date('2026-10-31T00:00:00Z'));
  const course=await getUnrecordedCourseIncomplete(new Date('2026-10-30T04:00:00Z'));
  expect(steam.map(x=>x.id)).toEqual(['steam-301']);expect(course.map(x=>x.id)).toEqual(['course-301']);
  expect(course[0].courseEndsAt).toEqual(new Date('2026-10-30T01:00:00.123Z'));
 }finally{await db.close();}
},30000);
