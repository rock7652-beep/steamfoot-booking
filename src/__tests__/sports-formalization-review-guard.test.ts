import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
const branch="codex/sports-formalization-20261019";
it("keeps main and the integration branch out of automatic Vercel deployment",()=>{
 const config=JSON.parse(readFileSync("vercel.json","utf8"));
 expect(config.git.deploymentEnabled.main).toBe(false);
 expect(config.git.deploymentEnabled[branch]).toBe(false);
});
it.each(["VERCEL_GIT_COMMIT_REF","WORKERS_CI_BRANCH","CF_PAGES_BRANCH"])("rejects a %s build before Prisma construction or a migration subprocess",key=>{
 const tripwire="INTEGRATION_TEST_UNEXPECTED_DATABASE_OR_SUBPROCESS";
 const loader=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){const code=s==='@prisma/client'?\`export class PrismaClient {constructor(){throw new Error('${tripwire}')}}\`:s==='node:child_process'?\`export function execFileSync(){throw new Error('${tripwire}')}\`:null;return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(s,c);}});`;
 const run=spawnSync(process.execPath,["--import",`data:text/javascript,${encodeURIComponent(loader)}`,"scripts/ci-migrate.mjs"],{encoding:"utf8",timeout:10000,env:{...process.env,VERCEL_GIT_COMMIT_REF:"",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:"",[key]:branch,VERCEL_ENV:"production",PRODUCTION_MIGRATION_TARGET:"",DATABASE_URL:"",DIRECT_URL:""}});
 expect(run.error).toBeUndefined();expect(run.status).not.toBe(0);
 expect(run.stdout+run.stderr).toContain("Sports formalization review cannot deploy or execute migrations.");
 expect(run.stdout+run.stderr).not.toContain(tripwire);
});
