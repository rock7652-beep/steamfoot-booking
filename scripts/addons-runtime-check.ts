export {};
/** Run only within the reviewed application environment; no env pull or credentials override.
 * NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx scripts/addons-runtime-check.ts
 * Not wired into npm build, CI, a public HTTP route, or a scheduled job. */
const unavailable={status:'UNAVAILABLE',connectionVerified:false,identityMatches:false,restrictedRole:false,schemaReady:false,historyProtected:false};
async function main(){
 try{
  if(process.env.ADDONS_RUNTIME_REVIEW!=='beauty-runtime-v1'||process.env.VERCEL_ENV!=='production'||process.env.VERCEL_GIT_COMMIT_REF!=='main'){
   console.log(JSON.stringify(unavailable));process.exitCode=1;return;
  }
  const [{beautyPrisma},{buildBeautyDatabaseUrl},{readBeautyAddOnsRuntimeEvidence}]=await Promise.all([
   import('../src/lib/beauty-db'),import('../src/lib/beauty-database-url'),import('../src/server/services/addons-runtime-evidence')
  ]);
  const result=await readBeautyAddOnsRuntimeEvidence(beautyPrisma,buildBeautyDatabaseUrl(),{project:'qijlnhtpbintanzpxkvf',role:'steamfoot_beauty_prod_20261025'});
  console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
  await beautyPrisma.$disconnect();
 }catch{console.log(JSON.stringify(unavailable));process.exitCode=1;}
}
void main();
