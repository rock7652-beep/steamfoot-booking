import {beautyModuleChargeRollout} from './beauty-charge-rollout.mjs';
import {beautyProductionCaPath,verifyBeautyProductionCa} from './beauty-production-ca.mjs';
import {fileURLToPath} from 'node:url';
import {beautyDatabaseSelection} from './beauty-database-scope.mjs';
export const BEAUTY_PRODUCTION_ROLE='steamfoot_beauty_prod_20261025';
export function validateBeautyProductionRelease(env){
 if(env.VERCEL_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_DATABASE_MODE!=='dedicated'||env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||env.BEAUTY_HOSTED_PREVIEW!==undefined||
    env.PRODUCTION_MIGRATION_TARGET||Object.keys(env).some(k=>/(?:_QA|_ACCEPTANCE)$/.test(k)&&env[k]==='1')||
    (env.BEAUTY_CHARGE_RULES_STORE_IDS??'').trim())throw Error('Beauty production release scope is not verified');
 if(env.BEAUTY_CHARGE_RULES_SCOPE!==undefined&&env.BEAUTY_CHARGE_RULES_SCOPE!==''&&env.BEAUTY_CHARGE_RULES_SCOPE!=='stores'&&(env.BEAUTY_CHARGE_RULES_SCOPE!=='module'||!beautyModuleChargeRollout(env)||!['0','1'].includes(env.BEAUTY_CHARGE_EDITING_ENABLED)))throw Error('Beauty charge rollout scope is not verified');
 const value=beautyDatabaseSelection(env),u=new URL(value),project='qijlnhtpbintanzpxkvf',user=decodeURIComponent(u.username);
 if(!(u.hostname===`db.${project}.supabase.co`&&user===BEAUTY_PRODUCTION_ROLE||/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&user===`${BEAUTY_PRODUCTION_ROLE}.${project}`)||u.pathname!=='/postgres')throw Error('Beauty production connection identity mismatch');
 return value;
}
export async function beautyProductionReleasePreflight(env=process.env,createClient){
 let stage='scope',client;
 try{
 const selected=validateBeautyProductionRelease(env);
 stage='certificate';verifyBeautyProductionCa();
 const pgUrl=new URL(selected);pgUrl.searchParams.delete('sslcert');pgUrl.searchParams.set('sslrootcert',beautyProductionCaPath());pgUrl.searchParams.set('sslmode','verify-full');
 const connectionString=pgUrl.toString();
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
  const candidate=error?.code??error?.errorCode;
  const code=typeof candidate==='string'&&/^[A-Z0-9_]{2,64}$/.test(candidate)?candidate:'CHECK';
  const sqlState=typeof error?.meta?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.meta.code)?error.meta.code:undefined;
  error.beautyPreflightDiagnostic={stage,code,sqlState};throw error;
 }finally{if(client)await client.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))beautyProductionReleasePreflight().then(()=>beautyPrismaProductionPreflight()).then(()=>beautySharedTodosProductionPreflight()).then(()=>console.info('[beauty-production-preflight] runtime_login=true tls=true prisma=true shared_todos=true schema_tables=14 readonly=true migration_target_absent=true')).catch(error=>{console.error(beautyProductionFailureDiagnostic(error));process.exitCode=1;});

export function beautyProductionFailureDiagnostic(error){
 const d=error?.beautyPreflightDiagnostic;
 if(!d||!['scope','certificate','connect','TLS','identity','role','schema','privileges','columns','prisma-connect','prisma-readonly','prisma-identity','prisma-columns','shared-todos-connect','shared-todos-readonly','shared-todos-columns'].includes(d.stage)||!/^([A-Z0-9_]{2,64})$/.test(d.code))return '[beauty-production-preflight] blocked; diagnostic unavailable';
 return `[beauty-production-preflight] blocked stage=${d.stage} code=${d.code}${/^[0-9A-Z]{5}$/.test(d.sqlState??'')?' sqlstate='+d.sqlState:''}; no migrations applied`;
}

/** Shared follow-up belongs to the existing main core, never the restricted Beauty role. */
export async function beautySharedTodosProductionPreflight(env=process.env,createClient){
 let client,stage='scope';
 try{
  validateBeautyProductionRelease(env);
  const factory=createClient??(async config=>{const {PrismaClient}=await import('@prisma/client');return new PrismaClient(config);});
  client=await factory({datasources:{db:{url:env.DATABASE_URL}},log:[]});stage='shared-todos-connect';await client.$connect();
  await client.$transaction(async tx=>{
   stage='shared-todos-readonly';await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   stage='shared-todos-columns';await tx.$queryRawUnsafe('SELECT id,"storeId","customerDisplayName","assignedStaffId","createdAt",status FROM "DigitalButlerLead" WHERE status IN (\'NEW\',\'CONTACTING\',\'QUOTED\') LIMIT 0');
  });
  return {sharedTodos:true,readonly:true};
 }catch(error){
  const candidate=error?.code??error?.errorCode;
  const code=typeof candidate==='string'&&/^[A-Z0-9_]{2,64}$/.test(candidate)?candidate:'CHECK';
  const sqlState=typeof error?.meta?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.meta.code)?error.meta.code:undefined;
  error.beautyPreflightDiagnostic={stage,code,sqlState};throw error;
 }finally{if(client)await client.$disconnect();}
}

/** Exercise the same Prisma engine/TLS options as the live Beauty client, without store writes. */
export async function beautyPrismaProductionPreflight(env=process.env,createClient){
 let client,stage='scope';
 try{
  const url=validateBeautyProductionRelease(env);stage='certificate';verifyBeautyProductionCa();
  const factory=createClient??(async config=>{const {PrismaClient}=await import('../generated/beauty-client/index.js');return new PrismaClient(config);});
  client=await factory({datasources:{db:{url}},log:[]});stage='prisma-connect';await client.$connect();stage='prisma-readonly';
  await client.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');stage='prisma-identity';
   // PostgreSQL name is not a Prisma raw result type; expose these metadata identifiers as text.
   const rows=await tx.$queryRawUnsafe('SELECT current_user::text AS role,current_database()::text AS database');
   if(rows.length!==1||rows[0].role!==BEAUTY_PRODUCTION_ROLE||rows[0].database!=='postgres')throw Error('Beauty Prisma runtime identity mismatch');
   stage='prisma-columns';await tx.beautySetting.findMany({select:{storeId:true},take:1});
  });
  return {prisma:true,readonly:true};
 }catch(error){
  const candidate=error?.code??error?.errorCode;
  const code=typeof candidate==='string'&&/^[A-Z0-9_]{2,64}$/.test(candidate)?candidate:'CHECK';
  const sqlState=typeof error?.meta?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.meta.code)?error.meta.code:undefined;
  error.beautyPreflightDiagnostic={stage,code,sqlState};throw error;
 }finally{if(client)await client.$disconnect();}
}
