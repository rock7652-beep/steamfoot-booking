import 'server-only';
import type {PrismaClient} from '@prisma/client';
const query=`SELECT
 current_database()='postgres' AND current_user=$1 AS "identityMatches",
 EXISTS(SELECT FROM pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolinherit OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
  AND NOT EXISTS(SELECT FROM pg_roles e WHERE (e.rolsuper OR e.rolbypassrls OR e.rolcreaterole OR e.rolcreatedb OR e.rolreplication) AND pg_has_role(r.oid,e.oid,'MEMBER'))) AS "restrictedRole",
 EXISTS(SELECT FROM "Store" WHERE id=$2) AS "storeVisible",
 (SELECT count(*)=4 AND bool_and(relrowsecurity) FROM pg_class WHERE oid=ANY(ARRAY[to_regclass('public."Store"'),to_regclass('public."StoreFeatureEntitlement"'),to_regclass('public."ServiceAddOnCatalog"'),to_regclass('public."ServiceAddOnImage"')])) AS "rlsReady",
 NOT EXISTS(SELECT FROM (VALUES
  ('StoreFeatureEntitlement','status','SELECT'),
  ('ServiceAddOnCatalog','storeId','SELECT'),('ServiceAddOnCatalog','storeId','INSERT'),
  ('ServiceAddOnCatalog','module','SELECT'),('ServiceAddOnCatalog','module','INSERT'),
  ('ServiceAddOnCatalog','groups','SELECT'),('ServiceAddOnCatalog','groups','INSERT'),('ServiceAddOnCatalog','groups','UPDATE'),
  ('ServiceAddOnCatalog','revision','SELECT'),('ServiceAddOnCatalog','revision','INSERT'),('ServiceAddOnCatalog','revision','UPDATE'),
  ('ServiceAddOnCatalog','enabled','SELECT'),('ServiceAddOnCatalog','enabled','INSERT'),('ServiceAddOnCatalog','enabled','UPDATE'),
  ('ServiceAddOnImage','id','SELECT'),('ServiceAddOnImage','id','INSERT'),
  ('ServiceAddOnImage','storeId','SELECT'),('ServiceAddOnImage','storeId','INSERT'),
  ('ServiceAddOnImage','module','SELECT'),('ServiceAddOnImage','module','INSERT'),
  ('ServiceAddOnImage','content','SELECT'),('ServiceAddOnImage','content','INSERT'),
  ('ServiceAddOnImage','thumbnail','SELECT'),('ServiceAddOnImage','thumbnail','INSERT'),
  ('ServiceAddOnImage','createdAt','SELECT'),('ServiceAddOnImage','createdAt','INSERT')
 ) v(t,c,p) WHERE NOT has_column_privilege(current_user,format('public.%I',v.t),v.c,v.p)) AS "requiredPrivileges"`;
type Evidence={identityMatches:boolean;restrictedRole:boolean;storeVisible:boolean;rlsReady:boolean;requiredPrivileges:boolean};
/** Uses the application's dedicated client; reads only, never activates an entitlement. */
export async function checkAddOnsProductionReadiness(client:Pick<PrismaClient,'$transaction'>,expected:{role:string;storeId:string}){
 if(!/^steamfoot_addons_[a-z0-9_]+$/.test(expected.role)||!expected.storeId)throw Error('Invalid add-ons readiness target');
 return client.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
  const [row]=await tx.$queryRawUnsafe<Evidence[]>(query,expected.role,expected.storeId);
  if(!row||!['identityMatches','restrictedRole','storeVisible','rlsReady','requiredPrivileges'].every(key=>row[key as keyof Evidence]===true))throw Error('Add-ons role, store or privileges not ready');
  await tx.serviceAddOnCatalog.findFirst({where:{storeId:expected.storeId,module:'BEAUTY'},select:{groups:true,revision:true}});
  await tx.serviceAddOnImage.findFirst({where:{storeId:expected.storeId,module:'BEAUTY'},select:{id:true}});
  return {status:'PASS' as const,...row,readonly:true as const};
 },{maxWait:5000,timeout:10000});
}
