// Scoped ephemeral Preview build artifacts only; preserve all runtime assets and DB gates.
import {existsSync,readdirSync} from 'node:fs';
import {join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertSportsSharedCardPreviewEnvironment} from './sports-shared-card-preview-scope.mjs';
import {archiveProductionReviewImages,pruneProductionTraces} from './production-postgres-packaging.mjs';
export const TEACHING_PREVIEW_BRANCH='fix/teaching-item-qualifications-20261112';
export const TEACHING_PREVIEW_BRANCHES=[TEACHING_PREVIEW_BRANCH,'fix/course-plan-classification-sync-20261112','fix/course-retained-store-route-20261112'];
export function assertTeachingPreviewPackaging(env,root){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||!TEACHING_PREVIEW_BRANCHES.includes(env.VERCEL_GIT_COMMIT_REF)||!/^\/vercel\/path[0-9]+$/.test(root)||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA)throw Error('Teaching packaging requires exact isolated Preview build');
 assertSportsSharedCardPreviewEnvironment(env);
}
export function teachingReviewImagePaths(root){
 const paths=[],directory=join(root,'artifacts');
 function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const full=join(dir,entry.name),path=relative(root,full).split(sep).join('/');
  if(entry.isDirectory())visit(full);
  else if(/^artifacts\/.*\.(?:png|jpe?g|webp)$/i.test(path))paths.push(path);
 }}
 if(existsSync(directory))visit(directory);return paths;
}
export function archiveTeachingPreviewInputs(env,root){
 assertTeachingPreviewPackaging(env,root);
 return archiveProductionReviewImages(root,teachingReviewImagePaths(root));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--if-preview')throw Error('Use --if-preview');
 if(process.env.VERCEL_ENV==='preview'&&TEACHING_PREVIEW_BRANCHES.includes(process.env.VERCEL_GIT_COMMIT_REF)){
  const root=resolve(import.meta.dirname,'..');assertTeachingPreviewPackaging(process.env,root);
  console.info('[teaching-preview-packaging]',JSON.stringify(pruneProductionTraces(root)));
 }else console.info('[teaching-preview-packaging] skipped=true');
}
