// Local PostgreSQL-engine fixture only. Never opens a network/database connection.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const meta=JSON.parse(read('artifacts/ai-digital-butler/brand-toggle/readonly-metadata.json'));
const extra=JSON.parse(read('artifacts/ai-digital-butler/brand-toggle/readonly-structure-extra.json'));
const tableGrants=JSON.parse(read('artifacts/ai-digital-butler/brand-toggle/readonly-table-grants.json'));
const role='steamfoot_ai_preview_20261125',sid='ai-preview-brand-steamfoot',uid='ai-preview-brand-hq';
const identifier=x=>'"'+x.replaceAll('"','""')+'"',literal=x=>"'"+x.replaceAll("'","''")+"'";
export async function createBrandToggleFixture({operations=["setting"]}={}){
 if(JSON.stringify(operations)!=='["setting"]'&&JSON.stringify(operations)!=='["save","publish","withdraw"]'&&JSON.stringify(operations)!=='["test"]'&&JSON.stringify(operations)!=='["handoff","resume","test"]')throw Error("Unsupported local fixture operations");
 const db=new PGlite(),start=new Date().toISOString(),end=new Date(Date.now()+25*60_000).toISOString();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 8 VALID UNTIL ${literal(meta.role.validUntil)};`);
 for(const e of extra.enums)await db.exec(`CREATE TYPE ${identifier(e.name)} AS ENUM(${e.labels.map(literal).join(',')});`);
 await db.exec('CREATE TABLE "StoreSubscription"(id text PRIMARY KEY);');
 for(const table of ['User','Store','StaffLoginRecord','AuditLog']){
  const columns=meta.columns.filter(c=>c.table_name===table).map(c=>`${identifier(c.name)} ${c.type}${c.not_null?' NOT NULL':''}${c.default_expr?' DEFAULT '+c.default_expr:''}`);
  await db.exec(`CREATE TABLE ${identifier(table)}(${columns.join(',')});`);
 }
 for(const c of [...extra.constraints,...meta.constraints.filter(c=>c.table==='AuditLog')].sort((a,b)=>Number(!a.definition.startsWith('PRIMARY KEY'))-Number(!b.definition.startsWith('PRIMARY KEY'))))await db.exec(`ALTER TABLE ${identifier(c.table)} ADD CONSTRAINT ${identifier(c.name)} ${c.definition};`);
 await db.exec(read('scripts/sql/ai-digital-butler/preview-install.sql'));
 for(const [suffix,revision]of[['steamfoot',8],['beauty',11],['fitness',7],['music',7]]){
  const id='ai-preview-'+suffix;await db.query('INSERT INTO "Store"(id,name,slug,"updatedAt") VALUES($1,$2,$1,now())',[id,'合成門市 '+suffix]);
  await db.query('INSERT INTO "AiButlerSetting"("storeId",setting,revision) VALUES($1,$2::jsonb,$3)',[id,JSON.stringify({enabled:false,model:'gpt-6-luna',channels:['TEST'],monthlyBudgetMicros:1000000,dailyRequests:20,monthlyRequests:100}),revision]);
 }
 await db.exec(read('scripts/sql/ai-digital-butler/brand-preview-review/install.proposed.sql'));
 for(const r of extra.rls)await db.exec(`ALTER TABLE ${identifier(r.table)} ${r.enabled?'ENABLE':'DISABLE'} ROW LEVEL SECURITY;`);
 for(const p of meta.policies){
  await db.exec(`DROP POLICY IF EXISTS ${identifier(p.policyname)} ON ${identifier(p.tablename)};CREATE POLICY ${identifier(p.policyname)} ON ${identifier(p.tablename)} FOR ${p.cmd} TO ${p.roles.map(identifier).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`);
 }
 // Reproduce existing column ACL, including zero User writes and zero AuditLog INSERT.
 for(const table of [...new Set(meta.columnPrivileges.map(p=>p.table))]){
  await db.exec(`REVOKE ALL ON ${identifier(table)} FROM ${role};`);
  for(const privilege of [...new Set(meta.columnPrivileges.filter(p=>p.table===table).map(p=>p.privilege))]){
   if(tableGrants.some(g=>g.table_name===table&&g.privilege_type===privilege))continue;
   const columns=meta.columnPrivileges.filter(p=>p.table===table&&p.privilege===privilege).map(p=>identifier(p.column));
   await db.exec(`GRANT ${privilege}(${columns.join(',')}) ON ${identifier(table)} TO ${role};`);
  }
 }
 for(const g of tableGrants)await db.exec(`GRANT ${g.privilege_type} ON ${identifier(g.table_name)} TO ${role};`);
 await db.exec(`GRANT USAGE ON SCHEMA public TO ${role};`);
 for(const fn of meta.functions){
  const source=fn.name==='music_retirement_write_guard'?read('scripts/music-retirement-framework.sql'):read('prisma/migrations/20261007002000_verified_audit_actor/migration.sql');
  const marker=fn.name==='music_retirement_write_guard'?'CREATE FUNCTION music_retirement_write_guard()':'CREATE FUNCTION public.'+fn.name+'(';
  const segment=source.slice(source.indexOf(marker)),body=segment.split('AS $$')[1]?.split('$$;')[0];
  if(!body||body.trim()!==fn.body.trim()||fn.securityDefiner)throw Error('Audit function drift: '+fn.name);
  await db.exec(fn.definition);await db.exec(`REVOKE ALL ON FUNCTION public.${fn.name}(${fn.name==='redact_audit_json'?'jsonb,integer':''}) FROM PUBLIC,${role};`);
 }
 for(const t of meta.triggers)await db.exec(t.definition);
 await db.query('INSERT INTO "User"(id,name,email,role,status,"passwordHash","updatedAt") VALUES($1,\'合成品牌管理者\',\'ai-preview-brand-hq@example.invalid\',\'ADMIN\',\'SUSPENDED\',NULL,now())',[uid]);
 const initialStores=(await db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"')).rows;
 const baseline=await db.query(`SELECT has_function_privilege('${role}','public.redact_audit_json(jsonb,integer)','EXECUTE') helper,has_any_column_privilege('${role}','public."AuditLog"','INSERT') audit_insert`);
 if(baseline.rows[0].helper||baseline.rows[0].audit_insert)throw Error('Fixture baseline ACL mismatch');
 async function prepare(){
  await db.query('UPDATE "User" SET status=\'ACTIVE\',"passwordHash"=\'local-only\' WHERE id=$1',[uid]);
  const audit=`("actorUserId"='${uid}' AND "actorRoleSnapshot"='ADMIN' AND "storeId" IS NULL AND outcome='SUCCESS' AND "createdAt">=TIMESTAMPTZ '${start}' AND "createdAt"<=TIMESTAMPTZ '${end}' AND CURRENT_TIMESTAMP<TIMESTAMPTZ '${end}')`;
  await db.exec(`CREATE POLICY ai_brand_qa_user_read ON "User" FOR SELECT TO ${role} USING(id='${uid}' AND role='ADMIN' AND email='ai-preview-brand-hq@example.invalid' AND CURRENT_TIMESTAMP<TIMESTAMPTZ '${end}');CREATE POLICY ai_brand_qa_login_read ON "StaffLoginRecord" FOR SELECT TO ${role} USING ${audit};CREATE POLICY ai_brand_qa_login_insert ON "StaffLoginRecord" FOR INSERT TO ${role} WITH CHECK ${audit};CREATE POLICY ai_brand_qa_login_touch ON "StaffLoginRecord" FOR UPDATE TO ${role} USING ${audit} WITH CHECK ${audit};`);
  await db.exec(read('scripts/sql/ai-digital-butler/brand-operations-review/audit-acl.proposed.sql').replace("IN ('save','publish','withdraw','setting','handoff','resume','test')",`IN (${operations.map(literal).join(',')})`).replaceAll('__QA_WINDOW_UNTIL__',end));
  await db.exec(read('scripts/sql/ai-digital-butler/brand-operations-review/audit-helper-acl.proposed.sql').replaceAll('__QA_WINDOW_UNTIL__',end));
  await db.query('INSERT INTO "StaffLoginRecord"(id,"actorUserId","actorRoleSnapshot",outcome,device) VALUES(\'local-brand-login\',$1,\'ADMIN\',\'SUCCESS\',\'local-browser\')',[uid]);
  await db.query('UPDATE "AiBrandGrant" SET status=\'ENABLED\' WHERE "serviceId"=$1',[sid]);
 }
 async function runtime(work){await db.exec(`SET ROLE ${role}`);try{return await work();}finally{await db.exec('RESET ROLE');}}
 function adapt(client){return {query:async(statement,values=[])=>{if(!/^(SELECT|WITH|INSERT INTO "AuditLog")/.test(statement.trim())&&!(operations.includes("setting")&&/^UPDATE "AiBrandSetting"/.test(statement.trim()))&&!(operations.includes("save")&&/^INSERT INTO "AiBrandKnowledgeDocument"/.test(statement.trim()))&&!((operations.includes("test")||operations.includes("handoff"))&&/^(INSERT INTO|UPDATE) "AiBrand(?:Request|Conversation)"/.test(statement.trim()))&&!(operations.includes("resume")&&/^INSERT INTO "AiBrandHandoffAudit"/.test(statement.trim())))throw Error('Brand local fixture rejected an out-of-scope mutation');return(await client.query(statement,values)).rows;}};}
 const database={...adapt(db),transaction:work=>db.transaction(async tx=>{await tx.query("SELECT set_config('steamfoot.audit_actor',$1,true)",[JSON.stringify({id:uid,name:'合成品牌管理者',role:'ADMIN',loginRecordId:'local-brand-login',storeId:null})]);return work(adapt(tx));})};
 async function actor(){const r=await db.query('SELECT id,role,status,"passwordHash" FROM "User" WHERE id=$1',[uid]);const u=r.rows[0];return{id:u?.id,role:u?.role,auditAllowed:u?.status==='ACTIVE'&&Boolean(u.passwordHash),storeView:false};}
 async function verifySchema(){
  const columns=(await db.query(`SELECT c.relname table_name,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
  for(const c of meta.columns){const v=columns.find(v=>v.table_name===c.table_name&&v.name===c.name);if(!v||v.type!==c.type||v.not_null!==c.not_null||v.default_expr!==c.default_expr)throw Error('Column mismatch '+c.table_name+'.'+c.name);}
  const constraints=(await db.query(`SELECT c.relname AS table,con.conname AS name,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid`)).rows;
  for(const c of [...extra.constraints,...meta.constraints])if(!constraints.some(v=>v.table===c.table&&v.name===c.name&&v.definition===c.definition))throw Error('Constraint mismatch '+c.name);
  const triggers=(await db.query(`SELECT c.relname AS table,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal`)).rows;
  for(const t of meta.triggers)if(!triggers.some(v=>v.table===t.table&&v.name===t.name&&v.definition===t.definition))throw Error('Trigger mismatch '+t.name);
  for(const r of extra.rls){const v=(await db.query('SELECT relrowsecurity enabled,relforcerowsecurity forced FROM pg_class WHERE relname=$1',[r.table])).rows[0];if(v.enabled!==r.enabled||v.forced!==r.forced)throw Error('RLS mismatch '+r.table);}
  const policies=(await db.query('SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies')).rows;
  for(const p of meta.policies)if(!policies.some(v=>v.tablename===p.tablename&&v.policyname===p.policyname&&v.cmd===p.cmd&&v.qual===p.qual&&v.with_check===p.with_check))throw Error('Policy mismatch '+p.tablename+'.'+p.policyname);
  return {columnsMatched:meta.columns.length,triggersMatched:meta.triggers.length,functionBodiesMatched:meta.functions.length,constraintsMatched:extra.constraints.length+meta.constraints.length,rlsTablesMatched:extra.rls.length,baselinePoliciesMatched:meta.policies.length};
 }
 return {db,database,prepare,runtime,actor,verifySchema,end,role,sid,uid,initialStores,baseline:baseline.rows[0]};
}
