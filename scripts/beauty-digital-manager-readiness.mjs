import {validateBeautyProductionRelease,BEAUTY_PRODUCTION_ROLE} from './beauty-production-release-preflight.mjs';
import {verifyBeautyProductionCa} from './beauty-production-ca.mjs';

/** Actual runtime identity and SQL planning, strictly read-only; never submits a test notice. */
export async function beautyDigitalManagerReadiness(env=process.env,createClient){
 if(env.VERCEL_ENV!=='production'||env.BEAUTY_MODULE_ENABLED!=='1')return 'skipped';
 const url=validateBeautyProductionRelease(env);
 verifyBeautyProductionCa();
 const factory=createClient??(async config=>{
  const {PrismaClient}=await import('../generated/beauty-client/index.js');
  return new PrismaClient(config);
 });
 const client=await factory({datasources:{db:{url}},log:[]});
 try{
  await client.$connect();
  await client.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const [identity]=await tx.$queryRawUnsafe(`SELECT current_user::text AS role,current_database()::text AS database,current_setting('transaction_read_only') AS readonly`);
   if(identity?.role!==BEAUTY_PRODUCTION_ROLE||identity.database!=='postgres'||identity.readonly!=='on')throw Error('beauty_digital_manager_identity_rejected');
   const [role]=await tx.$queryRawUnsafe(`SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication FROM pg_roles WHERE rolname=current_user`);
   if(!role?.rolcanlogin||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolinherit','rolreplication'].some(k=>role[k]))throw Error('beauty_digital_manager_role_rejected');
   const [access]=await tx.$queryRawUnsafe(`SELECT
    has_table_privilege(current_user,'public."DigitalManagerNotice"','SELECT') AND has_table_privilege(current_user,'public."DigitalManagerNotice"','INSERT')
    AND has_table_privilege(current_user,'public."DigitalManagerActivation"','SELECT') AND has_table_privilege(current_user,'public."DigitalManagerActivation"','INSERT')
    AND NOT has_table_privilege(current_user,'public."DigitalManagerNotice"','DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_table_privilege(current_user,'public."DigitalManagerActivation"','DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND (SELECT bool_and(has_column_privilege(current_user,'public."DigitalManagerNotice"',c,'UPDATE')) FROM unnest(ARRAY['handledAt','handledById','handledByName','revision','updatedAt']) c)
    AND (SELECT bool_and(NOT has_column_privilege(current_user,'public."DigitalManagerNotice"',c,'UPDATE')) FROM unnest(ARRAY['id','storeId','eventKey','eventType','targetId','createdAt']) c)
    AND has_column_privilege(current_user,'public."DigitalManagerActivation"','activatedAt','UPDATE')
    AND NOT has_column_privilege(current_user,'public."DigitalManagerActivation"','storeId','UPDATE') AS ok`);
   if(access?.ok!==true)throw Error('beauty_digital_manager_access_rejected');
   // Permission checks and policy compilation use the actual restricted connection.
   await tx.$queryRawUnsafe('SELECT id,"storeId","eventKey","eventType","targetId","handledAt",revision FROM public."DigitalManagerNotice" LIMIT 0');
   await tx.$queryRawUnsafe('SELECT "storeId","activatedAt" FROM public."DigitalManagerActivation" LIMIT 0');
   for(const sql of [
    `INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") SELECT 'preflight-plan-only',id,'beauty-incomplete:preflight','INCOMPLETE_SERVICE_REMINDER',id FROM public."Store" WHERE false ON CONFLICT ("storeId","eventKey") DO NOTHING`,
    `UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"='system',"handledByName"='system',revision=revision+1,"updatedAt"=now() WHERE false`,
    `INSERT INTO public."DigitalManagerActivation" ("storeId","activatedAt") SELECT id,now() FROM public."Store" WHERE false ON CONFLICT ("storeId") DO NOTHING`,
    `UPDATE public."DigitalManagerActivation" SET "activatedAt"=now() WHERE false`,
   ])await tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`);
  },{maxWait:5000,timeout:30000});
  return 'ready';
 }finally{await client.$disconnect();}
}
