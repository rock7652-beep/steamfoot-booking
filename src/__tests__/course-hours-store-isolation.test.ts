import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),readManager:vi.fn(),transaction:vi.fn(),hours:vi.fn(),specials:vi.fn(),feature:vi.fn(),sessions:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{businessHours:{findMany:m.hours},specialBusinessDay:{findMany:m.specials},storeFeatureEntitlement:{findFirst:m.feature}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.readManager,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-duty",()=>({assertCourseDutyCoverage:vi.fn()}));
vi.mock("@/server/services/course-business-hours",async importOriginal=>({...await importOriginal<object>(),assertCourseSessionsFitHours:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidateBusinessHours:vi.fn(),revalidateSpecialDays:vi.fn()}));
vi.mock("next/cache",()=>({revalidateTag:vi.fn(),revalidatePath:vi.fn()}));
vi.mock("@/lib/error-logger",()=>({logError:vi.fn(),categorizeError:()=>"UNKNOWN"}));
import {getCourseDayHours,saveCourseDayHours} from "@/server/actions/course-business-hours";
const values={date:"2040-10-02",status:"custom",mode:"day",weeks:0,reason:"隔離驗證",periods:[{openTime:"09:00",closeTime:"17:00"}]};
beforeEach(()=>{
 vi.resetAllMocks();m.hours.mockResolvedValue([]);m.specials.mockResolvedValue([]);m.sessions.mockResolvedValue([]);
 m.transaction.mockImplementation(async(_store:string,work:(tx:unknown)=>Promise<unknown>)=>work({$executeRaw:m.execute,courseSession:{findMany:m.sessions}}));
});
it.each([{storeId:"sports-store",interval:60,music:false},{storeId:"music-store",interval:30,music:true}])("scopes $storeId reads and simulated mutations to its own store",async({storeId,interval,music})=>{
 m.manager.mockResolvedValue({storeId});m.readManager.mockResolvedValue({storeId});m.feature.mockResolvedValue(music?{id:"music"}:null);
 expect(await getCourseDayHours(values.date)).toMatchObject({slotInterval:interval});
 expect(m.hours).toHaveBeenCalledWith({where:{storeId}});expect(m.specials).toHaveBeenCalledWith({where:{storeId}});
 expect(await saveCourseDayHours(values)).toMatchObject({success:true});
 expect(m.transaction.mock.calls[0][0]).toBe(storeId);expect(m.sessions.mock.calls[0][0].where.storeId).toBe(storeId);
 expect(m.execute).toHaveBeenCalled();
 for(const [s,...params] of m.execute.mock.calls){
  const sql=(s as TemplateStringsArray).join("");expect(sql).not.toMatch(/Spa[A-Z]|Beauty[A-Z]|"Booking"/);expect(params).toContain(storeId);
 }
 expect(m.execute.mock.calls.some(([s,...params])=>(s as TemplateStringsArray).join("").includes('INSERT INTO "SpecialBusinessDay"')&&params.includes(interval))).toBe(true);
});
it("refuses a stale target store before any transaction",async()=>{
 m.manager.mockResolvedValue({storeId:"sports-store"});
 expect(await saveCourseDayHours({...values,receipt:{expectedStoreId:"music-store",requestKey:crypto.randomUUID(),expectedRevision:"0".repeat(64)}})).toMatchObject({success:false,error:expect.stringContaining("門市已切換")});
 expect(m.transaction).not.toHaveBeenCalled();
});
