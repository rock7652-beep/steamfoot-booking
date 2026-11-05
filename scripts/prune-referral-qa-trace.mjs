// Build packaging only: remove the same non-runtime directories already excluded
// by next.config.ts. Next 16 Turbopack does not apply route globs to Proxy traces.
import {readFileSync,writeFileSync,statSync,existsSync,mkdtempSync,cpSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {assertSubscriptionReferralQa} from './subscription-referral-qa-scope.mjs';
import {isMarketingPublicationLocalQa} from './marketing-publication-local-qa.mjs';
const unusedProviderEngine=/^node_modules\/@prisma\/client\/runtime\/query_engine_bg\.(?:cockroachdb|mysql|sqlite|sqlserver)\.wasm-base64\.(?:js|mjs)$/;
function excludedBuildFile(path){return ['docs/','artifacts/','scripts/qa/'].some(prefix=>path.startsWith(prefix))||unusedProviderEngine.test(path);}
export function pruneReferralQaTrace(traceFile,root,apply=false,maxBytes=230*1024*1024){
 const trace=JSON.parse(readFileSync(traceFile,'utf8'));
 if(trace.version!==1||!Array.isArray(trace.files)||trace.files.some(f=>typeof f!=='string'))throw Error('Unexpected Proxy trace format');
 const keep=[];let removed=0,removedBytes=0,keptBytes=0;
 for(const file of trace.files){
  const absolute=resolve(dirname(traceFile),file);const projectPath=relative(root,absolute).split(sep).join('/');
  let bytes=0;try{bytes=statSync(absolute).size;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(excludedBuildFile(projectPath)){removed++;removedBytes+=bytes;}else{keep.push(file);keptBytes+=bytes;}
 }
 if(keptBytes>maxBytes)throw Error('QA Proxy still exceeds safe deployment size; runtime dependencies were not removed');
 if(apply)writeFileSync(traceFile,JSON.stringify({...trace,files:keep}));
 return {removed,removedBytes,kept:keep.length,keptBytes,runtimeDependenciesPreserved:true};
}
export function prepareReferralQaEngineFiles(root){
 for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){
  if(!/datasource\s+db\s*\{[^}]*provider\s*=\s*"postgresql"/.test(readFileSync(resolve(root,schema),'utf8')))throw Error('QA packaging only supports the verified PostgreSQL clients');
 }
 const archive=mkdtempSync(join(tmpdir(),'referral-qa-build-review-'));const moved=[];
 // Keep all review sources: the platform reads their paths after build.
 const runtime=resolve(root,'node_modules/@prisma/client/runtime');
 if(existsSync(runtime))for(const name of readdirSync(runtime)){
  if(!unusedProviderEngine.test('node_modules/@prisma/client/runtime/'+name))continue;
  cpSync(join(runtime,name),join(archive,name));writeFileSync(join(runtime,name),'// Isolated QA: all verified clients use native PostgreSQL.\nthrow new Error("This isolated QA build only supports PostgreSQL engines");\n');moved.push('unused-provider-engine/'+name);
 }
 return {archive,moved};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--prune')throw Error('Requires explicit --prune');
 const local=isMarketingPublicationLocalQa();if(!local&&!assertSubscriptionReferralQa())throw Error('Only the isolated referral QA build may prune its Proxy trace');
 const root=resolve(import.meta.dirname,'..');const dist=local?'.next-marketing-publication-qa':'.next';
 console.log('[referral-qa-trace]',JSON.stringify(pruneReferralQaTrace(resolve(root,dist,'server/middleware.js.nft.json'),root,true)));
 // Never move a developer checkout: only the dedicated Vercel build sandbox.
 if(!local){
  if(!/^\/vercel\/path[0-9]+(?:\/|$)/.test(root)||!existsSync(resolve(root,'.next/BUILD_ID')))throw Error('Review source archiving requires the completed Vercel build sandbox');
  // Vercel merges route and instrumentation traces into function packages.
  function pruneOtherTraces(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
   const file=join(directory,entry.name);if(entry.isDirectory()&&entry.name!=='node_modules'&&entry.name!=='cache')pruneOtherTraces(file);
   else if(entry.isFile()&&entry.name.endsWith('.nft.json'))pruneReferralQaTrace(file,root,true,Infinity);
  }}
  pruneOtherTraces(resolve(root,'.next'));
  const archived=prepareReferralQaEngineFiles(root);
  console.log('[referral-qa-trace]',JSON.stringify({unusedProviderEnginesBackedUp:archived.moved,backupOutsideProject:true}));
 }
}
