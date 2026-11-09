// Build artifacts only. No database clients, credentials, migrations or deployed settings.
import {readFileSync,statSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareReferralQaEngineFiles} from './prune-referral-qa-trace.mjs';
const unused=/^node_modules\/@prisma\/client\/runtime\/query_engine_bg\.(cockroachdb|mysql|sqlite|sqlserver)\.wasm-base64\.(js|mjs)$/;
export function assertProductionPackaging(env,root){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA||!/^\/vercel\/path[0-9]+$/.test(root))throw Error('Production packaging requires the exact production main project and Vercel build sandbox');
}
export function inspectProductionPackage(root,dist='.next'){
 for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma'])if(!/datasource\s+db\s*\{[^}]*provider\s*=\s*"postgresql"/.test(readFileSync(join(root,schema),'utf8')))throw Error('All runtime datasources must remain PostgreSQL');
 const trace=join(root,dist,'server/middleware.js.nft.json'),data=JSON.parse(readFileSync(trace,'utf8'));
 if(data.version!==1||!Array.isArray(data.files)||data.files.some(f=>typeof f!=='string'))throw Error('Unexpected Proxy trace');
 let tracedBytes=0,unusedEngineBytes=0;const unusedEngines=[];
 for(const f of new Set(data.files)){
  const full=resolve(dirname(trace),f),path=relative(root,full).split(sep).join('/'),size=statSync(full).size;
  tracedBytes+=size;if(unused.test(path)){unusedEngineBytes+=size;unusedEngines.push(path);}
 }
 // Conservative: retain all review sources even if the platform merges old traces.
 const conservativeBytes=tracedBytes-unusedEngineBytes+unusedEngines.length*256;
 return {tracedBytes,unusedEngineBytes,conservativeBytes,unusedEngines,withinSafetyBudget:conservativeBytes<245_000_000,filesModified:false};
}
export function pruneProductionNft(file,root){
 const data=JSON.parse(readFileSync(file,'utf8'));
 if(data.version!==1||!Array.isArray(data.files)||data.files.some(f=>typeof f!=="string"))throw Error("Unexpected function trace");
 const files=data.files.filter(f=>!unused.test(relative(root,resolve(dirname(file),f)).split(sep).join('/')));
 if(files.length!==data.files.length)writeFileSync(file,JSON.stringify({...data,files}));
 return data.files.length-files.length;
}
export function pruneProductionTraces(root){
 if(!existsSync(join(root,'.next/BUILD_ID')))throw Error('Completed build required');
 const plan=inspectProductionPackage(root);if(!plan.withinSafetyBudget)throw Error('Proxy remains above the production packaging safety budget');
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const p=join(directory,entry.name);if(entry.isDirectory()&&!['node_modules','cache'].includes(entry.name))visit(p);
  else if(entry.isFile()&&entry.name.endsWith('.nft.json'))pruneProductionNft(p,root);
 }}
 visit(join(root,'.next'));
 const archive=prepareReferralQaEngineFiles(root,'Production PostgreSQL');
 return {...plan,filesModified:true,unusedProviderStubs:archive.moved,originalEnginesBackedUpOutsideBuildRoot:true,backupDirectory:archive.archive};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=resolve(import.meta.dirname,'..');const args=process.argv.slice(2).join(' ');
 if(args==='--inspect-local')console.log(JSON.stringify(inspectProductionPackage(root,'.next-marketing-publication-qa'),null,2));
 else if(args==='--if-production'&&process.env.VERCEL_ENV!=='production')console.log('[production-postgres-packaging] skipped_non_production=true');
 else if(['--prune','--if-production'].includes(args)){assertProductionPackaging(process.env,root);console.log('[production-postgres-packaging]',JSON.stringify(pruneProductionTraces(root)));}
 else throw Error('Use --inspect-local (read-only), --if-production, or --prune (exact production main only)');
}
