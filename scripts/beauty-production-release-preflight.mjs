import {fileURLToPath} from 'node:url';
import {beautyDatabaseSelection} from './beauty-database-scope.mjs';
export const BEAUTY_PRODUCTION_ROLE='steamfoot_beauty_prod_20261025';
export function validateBeautyProductionRelease(env){
 if(env.VERCEL_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_DATABASE_MODE!=='dedicated'||env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||env.BEAUTY_HOSTED_PREVIEW!==undefined||
    env.PRODUCTION_MIGRATION_TARGET||Object.keys(env).some(k=>/(?:_QA|_ACCEPTANCE)$/.test(k)&&env[k]==='1')||
    (env.BEAUTY_CHARGE_RULES_STORE_IDS??'').trim())throw Error('Beauty production release scope is not verified');
 const value=beautyDatabaseSelection(env),u=new URL(value),project='qijlnhtpbintanzpxkvf',user=decodeURIComponent(u.username);
 if(!(u.hostname===`db.${project}.supabase.co`&&user===BEAUTY_PRODUCTION_ROLE||/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&user===`${BEAUTY_PRODUCTION_ROLE}.${project}`)||u.pathname!=='/postgres')throw Error('Beauty production connection identity mismatch');
 return value;
}
export async function beautyProductionReleasePreflight(env=process.env,createClient){
 let stage='scope',client;
 try{
 const connectionString=validateBeautyProductionRelease(env);
 const factory=createClient??(config=>import('pg').then(({Client})=>new Client(config)));
 client=await factory({connectionString,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000});
  stage='connect';
  await client.connect();
  stage='TLS';
  // pg_stat_ssl describes the pooler-to-database hop, not the authenticated TLS socket we use.
  const socket=client.connection?.stream;
  if(socket?.encrypted!==true||socket.authorized!==true)throw Error('Beauty runtime connection/TLS not verified');
  stage='identity';
  await client.query('BEGIN READ ONLY');
  const identity=await client.query(`SELECT current_user AS role,current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`);
  if(identity.rows[0]?.role!==BEAUTY_PRODUCTION_ROLE||identity.rows[0]?.database!=='postgres')throw Error('Beauty runtime connection/TLS not verified');
  stage='role';
  const role=await client.query(`SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication FROM pg_roles WHERE rolname=current_user`);
  const r=role.rows[0];if(!r?.rolcanlogin||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolinherit','rolreplication'].some(k=>r[k]))throw Error('Beauty runtime role boundary mismatch');
  stage='schema';
  const tables=await client.query(`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'Beauty%' AND relrowsecurity`);
  if(tables.rows.length!==14)throw Error('Beauty schema/RLS not ready');
  stage='privileges';
  const privileges=await client.query(`SELECT has_column_privilege(current_user,'public."User"','passwordHash','SELECT') AS secret_read,has_table_privilege(current_user,'public."BeautyPayment"','UPDATE,DELETE,TRUNCATE') AS finance_write`);
  if(privileges.rows[0]?.secret_read!==false||privileges.rows[0]?.finance_write!==false)throw Error('Beauty runtime privileges not verified');
  stage='columns';
  for(const [table,fields] of [['Store','id,"industryModule","operatingStatus"'],['Customer','id,name,phone,"assignedStaffId","updatedAt"'],['Staff','id,"userId","displayName",status'],['User','id,status'],['CourseRoom','id,name,"rentalEnabled"'],['CourseDisplayOrder','kind,ids,revision'],['CourseStoreNotice','id,kind,revision'],['CashDrawerSession','id,status,"updatedAt"'],['CashbookEntry','id,amount,"paymentMethod"'],['BeautyService','"singleChargeName","singlePriceConfigured","chargeTechnicianRule","trialDuration"'],['BeautyPlan','"chargeTechnicianRule"'],['BeautyCard','"chargeRuleSnapshot"'],['BeautyAppointment','"chargeRuleSnapshot"']])await client.query(`SELECT ${fields} FROM "${table}" LIMIT 0`);
  await client.query('ROLLBACK');return {schemaTables:14,tls:true,role:BEAUTY_PRODUCTION_ROLE,readonly:true};
 }catch(error){
  const code=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'CHECK';
  error.beautyPreflightDiagnostic={stage,code};throw error;
 }finally{if(client)await client.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))beautyProductionReleasePreflight().then(()=>console.info('[beauty-production-preflight] runtime_login=true tls=true schema_tables=14 readonly=true migration_target_absent=true')).catch(error=>{console.error(beautyProductionFailureDiagnostic(error));process.exitCode=1;});

export function beautyProductionFailureDiagnostic(error){
 const d=error?.beautyPreflightDiagnostic;
 if(!d||!['scope','connect','TLS','identity','role','schema','privileges','columns'].includes(d.stage)||!/^([A-Z0-9_]{2,64})$/.test(d.code))return '[beauty-production-preflight] blocked; diagnostic unavailable';
 return `[beauty-production-preflight] blocked stage=${d.stage} code=${d.code}; no migrations applied`;
}
