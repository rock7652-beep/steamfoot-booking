import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {it,expect,vi,afterEach} from "vitest";
import {ANALYSIS_CUSTOMER_PREVIEW_BRANCH} from "../../scripts/sports-shared-card-preview-scope.mjs";
import {assertReviewedReleaseEnvironment} from "../../scripts/consultation-preview-scope.mjs";
import {TEACHING_PREVIEW_BRANCHES} from "../../scripts/teaching-preview-packaging.mjs";
import {isPreviewExternalIntegrationBlocked} from "@/lib/runtime-env";
const direct="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres?sslmode=require";
const valid={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR",VERCEL_GIT_COMMIT_REF:ANALYSIS_CUSTOMER_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:direct,DIRECT_URL:direct,WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:""};
afterEach(()=>vi.unstubAllEnvs());
it("uses the exact review branch, existing isolated database and packaging without changing production enablement",()=>{
 expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
 expect(TEACHING_PREVIEW_BRANCHES).toContain(ANALYSIS_CUSTOMER_PREVIEW_BRANCH);
 const enabled=JSON.parse(readFileSync("vercel.json","utf8")).git.deploymentEnabled;
 expect(enabled[ANALYSIS_CUSTOMER_PREVIEW_BRANCH]).not.toBe(false);expect(enabled.main).toBe(false);
 for(const [key,value] of Object.entries(valid))vi.stubEnv(key,value);
 expect(isPreviewExternalIntegrationBlocked()).toBe(true);
});
it.each([
 {VERCEL:""},{VERCEL_ENV:"production"},{VERCEL_PROJECT_ID:"other"},{VERCEL_GIT_REPO_OWNER:"other"},{VERCEL_GIT_REPO_SLUG:"other"},
 {WORKERS_CI_BRANCH:ANALYSIS_CUSTOMER_PREVIEW_BRANCH},{CF_PAGES_BRANCH:ANALYSIS_CUSTOMER_PREVIEW_BRANCH},{PRODUCTION_MIGRATION_TARGET:"must-not-run"},
 {DIRECT_URL:direct.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf")},{DATABASE_URL:direct+"&host=untrusted"},{DIRECT_URL:direct+"&schema=private"},
])("fails closed before a database client can be constructed: %j",patch=>{
 expect(()=>assertReviewedReleaseEnvironment({...valid,...patch})).toThrow();
});
it("cannot be redirected into a migration mode by unrelated preview opt-ins",()=>{
 expect(assertReviewedReleaseEnvironment({...valid,SPORTS_REDESIGN_PREVIEW:"1",BEAUTY_PRODUCTION_QA:"1"})).toBe("module-roster-preview");
});
it("exits the real migration dispatcher before database construction or subprocesses",()=>{
 const tripwire="ANALYSIS_CUSTOMER_PREVIEW_UNEXPECTED_DATABASE_OR_SUBPROCESS";
 const stub=`export class PrismaClient {constructor(){throw Error(${JSON.stringify(tripwire)})}}`;
 const processStub=`export function execFileSync(){throw Error(${JSON.stringify(tripwire)})}`;
 const preload=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){const x=s==='@prisma/client'?${JSON.stringify(stub)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return x?{url:'data:text/javascript,'+encodeURIComponent(x),shortCircuit:true}:n(s,c)}});`;
 const result=spawnSync(process.execPath,["--import",`data:text/javascript,${encodeURIComponent(preload)}`,"scripts/ci-migrate.mjs"],{env:{...process.env,...valid,PRODUCTION_MIGRATION_TARGET:""},encoding:"utf8",timeout:10_000});
 expect(result.error).toBeUndefined();expect(result.status).toBe(0);
 expect(result.stdout).toContain("[module-roster-preview] isolated_database=true notifications_blocked=true migrations_skipped=true");
 expect(result.stdout+result.stderr).not.toContain(tripwire);expect(result.stdout+result.stderr).not.toContain(direct);
});
