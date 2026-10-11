import {expect,it} from "vitest";
import {spawnSync} from "node:child_process";
import {assertReviewedReleaseEnvironment,TEACHER_OWN_INCOME_PREVIEW_BRANCH} from "../../scripts/consultation-preview-scope.mjs";
const isolated="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:TEACHER_OWN_INCOME_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:"",DATABASE_URL:isolated,DIRECT_URL:isolated};
it("allows only isolated review and skips migrations",()=>{
 expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
 const r=spawnSync(process.execPath,["scripts/ci-migrate.mjs"],{env:{...process.env,...env,GUIDE_UI_PREVIEW:"",PRODUCTION_MIGRATION_TARGET:"unapproved"},encoding:"utf8",timeout:10000});
 expect(r.status).toBe(0);expect(r.stdout).toContain("migrations_skipped=true");
});
it.each(["DATABASE_URL","DIRECT_URL"])("rejects a production %s",key=>{
 expect(()=>assertReviewedReleaseEnvironment({...env,[key]:"postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres"})).toThrow("existing isolated database");
});
it.each(["VERCEL","VERCEL_ENV","VERCEL_GIT_REPO_OWNER","VERCEL_GIT_REPO_SLUG","WORKERS_CI_BRANCH","CF_PAGES_BRANCH"])("rejects wrong %s provenance",key=>{
 expect(()=>assertReviewedReleaseEnvironment({...env,[key]:"wrong"})).toThrow();
});
