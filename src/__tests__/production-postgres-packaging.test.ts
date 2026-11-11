import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,truncateSync,existsSync,symlinkSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';import {tmpdir} from 'node:os';
import {assertProductionPackaging,inspectProductionPackage,pruneProductionNft,pruneProductionTraces,archiveProductionReviewImages,archiveProductionReviewInputs} from '../../scripts/production-postgres-packaging.mjs';
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking'};
describe('production PostgreSQL packaging',()=>{
 it('requires genuine production-main scope and the platform build sandbox',()=>{
  expect(()=>assertProductionPackaging(env,'/vercel/path0')).not.toThrow();
  for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'prj_09HrzKOJ4Iu5LKouVry9VeXiC8LJ'},{VERCEL_GIT_COMMIT_REF:'content/marketing-beauty-addons-20261104'},{VERCEL_GIT_REPO_OWNER:'other'},{SUBSCRIPTION_REFERRAL_QA:'1'},{MARKETING_PUBLICATION_LOCAL_QA:'1'},{WORKERS_CI_BRANCH:'main'}])expect(()=>assertProductionPackaging({...env,...patch},'/vercel/path0')).toThrow();
  expect(()=>assertProductionPackaging(env,'/workspace/steamfoot-booking')).toThrow();
 });
 it('archives review inputs before tracing and rejects late source removal, preserving evidence and runtime assets',()=>{
  const root=mkdtempSync(join(tmpdir(),'production-package-'));let archive='',reviewArchive='';
  try{
   const trace=join(root,'.next/server/middleware.js.nft.json');mkdirSync(dirname(trace),{recursive:true});
   for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
   const paths=['node_modules/@prisma/client/runtime/query_engine_bg.mysql.wasm-base64.js','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js','generated/course-client/engine.node','docs/runtime.md','artifacts/review.json','scripts/qa/review.mjs','scripts/certs/root.crt','public/image.png','src/lib/auth.ts','artifacts/run/screen.png'];
   for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
   writeFileSync(trace,JSON.stringify({version:1,files:paths.map(p=>relative(dirname(trace),join(root,p)))}));writeFileSync(join(root,'.next/BUILD_ID'),'synthetic');
   const before=readFileSync(trace,'utf8'),plan=inspectProductionPackage(root);expect(plan.unusedEngines).toHaveLength(1);expect(plan.filesModified).toBe(false);expect(readFileSync(trace,'utf8')).toBe(before);
   expect(plan.reviewScreenshots).toEqual(['artifacts/run/screen.png']);expect(pruneProductionNft(trace,root)).toBe(2);expect(JSON.parse(readFileSync(trace,'utf8')).files).toHaveLength(paths.length-2);
   // Restore the trace so the entire production artifact operation is exercised.
   writeFileSync(trace,before);
   expect(()=>pruneProductionTraces(root)).toThrow('before Next.js tracing');
   expect(readFileSync(join(root,'artifacts/run/screen.png'),'utf8')).toBe('fixture');
   const review=archiveProductionReviewImages(root,['artifacts/run/screen.png']);reviewArchive=review.archive;
   // Next/Vercel now captures paths from the already-pruned source tree.
   writeFileSync(trace,JSON.stringify({version:1,files:paths.filter(p=>existsSync(join(root,p))).map(p=>relative(dirname(trace),join(root,p)))}));
   const result=pruneProductionTraces(root);expect(result.unusedProviderStubs).toHaveLength(1);
   for(const p of paths.slice(1).filter(p=>p!=='artifacts/run/screen.png'))expect(readFileSync(join(root,p),'utf8')).toBe('fixture');
   expect(existsSync(join(root,'artifacts/run/screen.png'))).toBe(false);
   expect(readFileSync(join(review.archive,'artifacts/run/screen.png'),'utf8')).toBe('fixture');
   expect(review.count).toBe(1);
   // A fresh trace from the postbuild source tree cannot include this screenshot.
   expect(inspectProductionPackage(root).reviewScreenshotBytes).toBe(0);
   expect(JSON.parse(readFileSync(trace,'utf8')).files).not.toContain(relative(dirname(trace),join(root,'artifacts/run/screen.png')));
   expect(readFileSync(join(root,paths[0]),'utf8')).toContain('production PostgreSQL build only supports PostgreSQL');
   // Build archives are intentionally retained outside the build root for recovery.
   archive=result.backupDirectory;
  }finally{rmSync(root,{recursive:true,force:true});if(archive)rmSync(archive,{recursive:true,force:true});if(reviewArchive)rmSync(reviewArchive,{recursive:true,force:true});}
 });
 it('discounts review screenshots but still rejects oversized runtime assets at the original budget',()=>{
  const root=mkdtempSync(join(tmpdir(),'production-package-budget-'));
  try{
   const trace=join(root,'.next/server/middleware.js.nft.json');mkdirSync(dirname(trace),{recursive:true});
   for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
   for(const path of ['artifacts/review/screen.png','public/runtime.png']){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'');truncateSync(file,246_000_000);}
   writeFileSync(trace,JSON.stringify({version:1,files:[relative(dirname(trace),join(root,'artifacts/review/screen.png'))]}));
   expect(inspectProductionPackage(root)).toMatchObject({reviewScreenshotBytes:246_000_000,conservativeBytes:0,withinSafetyBudget:true});
   writeFileSync(trace,JSON.stringify({version:1,files:[relative(dirname(trace),join(root,'public/runtime.png'))]}));
   expect(inspectProductionPackage(root)).toMatchObject({reviewScreenshotBytes:0,conservativeBytes:246_000_000,withinSafetyBudget:false});
  }finally{rmSync(root,{recursive:true,force:true});}
 });
 it('keeps main auto-deploy disabled and disables only the invalid feature-branch auto-preview',()=>{
  const config=JSON.parse(readFileSync('vercel.json','utf8')).git.deploymentEnabled;
  expect(config.main).toBe(false);expect(config['content/marketing-beauty-addons-20261104']).toBe(false);
 });
 it('skips every non-production profile and refuses a forged local production command before touching files',()=>{
  const before=readFileSync('scripts/prune-referral-qa-trace.mjs','utf8');
  const preview=spawnSync(process.execPath,['scripts/production-postgres-packaging.mjs','--if-production'],{env:{NODE_ENV:"test",PATH:process.env.PATH,VERCEL_ENV:'preview'},encoding:'utf8'});
  expect(preview.status).toBe(0);expect(preview.stdout).toContain('skipped_non_production=true');
  const invalid=spawnSync(process.execPath,['scripts/production-postgres-packaging.mjs','--prune'],{env:{NODE_ENV:"test",PATH:process.env.PATH,...env},encoding:'utf8'});
  expect(invalid.status).not.toBe(0);expect(invalid.stderr).toContain('exact production main project');expect(readFileSync('scripts/prune-referral-qa-trace.mjs','utf8')).toBe(before);
  expect(JSON.parse(readFileSync('package.json','utf8')).scripts.postbuild).toContain('node scripts/production-postgres-packaging.mjs --if-production');
 });

 it('rejects runtime files, traversal and symlink sources before archiving review evidence',()=>{
  const root=mkdtempSync(join(tmpdir(),'production-image-scope-'));
  try{
   mkdirSync(join(root,'artifacts/run'),{recursive:true});mkdirSync(join(root,'public'),{recursive:true});
   writeFileSync(join(root,'public/logo.png'),'runtime');writeFileSync(join(root,'artifacts/run/screen.png'),'evidence');
   symlinkSync(join(root,'public/logo.png'),join(root,'artifacts/run/link.png'));
   for(const paths of [['public/logo.png'],['artifacts/run/../../public/logo.png'],['artifacts/run/screen.png','artifacts/run/link.png']])expect(()=>archiveProductionReviewImages(root,paths)).toThrow('scope mismatch');
   expect(readFileSync(join(root,'public/logo.png'),'utf8')).toBe('runtime');expect(readFileSync(join(root,'artifacts/run/screen.png'),'utf8')).toBe('evidence');
  }finally{rmSync(root,{recursive:true,force:true});}
 });

 it('early production archiving refuses a developer root without moving any file',()=>{
  const root=mkdtempSync(join(tmpdir(),'production-prebuild-scope-'));
  try{mkdirSync(join(root,'artifacts'),{recursive:true});writeFileSync(join(root,'artifacts/screen.png'),'evidence');
   expect(()=>archiveProductionReviewInputs(env,root)).toThrow('exact production main');
   expect(readFileSync(join(root,'artifacts/screen.png'),'utf8')).toBe('evidence');
  }finally{rmSync(root,{recursive:true,force:true});}
 });

});
