// Packaging only for the existing isolated guide Preview; no DB/network operations.
import {existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OPERATION_GUIDE_PREVIEW_BRANCH,assertOperationGuidePreviewEnvironment} from './consultation-preview-scope.mjs';
import {pruneReferralQaTrace,prepareReferralQaEngineFiles} from './prune-referral-qa-trace.mjs';
export function shouldPackageGuidePreview(env,root){
 if(![env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH].includes(OPERATION_GUIDE_PREVIEW_BRANCH))return false;
 assertOperationGuidePreviewEnvironment(env);
 if(env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||!/^\/vercel\/path[0-9]+$/.test(root)||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA)throw Error('Guide packaging requires its exact isolated project and Vercel build sandbox');
 return true;
}
export function packageGuidePreview(root){
 if(!existsSync(join(root,'.next/BUILD_ID')))throw Error('Completed guide Preview build required');
 const result=pruneReferralQaTrace(join(root,'.next/server/middleware.js.nft.json'),root,true,245_000_000);
 // The platform merges route traces; keep runtime assets and PostgreSQL engines.
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const file=join(directory,entry.name);
  if(entry.isDirectory()&&!['node_modules','cache'].includes(entry.name))visit(file);
  else if(entry.isFile()&&entry.name.endsWith('.nft.json'))pruneReferralQaTrace(file,root,true,Infinity);
 }}
 visit(join(root,'.next'));
 // Same reviewed helper as referral QA: originals backed up outside build root.
 const backup=prepareReferralQaEngineFiles(root);
 return {...result,unusedProviderEnginesBackedUp:backup.moved,backupOutsideProject:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--if-guide-preview')throw Error('Use --if-guide-preview');
 const root=resolve(import.meta.dirname,'..');
 if(shouldPackageGuidePreview(process.env,root))console.log('[operation-guide-packaging]',JSON.stringify(packageGuidePreview(root)));
 else console.log('[operation-guide-packaging] skipped_unrelated_build=true');
}
