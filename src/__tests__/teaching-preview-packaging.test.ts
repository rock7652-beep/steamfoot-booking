import {expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertTeachingPreviewPackaging,teachingReviewImagePaths,TEACHING_PREVIEW_BRANCH} from '../../scripts/teaching-preview-packaging.mjs';
const direct='postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres';
const valid={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:TEACHING_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:direct,DIRECT_URL:direct};
it('limits packaging to the exact isolated Preview build without changing production gates',()=>{
 expect(()=>assertTeachingPreviewPackaging(valid,'/vercel/path0')).not.toThrow();
 expect(()=>assertTeachingPreviewPackaging({...valid,VERCEL_GIT_COMMIT_REF:'fix/course-plan-classification-sync-20261112'},'/vercel/path0')).not.toThrow();
 for(const overrides of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_PROJECT_ID:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{WORKERS_CI_BRANCH:TEACHING_PREVIEW_BRANCH},{DATABASE_URL:direct.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DIRECT_URL:direct+'?host=production.invalid'},{SUBSCRIPTION_REFERRAL_QA:'1'}])expect(()=>assertTeachingPreviewPackaging({...valid,...overrides},'/vercel/path0')).toThrow();
 expect(()=>assertTeachingPreviewPackaging(valid,'/workspace/steamfoot-booking')).toThrow();
});
it('selects only review images, retaining runtime images, JSON evidence and scripts',()=>{
 const root=mkdtempSync(join(tmpdir(),'teaching-preview-package-'));try{
  for(const dir of ['artifacts/review','public','scripts'])mkdirSync(join(root,dir),{recursive:true});
  for(const file of ['artifacts/review/screen.png','artifacts/review/layout.json','public/logo.png','scripts/check.mjs'])writeFileSync(join(root,file),'fixture');
  expect(teachingReviewImagePaths(root)).toEqual(['artifacts/review/screen.png']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
