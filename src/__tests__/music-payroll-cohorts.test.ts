import { afterEach, expect, it, vi } from "vitest";
import { separateMusicPayroll, LEGACY_PAYROLL_SESSION_IDS } from "@/server/services/music-payroll-cohorts";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import { readCourseMonthlySettlement } from "@/server/services/course-monthly-settlement";
import { confirmCourseMonth } from "@/server/services/confirm-course-month";
import type { Prisma } from "../../generated/course-client";
const preview = { VERCEL:"1", VERCEL_ENV:"preview", VERCEL_GIT_COMMIT_REF:"feat/music-opening-state-20261007", VERCEL_GIT_REPO_OWNER:"rock7652-beep", VERCEL_GIT_REPO_SLUG:"steamfoot-booking", DATABASE_URL:"postgresql://postgres:dummy@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres", DIRECT_URL:"postgresql://postgres:dummy@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres" };
const line=(id:string,kind:SettlementLine["kind"]="FEE"):SettlementLine=>({id,kind,staffId:"teacher",name:"老師",label:"課程",date:"2026-10-01T00:00:00Z",amount:null,paid:0,issue:"待核對",payments:[]});
const legacy=[...LEGACY_PAYROLL_SESSION_IDS];
afterEach(()=>vi.unstubAllEnvs());
it("isolates exactly the 21 audited fees, retaining unknown and imported liabilities",()=>{
 const other=[line("yjy-pilot-session:source"),line("qa-new-unreviewed"),line(legacy[0],"PROFIT")];
 const result=separateMusicPayroll("store-lubymusic",[...legacy.map(id=>line(id)),...other],preview);
 expect(result.legacyTestLines).toHaveLength(21);expect(result.lines).toEqual(other);expect(result.lines.every(l=>l.amount===null)).toBe(true);
});
it.each([{VERCEL_ENV:"production"},{VERCEL:"0"},{VERCEL_GIT_COMMIT_REF:"main"},{DIRECT_URL:"postgresql://postgres:dummy@db.other.supabase.co/postgres"},{WORKERS_CI_BRANCH:"test"}])("does not change payroll outside exact Preview: %j",override=>{
 const result=separateMusicPayroll("store-lubymusic",[line(legacy[0])],{...preview,...override});expect(result.separationEnabled).toBe(false);expect(result.lines).toHaveLength(1);
});
it("never applies the allowlist to another store",()=>expect(separateMusicPayroll("other",[line(legacy[0])],preview).lines).toHaveLength(1));
it("monthly fingerprint and confirmed snapshot use operational rows; legacy-only month cannot be confirmed",async()=>{
 for(const [key,value] of Object.entries(preview))vi.stubEnv(key,value);
 vi.stubEnv("WORKERS_CI_BRANCH","");vi.stubEnv("CF_PAGES_BRANCH","");
 let ids=[legacy[0],"music-luby-s-0921-1800-a","source-real"];
 const execute=vi.fn();
 const tx={$executeRaw:execute,coursePurchase:{findMany:vi.fn().mockResolvedValue([])},$queryRaw:vi.fn(async(strings:TemplateStringsArray & {sql?:string})=>{
  if((strings.sql??strings.join("")).includes('FROM "CourseSession" s LEFT JOIN'))return ids.map(id=>({id,staffId:"teacher",name:id,startsAt:new Date("2026-01-01"),endsAt:new Date("2026-01-02"),cancelledAt:null,teacherAttendance:"ATTENDED",rule:{mode:"CLASS",value:400},revision:1}));
  return [];
 })} as unknown as Prisma.TransactionClient;
 const report=await readCourseMonthlySettlement(tx,"store-lubymusic","2026-01");expect(report.lines.map(l=>l.id)).toEqual(["source-real"]);expect(report.legacyTestLines).toHaveLength(2);
 ids=["source-real"];expect((await readCourseMonthlySettlement(tx,"store-lubymusic","2026-01")).fingerprint).toBe(report.fingerprint);
 await confirmCourseMonth(tx,{storeId:"store-lubymusic",userId:"owner"},{month:"2026-01",fingerprint:report.fingerprint,revision:0,reason:"測試確認"});
 const saved=execute.mock.calls[0].find((value:unknown)=>typeof value==="string"&&value.startsWith("[{"));expect(JSON.parse(saved).map((l:SettlementLine)=>l.id)).toEqual(["source-real"]);
 ids=[legacy[0]];const empty=await readCourseMonthlySettlement(tx,"store-lubymusic","2026-01");await expect(confirmCourseMonth(tx,{storeId:"store-lubymusic",userId:"owner"},{month:"2026-01",fingerprint:empty.fingerprint,revision:0,reason:"測試確認"})).rejects.toThrow("沒有結算項目");expect(execute).toHaveBeenCalledTimes(1);
});
