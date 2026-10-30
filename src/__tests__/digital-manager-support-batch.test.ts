import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query}}));
vi.mock('@/server/services/store-manager-line-notifications',()=>({notifyStoreManagerOnLine:vi.fn()}));
vi.mock('@/lib/line',()=>({getUserProfile:vi.fn()}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:vi.fn(),resolveDigitalManagerNotice:vi.fn()}));
import {getUnrecordedHumanSupportCandidates} from '@/server/services/human-support-handoff';

it('finds an unrecorded support reminder after 200 older recorded ones',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY,slug text);INSERT INTO "Store" VALUES ('a','a'),('b','b');
   CREATE TABLE "DigitalButlerLead"(id text PRIMARY KEY,"storeId" text,"completionActionKey" text,status text,"assignedStaffId" text,"createdAt" timestamptz);
   INSERT INTO "DigitalButlerLead" SELECT 'lead-'||lpad(i::text,3,'0'),CASE WHEN i=201 THEN 'b' ELSE 'a' END,'__human_support_handoff__','NEW',NULL,'2026-10-30T00:00:00Z'::timestamptz FROM generate_series(1,201) i;`);
  await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
  await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") SELECT 'n-'||id,"storeId",'human-support-final-reminder:'||id,'HUMAN_SUPPORT_FINAL_REMINDER',id FROM "DigitalButlerLead" WHERE "storeId"='a'`);
  m.query.mockImplementation(async(strings:TemplateStringsArray,...args:unknown[])=>{let text=strings[0];for(let i=0;i<args.length;i++)text+=`$${i+1}${strings[i+1]}`;return (await db.query(text,args)).rows;});
  expect(await getUnrecordedHumanSupportCandidates(new Date('2026-10-30T01:00:00Z'))).toEqual([{id:'lead-201',storeId:'b',store:{slug:'b'}}]);
 }finally{await db.close();}
},30000);
