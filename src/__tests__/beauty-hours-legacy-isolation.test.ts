import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),industry:vi.fn(),transaction:vi.fn(),read:vi.fn(),execute:vi.fn(),cache:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.industry}));
vi.mock("@/lib/revalidation",()=>({revalidateBusinessHoursInRoute:m.cache}));
vi.mock("@/lib/error-logger",()=>({logError:vi.fn(),categorizeError:()=>"UNKNOWN"}));
import {saveServiceHours} from "@/server/services/service-hours-save";
import {loadServiceHoursForSettings} from "@/server/services/service-hours-read";
import {serviceHoursRevision} from "@/server/services/service-hours-state";
const hours=Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,isOpen:true,openTime:"09:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6,segments:null}));
const values={date:"2040-10-02",status:"closed",mode:"dates",targetDates:["2040-11-03"],weeks:0,reason:"調整",periods:[]};
const input=()=>({expectedStoreId:"beauty",expectedRevision:serviceHoursRevision({hours,specials:[],overrides:[]}),requestKey:crypto.randomUUID(),values});
beforeEach(()=>{
 vi.resetAllMocks();m.permission.mockResolvedValue({id:"owner"});m.store.mockResolvedValue("beauty");m.industry.mockResolvedValue("beauty");
 m.read.mockImplementation(async(strings:TemplateStringsArray)=>{const sql=strings.join("");if(sql.includes('FROM "BusinessHours"'))return hours;if(sql.includes('FROM "BeautyAppointment"')||sql.includes('FROM "Booking"'))return [{bookingDate:new Date("2040-11-03T00:00:00Z"),startTime:"10:00",endTime:"11:00",people:1}];return [];});
 m.transaction.mockImplementation(async(work:(tx:unknown)=>Promise<unknown>)=>work({$queryRaw:m.read,$executeRaw:m.execute}));
});
it("checks BeautyAppointment and rejects a conflicting selected date before data writes",async()=>{
 expect(await saveServiceHours(input())).toMatchObject({success:false,error:expect.stringContaining("已有預約")});
 const sql=m.read.mock.calls.map(([s]:[TemplateStringsArray])=>s.join("")).join("\n");
 expect(sql).toContain('FROM "BeautyAppointment"');expect(sql).not.toMatch(/SpaBooking|FROM "Booking"/);
 expect(m.execute.mock.calls.some(([s]:[TemplateStringsArray])=>/\b(INSERT|DELETE|UPDATE)\b/.test(s.join("")))).toBe(false);
});
it("reads Beauty shared hours through the supported client without any SPA model",async()=>{
 expect((await loadServiceHoursForSettings("beauty","2040-10-02")).day.status).toBe("open");
 expect(m.read.mock.calls.map(([s]:[TemplateStringsArray])=>s.join("")).join("\n")).not.toMatch(/Spa[A-Z]/);
});
it("Steamfoot conflict checks use only its own Booking table",async()=>{
 m.industry.mockResolvedValue("steamfoot");expect(await saveServiceHours(input())).toMatchObject({success:false,error:expect.stringContaining("已有預約")});
 const sql=m.read.mock.calls.map(([s]:[TemplateStringsArray])=>s.join("")).join("\n");expect(sql).toContain('FROM "Booking"');expect(sql).not.toMatch(/BeautyAppointment|SpaBooking/);
});
it("rejects legacy SPA reads and writes before opening a transaction",async()=>{
 m.industry.mockResolvedValue("spa");expect(await saveServiceHours(input())).toMatchObject({success:false});
 await expect(loadServiceHoursForSettings("beauty","2040-10-02")).rejects.toThrow("此模組已移除");expect(m.transaction).not.toHaveBeenCalled();
});
it.each(["beauty","steamfoot"])("binds every simulated %s hours mutation to its authorized store",async industry=>{
 m.industry.mockResolvedValue(industry);
 m.read.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes('FROM "BusinessHours"')?hours:[]);
 expect(await saveServiceHours(input())).toMatchObject({success:true,storeId:"beauty",data:{count:1}});
 const mutations=m.execute.mock.calls.filter(([s]:[TemplateStringsArray])=>/\b(INSERT|DELETE|UPDATE)\b/.test(s.join("")));
 expect(mutations.length).toBeGreaterThan(0);
 for(const [s,...params] of mutations){
  const sql=(s as TemplateStringsArray).join("");
  expect(sql).toMatch(/SpecialBusinessDay|SlotOverride|AuditLog/);expect(sql).not.toMatch(/Spa[A-Z]|BeautyAppointment|FROM "Booking"/);
  expect(params).toContain("beauty");
 }
});
it("rejects a store switch before any transaction",async()=>{
 m.store.mockResolvedValue("different-store");expect(await saveServiceHours(input())).toMatchObject({success:false,error:expect.stringContaining("門市已切換")});expect(m.transaction).not.toHaveBeenCalled();
});
