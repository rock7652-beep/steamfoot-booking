// Packaging only for the existing isolated guide Preview; no DB/network operations.
import {existsSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {archiveProductionReviewImages} from './production-postgres-packaging.mjs';
import {fileURLToPath} from 'node:url';
import {OPERATION_GUIDE_PREVIEW_BRANCH,assertOperationGuidePreviewEnvironment} from './consultation-preview-scope.mjs';
import {pruneReferralQaTrace,prepareReferralQaEngineFiles} from './prune-referral-qa-trace.mjs';
export function shouldPackageGuidePreview(env,root){
 if(![env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH].includes(OPERATION_GUIDE_PREVIEW_BRANCH))return false;
 assertOperationGuidePreviewEnvironment(env);
 if(env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||!/^\/vercel\/path[0-9]+$/.test(root)||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA)throw Error('Guide packaging requires its exact isolated project and Vercel build sandbox');
 return true;
}
export function archiveGuideReviewImages(root){
 const paths=[],directory=join(root,'artifacts');
 function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const full=join(dir,entry.name),path=relative(root,full).split('\\').join('/');
  if(entry.isDirectory())visit(full);
  else if(/^artifacts\/.*\.(png|jpe?g|webp)$/i.test(path))paths.push(path);
 }}
 if(existsSync(directory))visit(directory);
 return archiveProductionReviewImages(root,paths);
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
 const mode=process.argv.slice(2).join(' ');
 if(!['--if-guide-preview','--before-build'].includes(mode))throw Error('Use --if-guide-preview or --before-build');
 const root=resolve(import.meta.dirname,'..');
 if(shouldPackageGuidePreview(process.env,root))console.log('[operation-guide-packaging]',JSON.stringify(mode==='--before-build'?archiveGuideReviewImages(root):packageGuidePreview(root)));
 else console.log('[operation-guide-packaging] skipped_unrelated_build=true');
}
