import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),manager:vi.fn(),transaction:vi.fn(),read:vi.fn(),update:vi.fn(),create:vi.fn(),raw:vi.fn(),cache:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/lib/revalidation",()=>({revalidateDutySchedulingInRoute:m.cache}));
import {saveDutySettings} from "@/server/services/duty-settings-save";
let current:{dutySchedulingEnabled:boolean;updatedAt:Date}|null;
const input={enabled:true,expectedEnabled:false,expectedStoreId:"s",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
beforeEach(()=>{
 vi.resetAllMocks();current={dutySchedulingEnabled:false,updatedAt:new Date("2026-10-10T00:00:00Z")};
 m.permission.mockResolvedValue({id:"u",role:"OWNER"});m.store.mockResolvedValue("s");m.module.mockResolvedValue("course");m.manager.mockResolvedValue({storeId:"s"});
 m.read.mockImplementation(async()=>current);m.update.mockImplementation(async({data})=>{current={...current!,...data};return {count:1};});m.create.mockImplementation(async({data})=>{current={...data,updatedAt:new Date()};return current;});
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes("ShopConfig")?[current]:[]);
 m.transaction.mockImplementation(async work=>{const before=current;try{return await work({$queryRaw:m.raw,shopConfig:{findUnique:m.read,findUniqueOrThrow:m.read,updateMany:m.update,create:m.create}});}catch(error){current=before;throw error;}});
});
it("uses the guarded course transaction and confirms retries without repeating writes",async()=>{
 expect(await saveDutySettings(input)).toMatchObject({success:true,storeId:"s",data:{enabled:true}});
 expect(m.manager).toHaveBeenCalledWith("duty.manage");expect(m.raw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
 expect(await saveDutySettings(input)).toMatchObject({success:true,data:{enabled:true}});expect(m.update).toHaveBeenCalledTimes(1);expect(m.update.mock.calls[0][0].where).toEqual({storeId:"s",updatedAt:new Date("2026-10-10T00:00:00Z")});
});
it("rolls back enabling integration when a teacher lacks duty coverage",async()=>{
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>{const sql=strings.join("");if(sql.includes("ShopConfig"))return [current];if(sql.includes("CourseSession"))return [{startsAt:new Date("2030-10-01T10:00:00+08:00"),endsAt:new Date("2030-10-01T11:00:00+08:00"),coachId:"teacher",nameSnapshot:"吉他"}];return [];});
 expect(await saveDutySettings(input)).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("值班未涵蓋")});expect(current?.dutySchedulingEnabled).toBe(false);expect(m.cache).not.toHaveBeenCalled();
});
it("rejects switched stores and permission failures before any transaction",async()=>{
 expect(await saveDutySettings({...input,expectedStoreId:"other"})).toMatchObject({success:false,uncertain:false});expect(m.transaction).not.toHaveBeenCalled();
 m.permission.mockRejectedValue(new Error("denied"));expect(await saveDutySettings(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("keeps legacy store toggles transactional without invoking course coverage",async()=>{
 m.module.mockResolvedValue("steamfoot");expect(await saveDutySettings(input)).toMatchObject({success:true,data:{enabled:true}});expect(m.manager).not.toHaveBeenCalled();expect(m.raw).toHaveBeenCalledTimes(1);
});
it("rejects a concurrent configuration write and reports an unknown DB failure as uncertain",async()=>{
 m.update.mockResolvedValue({count:0});expect(await saveDutySettings(input)).toMatchObject({success:false,uncertain:false});
 m.transaction.mockRejectedValue(new Error("network lost"));expect(await saveDutySettings(input)).toMatchObject({success:false,uncertain:true});
});
it("preserves a committed result even if cache expiration fails",async()=>{
 m.cache.mockImplementation(()=>{throw new Error("cache failed");});expect(await saveDutySettings(input)).toMatchObject({success:true,syncWarning:true,data:{enabled:true}});
});
