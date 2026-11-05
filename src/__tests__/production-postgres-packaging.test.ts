import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';import {tmpdir} from 'node:os';
import {assertProductionPackaging,inspectProductionPackage,pruneProductionNft,pruneProductionTraces} from '../../scripts/production-postgres-packaging.mjs';
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking'};
describe('production PostgreSQL packaging',()=>{
 it('requires genuine production-main scope and the platform build sandbox',()=>{
  expect(()=>assertProductionPackaging(env,'/vercel/path0')).not.toThrow();
  for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'prj_09HrzKOJ4Iu5LKouVry9VeXiC8LJ'},{VERCEL_GIT_COMMIT_REF:'content/marketing-beauty-addons-20261104'},{VERCEL_GIT_REPO_OWNER:'other'},{SUBSCRIPTION_REFERRAL_QA:'1'},{MARKETING_PUBLICATION_LOCAL_QA:'1'},{WORKERS_CI_BRANCH:'main'}])expect(()=>assertProductionPackaging({...env,...patch},'/vercel/path0')).toThrow();
  expect(()=>assertProductionPackaging(env,'/workspace/steamfoot-booking')).toThrow();
 });
 it('only removes known unused provider references, retaining docs, assets, QA scripts, native engines and certificates',()=>{
  const root=mkdtempSync(join(tmpdir(),'production-package-'));let archive='';
  try{
   const trace=join(root,'.next/server/middleware.js.nft.json');mkdirSync(dirname(trace),{recursive:true});
   for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
   const paths=['node_modules/@prisma/client/runtime/query_engine_bg.mysql.wasm-base64.js','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js','generated/course-client/engine.node','docs/runtime.md','artifacts/review.json','scripts/qa/review.mjs','scripts/certs/root.crt','public/image.png','src/lib/auth.ts'];
   for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
   writeFileSync(trace,JSON.stringify({version:1,files:paths.map(p=>relative(dirname(trace),join(root,p)))}));writeFileSync(join(root,'.next/BUILD_ID'),'synthetic');
   const before=readFileSync(trace,'utf8'),plan=inspectProductionPackage(root);expect(plan.unusedEngines).toHaveLength(1);expect(plan.filesModified).toBe(false);expect(readFileSync(trace,'utf8')).toBe(before);
   expect(pruneProductionNft(trace,root)).toBe(1);expect(JSON.parse(readFileSync(trace,'utf8')).files).toHaveLength(paths.length-1);
   // Restore the trace so the entire production artifact operation is exercised.
   writeFileSync(trace,before);const result=pruneProductionTraces(root);expect(result.unusedProviderStubs).toHaveLength(1);
   for(const p of paths.slice(1))expect(readFileSync(join(root,p),'utf8')).toBe('fixture');
   expect(readFileSync(join(root,paths[0]),'utf8')).toContain('production PostgreSQL build only supports PostgreSQL');
   // Build archives are intentionally retained outside the build root for recovery.
   archive=result.backupDirectory;
  }finally{rmSync(root,{recursive:true,force:true});if(archive)rmSync(archive,{recursive:true,force:true});}
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

});
