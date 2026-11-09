// Build artifacts only: reuse existing trace pruning and preserve native PostgreSQL assets.
import {existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertReviewedReleaseEnvironment} from './consultation-preview-scope.mjs';
import {pruneReferralQaTrace,prepareReferralQaEngineFiles} from './prune-referral-qa-trace.mjs';
const branches=['fix/liff-member-logout-20261027','fix/course-reminder-active-scope-20261026','fix/music-leave-entitlement-20261102'];
export function shouldPackagePriorityPreview(env,root){
 if(![env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH].some(branch=>branches.includes(branch)))return false;
 const scope=assertReviewedReleaseEnvironment(env);
 if(!['module-roster-preview','sports-shared-card-preview'].includes(scope)||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||!/^\/vercel\/path[0-9]+$/.test(root)||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA)throw Error('Priority packaging requires its reviewed isolated project and build sandbox');
 return true;
}
export function packagePriorityPreview(root){
 if(!existsSync(join(root,'.next/BUILD_ID')))throw Error('Completed Preview build required');
 const result=pruneReferralQaTrace(join(root,'.next/server/middleware.js.nft.json'),root,true,245_000_000);
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const file=join(directory,entry.name);
  if(entry.isDirectory()&&!['node_modules','cache'].includes(entry.name))visit(file);
  else if(entry.isFile()&&entry.name.endsWith('.nft.json'))pruneReferralQaTrace(file,root,true,Infinity);
 }}
 visit(join(root,'.next'));
 const backup=prepareReferralQaEngineFiles(root);
 return {...result,unusedProviderEnginesBackedUp:backup.moved,backupOutsideProject:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--if-priority-preview')throw Error('Use --if-priority-preview');
 const root=resolve(import.meta.dirname,'..');
 if(shouldPackagePriorityPreview(process.env,root))console.log('[priority-preview-packaging]',JSON.stringify(packagePriorityPreview(root)));
 else console.log('[priority-preview-packaging] skipped_unrelated_build=true');
}
