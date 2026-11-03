import {afterEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {sportsSeriesTable,assertSportsPermanentCreationAllowed} from "@/lib/sports-series-storage";
import {verifySportsPermanentReadiness,sportsPermanentReadinessSql} from "../../scripts/sports-permanent-readiness.mjs";
const prod={SPORTS_REDESIGN_PRODUCTION:"1",SPORTS_REDESIGN_STORE_IDS:"pilot",VERCEL:"1",VERCEL_ENV:"production",NODE_ENV:"production",VERCEL_GIT_COMMIT_REF:"main",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:"",SPORTS_REDESIGN_STAGING:"",SPORTS_REDESIGN_PREVIEW:"",SPORTS_LIVE_FLOW_QA:"",DATABASE_URL:"postgresql://postgres:unused@db.qijlnhtpbintanzpxkvf.supabase.co/postgres",DIRECT_URL:"postgresql://postgres:unused@db.qijlnhtpbintanzpxkvf.supabase.co/postgres"};
function env(overrides:Record<string,string|undefined>={}){for(const [key,value] of Object.entries({...prod,...overrides}))vi.stubEnv(key,value);}
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:vi.fn(async (_q:unknown,id:string)=>[{enabled:id!=="other"}])}}));
afterEach(()=>vi.unstubAllEnvs());
it("production is module-scoped and uses the formal table",async()=>{env();expect(await sportsNativePreview("pilot")).toBe(true);expect(await sportsNativePreview("other")).toBe(false);expect(sportsSeriesTable("pilot").sql).toBe('public."SportsScheduleSeries"');});
it("historical rollout settings cannot return an entitled store to legacy UI",async()=>{env({SPORTS_REDESIGN_PRODUCTION:"0"});expect(await sportsNativePreview("pilot")).toBe(true);env({SPORTS_REDESIGN_STORE_IDS:""});expect(await sportsNativePreview("pilot")).toBe(true);});
it.each([{VERCEL_GIT_COMMIT_REF:"other"},{DATABASE_URL:"postgresql://postgres:unused@db.ttworfzgwejdeolegkxl.supabase.co/postgres"},{SPORTS_REDESIGN_PREVIEW:"1"}])("malformed production provenance fails closed %j",async override=>{env(override);await expect(sportsNativePreview("pilot")).rejects.toThrow();});
it("preview storage never resolves a caller-controlled SQL identifier",()=>{env({SPORTS_REDESIGN_PRODUCTION:"0",VERCEL_ENV:"preview"});expect(sportsSeriesTable('x"; DROP TABLE x;--').sql).toBe('public."SportsPreviewScheduleSeries"');});
const ready={rls_enabled:true,version_matches:true,browser_blocked:true,app_can_use:true,columns_match:true,unique_request:true,application_role:"server_login"};
it("effective application-role readiness succeeds without writes",async()=>{const query=vi.fn().mockResolvedValue([ready]);await expect(verifySportsPermanentReadiness(query)).resolves.toEqual({ready:true,applicationRole:"server_login"});expect(query).toHaveBeenCalledWith(sportsPermanentReadinessSql);expect(sportsPermanentReadinessSql).not.toMatch(/\b(GRANT|ALTER|CREATE|INSERT|UPDATE|DELETE|DROP)\s+(TABLE|ON|INTO|FROM)/i);});
it.each(Object.keys(ready).filter(key=>key!=="application_role"))("missing readiness condition %s blocks activation",async key=>{await expect(verifySportsPermanentReadiness(vi.fn().mockResolvedValue([{...ready,[key]:false}]))).rejects.toThrow("尚未就緒");});
it("a missing relation or denied catalog query stays blocked",async()=>{await expect(verifySportsPermanentReadiness(vi.fn().mockResolvedValue([]))).rejects.toThrow();await expect(verifySportsPermanentReadiness(vi.fn().mockRejectedValue(new Error("denied")))).rejects.toThrow();});
it("candidate is additive, explicit-role-only and cannot replay test data",()=>{const sql=readFileSync("scripts/sql/sports-permanent-series-candidate.sql","utf8");expect(sql).toContain('CREATE TABLE public."SportsScheduleSeries"');expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS|\bLIKE\s+public|INSERT INTO|DROP TABLE|DISABLE ROW LEVEL SECURITY/);expect(sql).toContain("sports_migration.app_role");expect(sql).toContain("rolcanlogin");expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");expect(sql).toContain("GRANT SELECT, INSERT, UPDATE");expect(sql).not.toContain("GRANT ALL");});
it("review branch and main remain out of deployment",()=>{const config=JSON.parse(readFileSync("vercel.json","utf8"));expect(config.git.deploymentEnabled.main).toBe(false);expect(config.git.deploymentEnabled["codex/sports-formalization-20261019"]).toBe(false);});

it("creation pause preserves runtime access to existing series",async()=>{env({SPORTS_PERMANENT_CREATION_PAUSED:"1"});expect(()=>assertSportsPermanentCreationAllowed("pilot")).toThrow("暫停新增");expect(await sportsNativePreview("pilot")).toBe(true);expect(sportsSeriesTable("pilot").sql).toBe('public."SportsScheduleSeries"');expect(()=>assertSportsPermanentCreationAllowed("other")).toThrow("暫停新增");});

it("installed catalog pin uses the same expression in candidate and readiness",async()=>{const {sportsPermanentCatalogFingerprint}=await import("../../scripts/sports-permanent-readiness.mjs");const sql=readFileSync("scripts/sql/sports-permanent-series-candidate.sql","utf8");expect(sql).toContain(sportsPermanentCatalogFingerprint);expect(sportsPermanentReadinessSql).toContain(sportsPermanentCatalogFingerprint);});
it("formal series reads verify the actual connection before querying tenant rows",async()=>{
 env();const {readSportsSeries}=await import("@/server/services/sports-permanent-series");
 const tx={$queryRawUnsafe:vi.fn().mockResolvedValue([ready]),$queryRaw:vi.fn().mockResolvedValue([{storeId:"pilot"}])};
 await expect(readSportsSeries(tx as never,"pilot")).resolves.toEqual([{storeId:"pilot"}]);
 expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(sportsPermanentReadinessSql);
 expect(tx.$queryRaw).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({sql:'public."SportsScheduleSeries"'}),"pilot");
});
it("a denied application connection cannot read formal series or fall back to preview",async()=>{
 env();const {readSportsSeries}=await import("@/server/services/sports-permanent-series");
 const tx={$queryRawUnsafe:vi.fn().mockResolvedValue([{...ready,app_can_use:false}]),$queryRaw:vi.fn()};
 await expect(readSportsSeries(tx as never,"pilot")).rejects.toThrow("尚未就緒");expect(tx.$queryRaw).not.toHaveBeenCalled();
 await expect(readSportsSeries(tx as never,"other")).resolves.toEqual([]);expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
});
