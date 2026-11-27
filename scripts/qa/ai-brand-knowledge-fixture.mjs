// Extends the existing audited local fixture; never connects to Supabase.
import {readFileSync} from 'node:fs';
import {createBrandToggleFixture} from './ai-brand-toggle-fixture.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const metadata=JSON.parse(read('artifacts/ai-digital-butler/brand-knowledge/readonly-knowledge-metadata.json'));
export async function createBrandKnowledgeFixture({operations=['save','publish','withdraw']}={}){
 const f=await createBrandToggleFixture({operations});
 await f.db.exec(read('scripts/sql/ai-digital-butler/preview-knowledge.sql').split('-- Read-only authority sources')[0]);
 const sentinel={introduction:'門市隔離知識，不得混入品牌',faqs:[],prohibitedTerms:[],references:{hours:false,services:false,prices:false}};
 for(const suffix of ['steamfoot','beauty','fitness','music'])await f.db.query('INSERT INTO "AiButlerKnowledgeDocument"("storeId",draft) VALUES($1,$2::jsonb)',['ai-preview-'+suffix,JSON.stringify(sentinel)]);
 await f.db.query('INSERT INTO "AiBrandService"(id,name) VALUES(\'local-other-brand\',\'另一個合成品牌\')');await f.db.query('INSERT INTO "AiBrandKnowledgeDocument"("serviceId",draft) VALUES(\'local-other-brand\',$1::jsonb)',[JSON.stringify({...sentinel,introduction:'其他品牌知識'})]);
 const storeKnowledge=(await f.db.query('SELECT * FROM "AiButlerKnowledgeDocument" ORDER BY "storeId"')).rows,otherBrand=(await f.db.query('SELECT * FROM "AiBrandKnowledgeDocument" WHERE "serviceId"=\'local-other-brand\'')).rows;
 async function verifyKnowledgeSchema(){
  const columns=(await f.db.query(`SELECT c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",pg_get_expr(d.adbin,d.adrelid) AS "default" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  for(const c of metadata.columns)if(!columns.some(v=>['table','name','type','notNull','default'].every(k=>v[k]===c[k])))throw Error('Knowledge column mismatch '+c.table+'.'+c.name);
  const constraints=(await f.db.query(`SELECT c.relname AS table,con.conname AS name,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid`)).rows;
  for(const c of metadata.constraints)if(!constraints.some(v=>v.table===c.table&&v.name===c.name&&v.definition===c.definition))throw Error('Knowledge constraint mismatch '+c.name);
  const policies=(await f.db.query('SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies')).rows;
  for(const p of metadata.policies)if(!policies.some(v=>v.tablename===p.tablename&&v.policyname===p.policyname&&v.cmd===p.cmd&&v.qual===p.qual&&v.with_check===p.with_check))throw Error('Knowledge RLS policy mismatch '+p.policyname);
  for(const r of metadata.rls){const v=(await f.db.query('SELECT relrowsecurity AS enabled,relforcerowsecurity AS forced FROM pg_class WHERE relname=$1',[r.table])).rows[0];if(v.enabled!==r.enabled||v.forced!==r.forced)throw Error('Knowledge RLS flags mismatch');}
  for(const g of metadata.grants){const v=(await f.db.query('SELECT has_table_privilege($1,$2,$3) allowed',[f.role,'public."'+g.table_name+'"',g.privilege_type])).rows[0];if(!v.allowed)throw Error('Knowledge ACL mismatch');}
  const triggers=(await f.db.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN('"AiBrandKnowledgeDocument"'::regclass,'"AiButlerKnowledgeDocument"'::regclass)`)).rows;if(triggers.length!==metadata.triggers.length)throw Error('Unexpected knowledge trigger');
  return {columnsMatched:metadata.columns.length,constraintsMatched:metadata.constraints.length,policiesMatched:metadata.policies.length,knowledgeTriggers:triggers.length,auditTriggers:(await f.verifySchema()).triggersMatched};
 }
 return {...f,storeKnowledge,otherBrand,verifyKnowledgeSchema};
}
