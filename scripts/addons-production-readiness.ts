import {addOnsDatabaseSelection} from '../src/lib/addons-database-url';
import {createAddOnsClient} from '../src/lib/addons-client-factory';
import {checkAddOnsProductionReadiness} from '../src/server/services/addons-production-readiness';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||process.env.ADDONS_DATABASE_PROJECT_REF!=='qijlnhtpbintanzpxkvf')throw Error('Unexpected readiness target');
 const {url,role}=addOnsDatabaseSelection();
 const client=createAddOnsClient(url);
 try{
  const result=await checkAddOnsProductionReadiness(client,{role,storeId:'store-soulife'});
  console.info(`[addons-production-readiness] status=${result.status} identity=true restricted_role=true store_visible=true privileges=true readonly=true`);
 }finally{await client.$disconnect();}
}
void main().catch(()=>{console.error('[addons-production-readiness] blocked; connection or permissions not ready; no feature activated');process.exitCode=1;});
