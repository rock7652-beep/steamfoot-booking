import {fileURLToPath} from 'node:url';
import {beautyDigitalManagerReadiness} from './beauty-digital-manager-readiness.mjs';
import {assertDigitalManagerLocalEnvironment,assertDigitalManagerProductionEnvironment,verifyDigitalManagerReadiness} from './digital-manager-migration-review.mjs';

/** Production builds must verify the already-installed schema before deploying the app. */
export async function checkDigitalManagerBuildReadiness(env=process.env,createClient){
 if(env.DIGITAL_MANAGER_MIGRATION_QA==='1')assertDigitalManagerLocalEnvironment(env);
 else if(env.VERCEL_ENV!=='production')return 'skipped';
 else assertDigitalManagerProductionEnvironment(env);
 const client=await createClient(env.DIRECT_URL);
 try{
  await verifyDigitalManagerReadiness(client);
  const beauty=await beautyDigitalManagerReadiness(env);
  if(beauty==='ready')console.info('[beauty-digital-manager-preflight] runtime_login=true schema_read=true required_privileges=true sql_planning=true readonly=true');
  return 'ready';
 }
 finally{await client.$disconnect();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 checkDigitalManagerBuildReadiness(process.env,async url=>{
  const {PrismaClient}=await import('@prisma/client');
  return new PrismaClient({datasources:{db:{url}}});
 }).then(result=>console.log(`digital-manager-build: ${result}`)).catch(()=>{
  console.error('digital-manager-build: readiness_rejected');process.exitCode=1;
 });
}
