// Real-PostgreSQL role rehearsal. Only a new, disposable loopback database is accepted.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';

const database='beauty_digital_manager_role_test';
const role='steamfoot_beauty_data_roleqa';
const base={host:'127.0.0.1',port:55438,database};
const admin=new pg.Client({...base,user:'postgres'});
let restricted;
const denied=async(sql,values=[])=>{
 try{await restricted.query(sql,values);assert.fail('Expected permission denial');}
 catch(error){assert.equal(error.code,'42501');}
};
try {
 await admin.connect();
 const {rows:[identity]}=await admin.query(`SELECT current_database() AS db,current_user AS actor,inet_server_addr() AS address`);
 assert.equal(identity.db,database);assert.equal(identity.actor,'postgres');
 const {rows:[state]}=await admin.query(`SELECT to_regclass('public."Store"') IS NOT NULL AS occupied, EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS role_exists`,[role]);
 if(state.occupied||state.role_exists)throw Error('Requires a new empty disposable database and unused role');
 await admin.query(`CREATE ROLE steamfoot_beauty_data_roleqa LOGIN NOSUPERUSER NOBYPASSRLS;
  CREATE TABLE public."Store"(id text PRIMARY KEY,"industryModule" text,name text);
  INSERT INTO public."Store" VALUES ('beauty-a','BEAUTY','A private'),('beauty-b','BEAUTY','B private'),('course','COURSE','C private');
  GRANT SELECT (id,"industryModule") ON public."Store" TO steamfoot_beauty_data_roleqa;
  ALTER TABLE public."Store" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY beauty_store_read ON public."Store" FOR SELECT TO steamfoot_beauty_data_roleqa USING (true);`);
 await admin.query(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await admin.query(`SET beauty_migration.app_role='steamfoot_beauty_data_roleqa'`);
 const grants=readFileSync('scripts/sql/digital-manager-beauty-access-candidate.sql','utf8');
 await admin.query(grants);await admin.query(grants);
 await admin.query(`INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES
  ('course-event','course','course-purchase-pending:1','TRANSFER_PENDING_CONFIRMATION','1'),
  ('foreign-beauty','beauty-b','beauty-purchase-pending:2','TRANSFER_PENDING_CONFIRMATION','2')`);
 restricted=new pg.Client({...base,user:role});await restricted.connect();
 const {rows:[runtime]}=await restricted.query(`SELECT current_user AS actor,r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`);
 assert.deepEqual(runtime,{actor:role,rolsuper:false,rolbypassrls:false});
 const insert=`INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("storeId","eventKey") DO NOTHING`;
 const payment=['payment','beauty-a','beauty-purchase-pending:1','TRANSFER_PENDING_CONFIRMATION','1'];
 assert.equal((await restricted.query(insert,payment)).rowCount,1);
 assert.equal((await restricted.query(insert,payment)).rowCount,0);
 await restricted.query(insert,['reminder','beauty-a','beauty-incomplete:1:time','INCOMPLETE_SERVICE_REMINDER','1']);
 await restricted.query(insert,['digest','beauty-a','beauty-digest:today','DAILY_ACTION_DIGEST','beauty-a']);
 await restricted.query(`INSERT INTO public."DigitalManagerActivation" ("storeId") VALUES ('beauty-a') ON CONFLICT ("storeId") DO NOTHING`);
 await restricted.query(`UPDATE public."DigitalManagerActivation" SET "activatedAt"=now() WHERE "storeId"='beauty-a'`);
 const visible=await restricted.query(`SELECT id FROM public."DigitalManagerNotice" WHERE "storeId"=$1 ORDER BY id`,['beauty-a']);
 assert.deepEqual(visible.rows.map(r=>r.id),['digest','payment','reminder']);
 const update=await restricted.query(`UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"='owner',"handledByName"='店長',revision=revision+1,"updatedAt"=now() WHERE id=$1 AND "storeId"=$2 AND revision=$3 RETURNING revision`,['payment','beauty-a',0]);
 assert.equal(update.rows[0].revision,1);
 assert.equal((await restricted.query(`UPDATE public."DigitalManagerNotice" SET "handledAt"=now() WHERE id=$1 AND "storeId"=$2`,['foreign-beauty','beauty-a'])).rowCount,0);
 assert.equal((await restricted.query(`SELECT id FROM public."DigitalManagerNotice" WHERE id='course-event'`)).rowCount,0);
 await denied(insert,['wrong-store','course','beauty-purchase-pending:3','TRANSFER_PENDING_CONFIRMATION','3']);
 await denied(insert,['wrong-event','beauty-a','beauty-purchase-pending:4','INCOMPLETE_SERVICE_REMINDER','4']);
 await denied(`INSERT INTO public."DigitalManagerActivation" ("storeId") VALUES ('course')`);
 await denied(`UPDATE public."DigitalManagerNotice" SET "targetId"='other' WHERE id='payment'`);
 await denied(`DELETE FROM public."DigitalManagerNotice" WHERE id='payment'`);
 await denied(`SELECT name FROM public."Store"`);
 console.log('PASS real PostgreSQL login, Beauty notice/activation, duplicate handling and scoped reads');
 console.log('PASS cross-industry, unrelated event, forbidden column and delete restrictions');
 console.log('NOTE the database role can access multiple Beauty stores; server actions enforce the selected store.');
} finally {
 await restricted?.end();await admin.end();
}
