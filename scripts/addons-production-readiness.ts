import {fileURLToPath} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {addOnsDatabaseSelection} from '../src/lib/addons-database-url';
import {checkAddOnsProductionReadiness} from '../src/server/services/addons-production-readiness';
type Client=Pick<PrismaClient,'$transaction'|'$disconnect'>;
/** Build-time probe: no HTTP session, audit actor resolution, or business mutations. */
export async function runAddOnsProductionReadiness(env:NodeJS.ProcessEnv=process.env,create:(url:string)=>Client=url=>new PrismaClient({datasources:{db:{url}},log:[]})){
 if(env.VERCEL_ENV!=='production'||env.ADDONS_DATABASE_PROJECT_REF!=='qijlnhtpbintanzpxkvf')throw Error('Unexpected readiness target');
 const {url,role}=addOnsDatabaseSelection(env);
 const client=create(url);
 try{
  const result=await checkAddOnsProductionReadiness(client,{role,storeId:'store-soulife'});
  console.info(`[addons-production-readiness] status=${result.status} identity=true restricted_role=true store_visible=true privileges=true readonly=true`);
  return result;
 }finally{await client.$disconnect();}
}
export function productionReadinessFailureCode(error:unknown){
 if(!error||typeof error!=='object')return 'CHECK';
 const value=error as {code?:unknown;errorCode?:unknown};
 const code=value.code??value.errorCode;
 return typeof code==='string'&&/^P\d{4}$/.test(code)?code:'CHECK';
}
if(process.argv[1]===fileURLToPath(import.meta.url))void runAddOnsProductionReadiness().catch(error=>{
 const code=productionReadinessFailureCode(error);
 console.error(`[addons-production-readiness] blocked code=${code}; connection or permissions not ready; no feature activated`);process.exitCode=1;
});
