// Build packaging only: remove the same non-runtime directories already excluded
// by next.config.ts. Next 16 Turbopack does not apply route globs to Proxy traces.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertSubscriptionReferralQa} from './subscription-referral-qa-scope.mjs';
import {isMarketingPublicationLocalQa} from './marketing-publication-local-qa.mjs';
export function pruneReferralQaTrace(traceFile,root,apply=false){
 const trace=JSON.parse(readFileSync(traceFile,'utf8'));
 if(trace.version!==1||!Array.isArray(trace.files)||trace.files.some(f=>typeof f!=='string'))throw Error('Unexpected Proxy trace format');
 const excluded=['docs/','artifacts/','scripts/qa/'];const keep=[];let removed=0,removedBytes=0,keptBytes=0;
 for(const file of trace.files){
  const absolute=resolve(dirname(traceFile),file);const projectPath=relative(root,absolute).split(sep).join('/');
  let bytes=0;try{bytes=statSync(absolute).size;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(excluded.some(prefix=>projectPath.startsWith(prefix))){removed++;removedBytes+=bytes;}else{keep.push(file);keptBytes+=bytes;}
 }
 if(keptBytes>230*1024*1024)throw Error('QA Proxy still exceeds safe deployment size; runtime dependencies were not removed');
 if(apply)writeFileSync(traceFile,JSON.stringify({...trace,files:keep}));
 return {removed,removedBytes,kept:keep.length,keptBytes,runtimeDependenciesPreserved:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--prune')throw Error('Requires explicit --prune');
 const local=isMarketingPublicationLocalQa();if(!local&&!assertSubscriptionReferralQa())throw Error('Only the isolated referral QA build may prune its Proxy trace');
 const root=resolve(import.meta.dirname,'..');const dist=local?'.next-marketing-publication-qa':'.next';
 console.log('[referral-qa-trace]',JSON.stringify(pruneReferralQaTrace(resolve(root,dist,'server/middleware.js.nft.json'),root,true)));
}
