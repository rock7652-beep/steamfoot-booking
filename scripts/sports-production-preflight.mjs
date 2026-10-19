// Manual operator invocation only; never imported by build/start.
import {createRequire} from 'node:module';
import {sportsProductionRulesEnvironment} from './sports-production-scope.mjs';
import {verifySportsProductionReadiness} from './sports-production-readiness.mjs';
if(!sportsProductionRulesEnvironment())throw new Error('Production preflight requires the verified production environment.');
const require=createRequire(import.meta.url);const{PrismaClient}=require('../generated/course-client');
const db=new PrismaClient({datasourceUrl:process.env.DATABASE_URL,log:[]});
try{
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog,public');
  const[role]=await tx.$queryRawUnsafe(`SELECT current_user AS application_role,session_user AS session_role,
   (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
   has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
   to_regclass('public."SportsStagingSessionRule"') IS NOT NULL AS metadata_present,
   to_regclass('public."CoursePointEntry"') IS NOT NULL AS ledger_present`);
  if(!role.metadata_present||!role.ledger_present)return{...role,ready:false,readOnly:true};
  try{await verifySportsProductionReadiness(sql=>tx.$queryRawUnsafe(sql));return{...role,ready:true,readOnly:true};}
  catch{return{...role,ready:false,readOnly:true};}
 });console.log(JSON.stringify(result));if(!result.ready)process.exitCode=1;
}catch{console.error('Production readiness query failed; no database changes were made.');process.exitCode=1;}
finally{await db.$disconnect();}
