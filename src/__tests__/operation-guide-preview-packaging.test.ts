import { describe,it,expect } from 'vitest';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { join,dirname,relative } from 'node:path';
import { tmpdir } from 'node:os';
import { shouldPackageGuidePreview,packageGuidePreview } from '../../scripts/operation-guide-preview-packaging.mjs';
const url='postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'docs/operation-guide-audit-20261012',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url};
describe('isolated guide Preview packaging',()=>{
 it('leaves production and other previews untouched and rejects forged guide scope',()=>{
  expect(shouldPackageGuidePreview({...env,VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'},'/vercel/path0')).toBe(false);
  expect(shouldPackageGuidePreview({...env,VERCEL_GIT_COMMIT_REF:'another-branch'},'/vercel/path0')).toBe(false);
  expect(shouldPackageGuidePreview(env,'/vercel/path0')).toBe(true);
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'other'},{VERCEL_GIT_REPO_OWNER:'other'},{DIRECT_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DATABASE_URL:''},{SUBSCRIPTION_REFERRAL_QA:'1'},{WORKERS_CI_BRANCH:'main'}])expect(()=>shouldPackageGuidePreview({...env,...patch},'/vercel/path0')).toThrow();
  expect(()=>shouldPackageGuidePreview(env,'/workspace/project')).toThrow();
 });
 it('prunes review traces but retains source files, runtime data, certs, unknown paths and PostgreSQL engines',()=>{
  const root=mkdtempSync(join(tmpdir(),'guide-package-'));
  try{
   for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
   const paths=['docs/review.md','artifacts/review.png','scripts/qa/review.mjs','public/asset.png','scripts/certs/root.crt','generated/course-client/engine.node','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js','unknown/runtime.dat'];
   for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
   for(const path of ['.next/server/middleware.js.nft.json','.next/server/app/guide.js.nft.json']){const trace=join(root,path);mkdirSync(dirname(trace),{recursive:true});writeFileSync(trace,JSON.stringify({version:1,files:paths.map(p=>relative(dirname(trace),join(root,p)))}));}
   expect(()=>packageGuidePreview(root)).toThrow('Completed');writeFileSync(join(root,'.next/BUILD_ID'),'fixture');
   expect(packageGuidePreview(root).runtimeDependenciesPreserved).toBe(true);
   for(const p of paths)expect(readFileSync(join(root,p),'utf8')).toBe('fixture');
   for(const path of ['.next/server/middleware.js.nft.json','.next/server/app/guide.js.nft.json']){const trace=join(root,path);expect(JSON.parse(readFileSync(trace,'utf8')).files).toEqual(paths.slice(3).map(p=>relative(dirname(trace),join(root,p))));}
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});
