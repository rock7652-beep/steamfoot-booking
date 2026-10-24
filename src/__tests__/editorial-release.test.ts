import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import articles from "@/content/editorial-guides.json";
import { isEditorialUiPreview } from "../../scripts/editorial-preview-scope.mjs";
import { isGuideUiPreview } from "../../scripts/guide-ui-preview-scope.mjs";
import { parseEditorialGuides } from "../../scripts/editorial-content.mjs";
import { validateEditorialChange, verifyEditorialGit } from "../../scripts/editorial-release-preflight.mjs";
const head="1".repeat(40), base="2".repeat(40);
const safe={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",VERCEL_GIT_COMMIT_REF:"content/editorial-preview",VERCEL_GIT_COMMIT_SHA:head,EDITORIAL_PREVIEW_APPROVED_COMMIT:head,EDITORIAL_PREVIEW_BASE_COMMIT:base};
const change={base,head,repository:"rock7652-beep/steamfoot-booking",branch:"content/editorial-preview",slug:articles[0].id,files:["src/content/editorial-guides.json"],before:[],after:[articles[0]]};

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
  expect(()=>validateEditorialChange({...change,bootstrap:true})).toThrow(/retired/);
 });
 it.each([
  {bootstrap:true,base:"7ddfeed6b8b0611b1669df067c4580e5b9481323"},
  {inlineLinksReview:true,base:"8d717d5dc45da6fbd4e2984afea48165140281b3"},
 ])("rejects retired exceptions even at their original bases",exception=>{
  expect(()=>validateEditorialChange({...change,...exception})).toThrow(/retired/);
 });
 it.each(["--bootstrap","--inline-links-review"])("rejects retired CLI flag %s",flag=>{
  const result=spawnSync(process.execPath,["scripts/editorial-release-preflight.mjs",flag],{encoding:"utf8"});
  expect(result.status).toBe(1);expect(result.stderr).toContain("unknown argument");
 });
 it("checks real git ancestry, a clean exact head and rejects symlink content",()=>{
  const cwd=mkdtempSync(join(tmpdir(),"editorial-git-test-"));
  const git=(...args:string[])=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
  try {
   git("init","-q");git("config","user.name","Editorial test");git("config","user.email","test@example.invalid");
   mkdirSync(join(cwd,"src/content"),{recursive:true});mkdirSync(join(cwd,"src/lib"),{recursive:true});
   writeFileSync(join(cwd,"src/content/editorial-guides.json"),"[]");writeFileSync(join(cwd,"src/lib/public-guides.ts"),'const legacy = [{"id":"legacy-only"}];');
   git("add",".");git("commit","-qm","base");const actualBase=git("rev-parse","HEAD");
   writeFileSync(join(cwd,"src/content/editorial-guides.json"),JSON.stringify([articles[0]]));git("add",".");git("commit","-qm","article");
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
 it("loads the complete policy import closure from base",()=>{
  const workflow=readFileSync(".github/workflows/editorial-review.yml","utf8");
  const files=workflow.match(/for file in (.+); do/)![1].split(" ");
  const visited=new Set<string>();
  const visit=(file:string)=>{
   if(visited.has(file))return;visited.add(file);
   const source=readFileSync(join("scripts",file),"utf8");
   for(const match of source.matchAll(/from ["']\.\/([^"']+)["']/g))visit(match[1]);
  };
  visit("editorial-release-preflight.mjs");
  expect(files.sort()).toEqual([...visited].sort());
  expect(workflow).not.toMatch(/bootstrap|inline-links-review|cp scripts\//);
 });
 it.each([
  "valid", "candidate-preflight", "candidate-content", "candidate-scope", "outside-file",
  "missing-editorial-release-preflight.mjs", "missing-editorial-content.mjs", "missing-editorial-preview-scope.mjs", "missing-content",
 ])("executes the workflow scope block safely: %s",scenario=>{
  const cwd=mkdtempSync(join(tmpdir(),"editorial-policy-test-"));
  const git=(...args:string[])=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
  const policy=["editorial-release-preflight.mjs","editorial-content.mjs","editorial-preview-scope.mjs"];
  const write=(path:string,value:string)=>{mkdirSync(dirname(join(cwd,path)),{recursive:true});writeFileSync(join(cwd,path),value);};
  const workflow=readFileSync(".github/workflows/editorial-review.yml","utf8");
  const block=workflow.split("        run: |\n")[1].split("      - uses:")[0].split("\n").map(line=>line.replace(/^          /,"")).join("\n");
  try {
   git("init","-q");git("config","user.name","Editorial test");git("config","user.email","test@example.invalid");
   for(const file of policy)if(scenario!==`missing-${file}`)write(`scripts/${file}`,readFileSync(`scripts/${file}`,"utf8"));
   if(scenario!=="missing-content")write("src/content/editorial-guides.json","[]");
   write("src/lib/public-guides.ts",'const legacy = [{"id":"legacy-only"}];');
   git("add",".");git("commit","-qm","trusted base");const actualBase=git("rev-parse","HEAD");
   write("src/content/editorial-guides.json",JSON.stringify([articles[0]]));
   const replacements:Record<string,string>={"candidate-preflight":policy[0],"candidate-content":policy[1],"candidate-scope":policy[2]};
   if(replacements[scenario])write(`scripts/${replacements[scenario]}`,'throw new Error("CANDIDATE_POLICY_EXECUTED");');
   // Missing trusted files must never fall back to even a harmless candidate file.
   for(const file of policy)if(scenario===`missing-${file}`)write(`scripts/${file}`,'throw new Error("CANDIDATE_POLICY_EXECUTED");');
   if(scenario==="outside-file"||replacements[scenario])write("outside.txt","safe fixture only");
   git("add",".");git("commit","-qm","candidate data");const actualHead=git("rev-parse","HEAD");
   const result=spawnSync("bash",["-c",block],{cwd,encoding:"utf8",timeout:15000,env:{...process.env,PATH:`${dirname(process.execPath)}:${process.env.PATH}`,BASE_SHA:actualBase,HEAD_SHA:actualHead,HEAD_BRANCH:change.branch,HEAD_REPOSITORY:change.repository}});
   expect(result.error).toBeUndefined();
   expect(result.stderr).not.toContain("CANDIDATE_POLICY_EXECUTED");
   if(scenario==="valid"){
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({base:actualBase,head:actualHead,mode:"article-only"});
   }else{
    expect(result.status).not.toBe(0);
    if(scenario.startsWith("candidate-")||scenario==="outside-file")expect(result.stderr).toContain("outside the article data scope");
    else expect(result.stderr).toMatch(/fatal: path .+ (?:does not exist|exists on disk, but not in)/);
   }
  }finally{rmSync(cwd,{recursive:true,force:true});}
 });
 it("supports plain body paragraphs and safe inline links, rejecting executable shapes and schemes",()=>{
  const make=(paragraph:unknown)=>[{...articles[0],sections:[{heading:"Body",paragraphs:[paragraph]}]}];
  for(const href of ["/guides/example#details","https://www.steamfoot.com/pricing/features","https://example.org/reference?q=one#two"])
   expect(()=>parseEditorialGuides(make({inlineParts:["Before ",{label:"reference",href}," after"]}))).not.toThrow();
  expect(()=>parseEditorialGuides(make("Old plain paragraph"))).not.toThrow();
  for(const href of ["javascript:alert(1)","data:text/html,test","http://example.org","//example.org","/\\example.org","https://user:pass@example.org/","https://example.org/%0a","https://example.org/ a"])
   expect(()=>parseEditorialGuides(make({inlineParts:[{label:"unsafe",href}]}))).toThrow();
  for(const paragraph of [{html:"<b>text</b>"},{inlineParts:[]},{inlineParts:[{label:"bad",href:"/guides",onClick:"alert(1)"}]},{inlineParts:[{html:"<img onerror=alert(1)>"}]}])
   expect(()=>parseEditorialGuides(make(paragraph))).toThrow();
 });
 it("rejects executable fields, external links, duplicate IDs and invalid metadata",()=>{
  expect(parseEditorialGuides(articles)).toEqual(articles);
  for(const field of [{script:"alert(1)"},{id:123},{publishedDate:"2026-02-30"},{category:"private"},{featureUrl:"https://evil.example/"},{featureUrl:"//evil.example/apply"}])
   expect(()=>parseEditorialGuides([{...articles[0],...field}])).toThrow(/Invalid editorial/);
  expect(()=>parseEditorialGuides([articles[0],articles[0]])).toThrow(/Invalid editorial/);
  expect(()=>parseEditorialGuides([{...articles[0],callToAction:{text:"",inlineParts:[{label:"x",href:"javascript:alert(1)"}]}}])).toThrow(/Invalid editorial/);
 });
});

