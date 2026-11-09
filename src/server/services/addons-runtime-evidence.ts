import 'server-only';

type Row={databaseMatches:boolean;roleMatches:boolean;restrictedRole:boolean;schemaReady:boolean;historyProtected:boolean};
type QueryClient={$executeRawUnsafe:(query:string)=>Promise<unknown>;$queryRawUnsafe:<T>(query:string,...values:unknown[])=>Promise<T>};
type RuntimeClient={$transaction:<T>(work:(tx:QueryClient)=>Promise<T>,options:{maxWait:number;timeout:number})=>Promise<T>};
export type RuntimeEvidence={connectionVerified:boolean;identityMatches:boolean;restrictedRole:boolean;schemaReady:boolean;historyProtected:boolean;status:'PASS'|'BLOCKED'|'UNAVAILABLE'};
const unavailable:RuntimeEvidence={connectionVerified:false,identityMatches:false,restrictedRole:false,schemaReady:false,historyProtected:false,status:'UNAVAILABLE'};
const query=`SELECT current_database()=$1 AS "databaseMatches",current_user=$2 AS "roleMatches",
 EXISTS(SELECT FROM pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
 AND NOT EXISTS(SELECT FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolcreaterole OR elevated.rolcreatedb) AND pg_has_role(r.oid,elevated.oid,'MEMBER'))) AS "restrictedRole",
 (NOT EXISTS(SELECT FROM unnest(ARRAY['BeautyServiceImage','BeautySharedGoodsOrder']) t WHERE to_regclass(format('public.%I',t)) IS NULL)
 AND NOT EXISTS(SELECT FROM (VALUES ('BeautySetting','serviceAddOnsEnabled'),('BeautyService','addOnGroups'),('BeautyService','imageId'),('BeautyAppointment','addOnItems'),('BeautyAppointment','baseServiceDuration'),('BeautyAppointment','serviceImageId'),('BeautyPayment','sharedGoodsOrderId')) v(t,c) WHERE NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name=v.t AND column_name=v.c))) AS "schemaReady",
 EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('public."BeautyPayment"') AND tgname='beauty_payment_immutable' AND tgenabled IN ('O','A') AND NOT tgisinternal) AS "historyProtected"`;

/** Caller must supply the existing Beauty application client and its effective URL.
 * No new credentials, SET ROLE, user SQL, public endpoint, or connection-string output.
 * Target/role expectations are reviewed server configuration, never request parameters.
 * PASS covers these checks only; it does not certify tenant isolation or migrations. */
export async function readBeautyAddOnsRuntimeEvidence(client:RuntimeClient,effectiveUrl:string,expected:{project:string;role:string}):Promise<RuntimeEvidence>{
 try{
  if(!/^[a-z0-9]{20}$/.test(expected.project)||!/^steamfoot_beauty_[a-z0-9_]+$/.test(expected.role))return {...unavailable};
  const u=new URL(effectiveUrl),user=decodeURIComponent(u.username);
  const target=u.protocol==='postgresql:'||u.protocol==='postgres:';
  const direct=u.hostname===`db.${expected.project}.supabase.co`&&user===expected.role;
  const pooled=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&user===`${expected.role}.${expected.project}`;
  if(!target||u.pathname!=='/postgres'||!(direct||pooled))return {...unavailable};
  return await client.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
   const [r]=await tx.$queryRawUnsafe<Row[]>(query,'postgres',expected.role);
   if(!r)return {...unavailable};
   const identityMatches=r.databaseMatches===true&&r.roleMatches===true;
   const result={connectionVerified:true,identityMatches,restrictedRole:r.restrictedRole===true,schemaReady:r.schemaReady===true,historyProtected:r.historyProtected===true};
   return {...result,status:Object.values(result).every(Boolean)?'PASS':'BLOCKED'};
  },{maxWait:5000,timeout:10000});
 }catch{return {...unavailable};}
}
