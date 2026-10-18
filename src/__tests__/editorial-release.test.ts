import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import articles from "@/content/editorial-guides.json";
import { isEditorialUiPreview } from "../../scripts/editorial-preview-scope.mjs";
import { isGuideUiPreview } from "../../scripts/guide-ui-preview-scope.mjs";
import { parseEditorialGuides } from "../../scripts/editorial-content.mjs";
import { validateEditorialChange, verifyEditorialGit } from "../../scripts/editorial-release-preflight.mjs";
const head="1".repeat(40), base="2".repeat(40);
const safe={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",VERCEL_GIT_COMMIT_REF:"content/editorial-preview",VERCEL_GIT_COMMIT_SHA:head,EDITORIAL_PREVIEW_APPROVED_COMMIT:head,EDITORIAL_PREVIEW_BASE_COMMIT:base};
const change={base,head,repository:"rock7652-beep/steamfoot-booking",branch:"content/editorial-preview",slug:articles[0].id,files:["src/content/editorial-guides.json"],before:[],after:articles};

describe("fixed editorial release boundary",()=>{
 it("requires an explicitly pinned preview while preserving production and unrelated branches",()=>{
  expect(isGuideUiPreview({...safe,DATABASE_URL:"",DIRECT_URL:""})).toBe(true);
  expect(isEditorialUiPreview({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main"})).toBe(false);
  expect(isEditorialUiPreview({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"content/another-article"})).toBe(false);
  expect(()=>isEditorialUiPreview({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"content/editorial-preview"})).toThrow(/isolation rejected/);
 });
 it.each(Object.keys(safe))("rejects missing %s",key=>{
  expect(()=>isEditorialUiPreview({...safe,[key]:undefined})).toThrow(/isolation rejected/);
 });
 it.each([
  ["VERCEL_ENV","production"],["VERCEL_GIT_REPO_OWNER","other"],["VERCEL_GIT_REPO_SLUG","other"],
  ["VERCEL_GIT_COMMIT_REF","main"],["VERCEL_GIT_COMMIT_SHA","3".repeat(40)],
  ["EDITORIAL_PREVIEW_APPROVED_COMMIT","1bcce0f"],["EDITORIAL_PREVIEW_BASE_COMMIT",head],
  ["WORKERS_CI_BRANCH","content/editorial-preview"],["CF_PAGES_BRANCH","main"],["GUIDE_UI_PREVIEW","1"],
 ])("rejects conflicting %s",(key,value)=>expect(()=>isEditorialUiPreview({...safe,[key]:value})).toThrow(/isolation rejected/));
 it("skips migrations before DB work and keeps Git auto-deployment disabled",()=>{
  const result=spawnSync(process.execPath,["scripts/ci-migrate.mjs"],{env:{...process.env,...safe,DATABASE_URL:"",DIRECT_URL:"",PRODUCTION_MIGRATION_TARGET:"not-approved"},encoding:"utf8",timeout:15000});
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("database_disabled=true migrations_skipped=true");
  const deployment=JSON.parse(readFileSync("vercel.json","utf8")).git.deploymentEnabled;
  expect(deployment["content/editorial-preview"]).toBe(false);expect(deployment.main).toBe(false);
 });
 it("accepts one JSON article and rejects scope expansion or changes to another article",()=>{
  expect(validateEditorialChange(change)).toMatchObject({head,base,mode:"article-only",slug:articles[0].id});
  for(const path of ["src/lib/auth.ts","prisma/schema.prisma","vercel.json","scripts/editorial-preview-scope.mjs",".github/workflows/editorial-review.yml"])
   expect(()=>validateEditorialChange({...change,files:[...change.files,path]})).toThrow(/outside/);
  const other={...articles[0],id:"unrelated-approved-article"};
  expect(()=>validateEditorialChange({...change,before:[other]})).toThrow(/unrelated/);
  expect(()=>validateEditorialChange({...change,branch:"content/anything"})).toThrow(/exact/);
  expect(()=>validateEditorialChange({...change,repository:"other/repo"})).toThrow(/exact/);
  expect(()=>validateEditorialChange({...change,bootstrap:true})).toThrow(/bootstrap/);
 });
 it("allows bootstrap only at the fixed original base and still rejects unrelated files",()=>{
  expect(validateEditorialChange({...change,bootstrap:true,base:"7ddfeed6b8b0611b1669df067c4580e5b9481323",files:[...change.files,"vercel.json"]}).mode).toBe("one-time-bootstrap-review");
  expect(()=>validateEditorialChange({...change,bootstrap:true,base:"7ddfeed6b8b0611b1669df067c4580e5b9481323",files:[...change.files,"src/lib/auth.ts"]})).toThrow(/outside/);
 });
 it("checks real git ancestry, a clean exact head and rejects symlink content",()=>{
  const cwd=mkdtempSync(join(tmpdir(),"editorial-git-test-"));
  const git=(...args:string[])=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
  try {
   git("init","-q");git("config","user.name","Editorial test");git("config","user.email","test@example.invalid");
   mkdirSync(join(cwd,"src/content"),{recursive:true});mkdirSync(join(cwd,"src/lib"),{recursive:true});
   writeFileSync(join(cwd,"src/content/editorial-guides.json"),"[]");writeFileSync(join(cwd,"src/lib/public-guides.ts"),'const legacy = [{"id":"legacy-only"}];');
   git("add",".");git("commit","-qm","base");const actualBase=git("rev-parse","HEAD");
   writeFileSync(join(cwd,"src/content/editorial-guides.json"),JSON.stringify(articles));git("add",".");git("commit","-qm","article");
   const actualHead=git("rev-parse","HEAD"),args={...change,base:actualBase,head:actualHead};
   expect(verifyEditorialGit(args,cwd)).toMatchObject({head:actualHead,base:actualBase});
   writeFileSync(join(cwd,"src/lib/public-guides.ts"),"dirty");
   expect(()=>verifyEditorialGit(args,cwd)).toThrow(/clean/);
   git("restore","src/lib/public-guides.ts");
   expect(()=>verifyEditorialGit({...args,head:actualBase},cwd)).toThrow(/exact/);
   unlinkSync(join(cwd,"src/content/editorial-guides.json"));symlinkSync("../lib/public-guides.ts",join(cwd,"src/content/editorial-guides.json"));
   git("add",".");git("commit","-qm","bad symlink");
   expect(()=>verifyEditorialGit({...args,head:git("rev-parse","HEAD")},cwd)).toThrow(/symlinks/);
  } finally { rmSync(cwd,{recursive:true,force:true}); }
 });
 it("rejects executable fields, external links, duplicate IDs and invalid metadata",()=>{
  expect(parseEditorialGuides(articles)).toEqual(articles);
  for(const field of [{script:"alert(1)"},{id:123},{publishedDate:"2026-02-30"},{category:"private"},{featureUrl:"https://evil.example/"},{featureUrl:"//evil.example/apply"}])
   expect(()=>parseEditorialGuides([{...articles[0],...field}])).toThrow(/Invalid editorial/);
  expect(()=>parseEditorialGuides([articles[0],articles[0]])).toThrow(/Invalid editorial/);
  expect(()=>parseEditorialGuides([{...articles[0],callToAction:{text:"",inlineParts:[{label:"x",href:"javascript:alert(1)"}]}}])).toThrow(/Invalid editorial/);
 });
});
