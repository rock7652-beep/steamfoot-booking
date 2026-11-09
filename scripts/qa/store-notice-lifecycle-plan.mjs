// Current lifecycle query planner audit (old audit JSON remains a historical artifact). No credentials or external database access.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(`CREATE TABLE "SteamfootStoreNotice" (id text PRIMARY KEY,"storeId" text,"bookingId" text,kind text,"customerName" text,"serviceName" text,"staffName" text,"previousStaffName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int,details jsonb,"handledAt" timestamptz,"handledByName" text,revision int,"createdAt" timestamptz,"updatedAt" timestamptz);
CREATE TABLE "DigitalManagerNotice" (id text PRIMARY KEY,"storeId" text,"eventType" text,"eventKey" text,"createdAt" timestamptz,"updatedAt" timestamptz,"handledAt" timestamptz,"handledByName" text,revision int);
INSERT INTO "SteamfootStoreNotice" SELECT g::text,'store-'||(g%10),g::text,'MOVE','customer','service','staff',null,'2026-01-01'::timestamptz+g*interval '1 minute',null,1,'{}',CASE WHEN g%100<90 THEN now() ELSE null END,null,0,'2026-01-01'::timestamptz+g*interval '1 minute',now() FROM generate_series(1,100000) g;
INSERT INTO "DigitalManagerNotice" SELECT g::text,'store-'||(g%10),'DAILY_ACTION_DIGEST','digest:'||g,'2026-01-01'::timestamptz+g*interval '1 minute',now(),CASE WHEN g%100<90 THEN now() ELSE null END,null,0 FROM generate_series(1,100000) g;
CREATE INDEX legacy_notice ON "SteamfootStoreNotice" ("storeId","handledAt","startsAt");
CREATE INDEX legacy_digital_pending ON "DigitalManagerNotice" ("storeId","createdAt" DESC,id) WHERE "handledAt" IS NULL;
CREATE INDEX legacy_digital_handled ON "DigitalManagerNotice" ("storeId","handledAt" DESC,id) WHERE "handledAt" IS NOT NULL;
ANALYZE;`);
const source=readFileSync('src/server/actions/steamfoot-store-notices.ts','utf8');
const template=source.match(/\$queryRaw<Row\[\]>`([\s\S]*?)`/)[1];
await db.exec(`ALTER TABLE "SteamfootStoreNotice" ADD COLUMN "publishedAt" timestamptz,ADD COLUMN "readAt" timestamptz,ADD COLUMN "readByName" text;
ALTER TABLE "DigitalManagerNotice" ADD COLUMN "publishedAt" timestamptz,ADD COLUMN "readAt" timestamptz,ADD COLUMN "readByName" text;
UPDATE "SteamfootStoreNotice" SET "publishedAt"="createdAt","readAt"="handledAt";
UPDATE "DigitalManagerNotice" SET "publishedAt"="createdAt","readAt"="handledAt"; ANALYZE;`);
const now=new Date('2026-03-11T12:00:00Z'),split=new Date(now.getTime()-3*86400000),cutoff=new Date(now.getTime()-10*86400000);
function bind(q,history=false,offset=0){return q.replaceAll('${d.storeId}',"'store-0'").replaceAll('${d.handled}',String(history)).replaceAll('${d.offset+51}',String(offset+51)).replaceAll('${d.offset}',String(offset)).replaceAll('${window.retainedAfter}',"'"+cutoff.toISOString()+"'").replaceAll('${window.now}',"'"+now.toISOString()+"'").replaceAll('${window.after}',"'"+(history?cutoff:split).toISOString()+"'").replaceAll('${window.through}',"'"+(history?split:now).toISOString()+"'");}
const results=[];
const summaryTemplate=source.match(/\$queryRaw<Array<\{count:number;latest:Date\|null\}>>`([\s\S]*?)`/)[1];
async function inspect(stage){
 const summarySql=bind(summaryTemplate);
 const summaryPlan=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+summarySql)).rows[0]['QUERY PLAN'][0];
 results.push({stage,operation:'pending summary',plan:summaryPlan});
 for(const handled of [false,true])for(const offset of [0,5000]){
  const sql=bind(template,handled,offset);
  const plan=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'][0];
  results.push({stage,handled,offset,plan});
 }
}
await inspect('existing indexes');
await db.exec(`CREATE INDEX candidate_notice_published ON "SteamfootStoreNotice" ("storeId","publishedAt" DESC,id DESC);
CREATE INDEX candidate_digital_published ON "DigitalManagerNotice" ("storeId","publishedAt" DESC,('digital:'||id) DESC);
CREATE INDEX candidate_notice_unread ON "SteamfootStoreNotice" ("storeId","publishedAt" DESC) WHERE "readAt" IS NULL;
CREATE INDEX candidate_digital_unread ON "DigitalManagerNotice" ("storeId","publishedAt" DESC) WHERE "readAt" IS NULL;
ANALYZE;`);
await inspect('candidate indexes');
const out=process.argv[2]||'/tmp/store-notice-lifecycle-plan.json';writeFileSync(out,JSON.stringify(results,null,2));
for(const r of results){const walk=n=>[n['Node Type']+(n['Index Name']?':'+n['Index Name']:''),...(n.Plans??[]).flatMap(walk)];console.log(JSON.stringify({stage:r.stage,operation:r.operation??'list',handled:r.handled,offset:r.offset,ms:r.plan['Execution Time'],nodes:walk(r.plan.Plan)}));}
await db.close();
