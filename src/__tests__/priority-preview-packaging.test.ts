import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {shouldPackagePriorityPreview,packagePriorityPreview} from '../../scripts/priority-preview-packaging.mjs';
const url='postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'fix/music-leave-entitlement-20261102',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url};
describe('priority isolated Preview packaging',()=>{
 it('skips production main and unrelated builds, rejecting forged scope and unsafe connections',()=>{
  expect(shouldPackagePriorityPreview({...env,VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'},'/vercel/path0')).toBe(false);
  expect(shouldPackagePriorityPreview({...env,VERCEL_GIT_COMMIT_REF:'unrelated'},'/vercel/path0')).toBe(false);
  expect(shouldPackagePriorityPreview(env,'/vercel/path0')).toBe(true);
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'other'},{VERCEL_GIT_REPO_OWNER:'other'},{DIRECT_URL:url.replace('ttworfzgwejdeolegkxl','other')},{DATABASE_URL:''},{SUBSCRIPTION_REFERRAL_QA:'1'},{WORKERS_CI_BRANCH:'other'}])expect(()=>shouldPackagePriorityPreview({...env,...patch},'/vercel/path0')).toThrow();
  expect(()=>shouldPackagePriorityPreview(env,'/workspace/project')).toThrow();
 });
 it('retains source files, PostgreSQL engines, certificates and unknown runtime assets',()=>{
  const root=mkdtempSync(join(tmpdir(),'priority-package-'));const archive='';
  try{
   for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
   const paths=['docs/review.md','artifacts/review.png','scripts/qa/review.mjs','public/asset.png','scripts/certs/root.crt','generated/course-client/engine.node','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js','unknown/runtime.dat'];
   for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
   for(const path of ['.next/server/middleware.js.nft.json','.next/server/app/page.js.nft.json']){const trace=join(root,path);mkdirSync(dirname(trace),{recursive:true});writeFileSync(trace,JSON.stringify({version:1,files:paths.map(p=>relative(dirname(trace),join(root,p)))}));}
   expect(()=>packagePriorityPreview(root)).toThrow('Completed');writeFileSync(join(root,'.next/BUILD_ID'),'fixture');
   expect(packagePriorityPreview(root).runtimeDependenciesPreserved).toBe(true);
   for(const p of paths)expect(readFileSync(join(root,p),'utf8')).toBe('fixture');
   const trace=join(root,'.next/server/middleware.js.nft.json');expect(JSON.parse(readFileSync(trace,'utf8')).files).toEqual(paths.slice(3).map(p=>relative(dirname(trace),join(root,p))));
   // This fixture has no unused provider engines; no originals are replaced.
  }finally{rmSync(root,{recursive:true,force:true});if(archive)rmSync(archive,{recursive:true,force:true});}
 });
});
