// Isolated PostgreSQL planner audit. No credentials or external database access.
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
if(source.includes('noticeWindow')){await db.close();throw Error('This archived audit targets the pre-lifecycle query. Use node scripts/qa/store-notice-lifecycle-plan.mjs for the current query.');}
const template=source.match(/\$queryRaw<Row\[\]>`([\s\S]*?)`/)[1];
const results=[];
const summaryTemplate=source.match(/\$queryRaw<Array<\{count:number;latest:Date\|null\}>>`([\s\S]*?)`/)[1];
async function inspect(stage){
 const summarySql=summaryTemplate.replaceAll('${d.storeId}',"'store-0'");
 const summaryPlan=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+summarySql)).rows[0]['QUERY PLAN'][0];
 results.push({stage,operation:'pending summary',plan:summaryPlan});
 for(const handled of [false,true])for(const offset of [0,5000]){
  const sql=template.replaceAll('${d.storeId}',"'store-0'").replaceAll('${d.handled}',String(handled)).replaceAll('${d.offset}',String(offset));
  const plan=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'][0];
  results.push({stage,handled,offset,plan});
 }
}
await inspect('existing indexes');
await db.exec(`CREATE INDEX candidate_notice_pending ON "SteamfootStoreNotice" ("storeId","startsAt" DESC,"createdAt" DESC,id DESC) WHERE "handledAt" IS NULL;
CREATE INDEX candidate_notice_handled ON "SteamfootStoreNotice" ("storeId","startsAt" DESC,"createdAt" DESC,id DESC) WHERE "handledAt" IS NOT NULL;
CREATE INDEX candidate_digital_handled ON "DigitalManagerNotice" ("storeId","createdAt" DESC,('digital:'||id) DESC) WHERE "handledAt" IS NOT NULL;
CREATE INDEX candidate_digital_pending ON "DigitalManagerNotice" ("storeId","createdAt" DESC,('digital:'||id) DESC) WHERE "handledAt" IS NULL;
ANALYZE;`);
await inspect('candidate indexes');
const out=process.argv[2]||'/tmp/store-notice-index-audit.json';writeFileSync(out,JSON.stringify(results,null,2));
for(const r of results){const walk=n=>[n['Node Type']+(n['Index Name']?':'+n['Index Name']:''),...(n.Plans??[]).flatMap(walk)];console.log(JSON.stringify({stage:r.stage,operation:r.operation??'list',handled:r.handled,offset:r.offset,ms:r.plan['Execution Time'],nodes:walk(r.plan.Plan)}));}
await db.close();
