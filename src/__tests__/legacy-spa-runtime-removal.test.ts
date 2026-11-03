import {existsSync,readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
import {expect,it} from "vitest";
import {getIndustryModule,toPersistedIndustryModule} from "@/lib/industry-modules";
import {isRetiredModuleRoute} from "@/lib/retired-module-routes";
function files(root:string):string[]{return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(root,e.name)):[join(root,e.name)]);}
const runtime=files("src").filter(p=>/\.tsx?$/.test(p)&&!p.includes("/__tests__/")&&!p.endsWith(".test.ts"));
it("contains no runtime import of the legacy client or deleted SPA modules",()=>{
 const references=runtime.flatMap(file=>{
  const source=readFileSync(file,"utf8");
  return [...source.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)]
   .filter(m=>/spa-client|(?:^|\/)spa(?:-|\/|$)/.test(m[1])).map(m=>({file,module:m[1]}));
 });
 expect(references).toEqual([]);
});
it("contains no live SQL read or write against legacy SPA tables",()=>{
 const references=runtime.filter(file=>/\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+"Spa[A-Z]/i.test(readFileSync(file,"utf8")));
 expect(references).toEqual([]);
});
it("does not generate or ship a legacy Prisma client or SPA API route",()=>{
 expect(JSON.parse(readFileSync("package.json","utf8")).scripts["generate:clients"]).not.toContain("spa-prisma");
 for(const path of ["spa-prisma/schema.prisma","src/lib/spa-db.ts","src/app/api/spa","src/app/api/cron/spa-demo-reminders","src/app/(dashboard)/dashboard/spa-schedule"]){
  expect(existsSync(path)?files(path).filter(file=>/\.(ts|tsx)$/.test(file)):[],path).toEqual([]);
 }
});
it.each(["/api/spa/settings/staff","/api/cron/spa-demo-reminders","/dashboard/spa-schedule","/liff/spa-work","/liff/manager-preview","/liff/staff-preview"] )("rejects legacy URLs including scoped forms: %s",path=>{
 for(const prefix of ["","/s/old-store/admin"]){expect(isRetiredModuleRoute(prefix+path,new URLSearchParams())).toBe(true);}
});
it("refuses to resolve or provision a retired module as an active one",()=>{
 expect(()=>getIndustryModule("spa")).toThrow("SPA 模組已移除");
 expect(()=>toPersistedIndustryModule("spa")).toThrow("SPA 模組已移除");
 expect(getIndustryModule("steamfoot").id).toBe("steamfoot");expect(getIndustryModule("course").id).toBe("course");
});

it("removes the old SPA production migration target and reconciliation runner",()=>{
 const source=readFileSync("scripts/ci-migrate.mjs","utf8");
 const allowlist=source.match(/APPROVED_PRODUCTION_MIGRATION_TARGETS = \[([\s\S]*?)\];/)?.[1];
 expect(allowlist).toBeDefined();expect(allowlist).not.toContain("SPA_MEMBER_STAFF_RELEASE_TARGET");
 expect(source).not.toMatch(/runSpaMemberStaffRelease|prepareSpaProductionHistory|spa-production-migration-readiness/);
});
it("preserves the independent BEAUTY module and generated client while excluding SPA from deployment inputs",()=>{
 expect(getIndustryModule("beauty")).toMatchObject({id:"beauty",booking:{resourceModel:"provider_availability"}});
 expect(toPersistedIndustryModule("beauty")).toBe("BEAUTY");
 const scripts=JSON.parse(readFileSync("package.json","utf8")).scripts;
 expect(scripts["generate:clients"]).toContain("beauty-prisma/schema.prisma");
 const runtime=readFileSync("src/lib/generated-prisma-runtime.ts","utf8");
 expect(runtime).toContain("loadBeautyPrismaRuntime");expect(runtime).toContain("loadCoursePrismaRuntime");expect(runtime).not.toMatch(/loadSpaPrismaRuntime|spa-client/);
 expect(readFileSync("next.config.ts","utf8")).toContain("./generated/beauty-client/**");
 expect(readFileSync("next.config.ts","utf8")).not.toContain("spa-client");
 expect(readFileSync("tsconfig.json","utf8")).not.toContain("@spa-client");
});
it("keeps the retirement review branches out of automatic deployment",()=>{
 const disabled=JSON.parse(readFileSync("vercel.json","utf8")).git.deploymentEnabled;
 expect(disabled["fix/beauty-retire-spa-runtime"]).toBe(false);
 expect(disabled["fix/remove-legacy-spa"]).toBe(false);
});

it("does not leave legacy preview page shells without a default route export",()=>{
 for(const path of ["src/app/(liff)/liff/manager-preview/page.tsx","src/app/(liff)/liff/staff-preview/page.tsx"])expect(existsSync(path),path).toBe(false);
});
