import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),lock:vi.fn(),write:vi.fn(),upsert:vi.fn(),transaction:vi.fn(),plans:vi.fn(),settings:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction,messageTemplate:{findMany:m.settings}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointPlan:{findMany:m.plans}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/server/services/course-store-lock",()=>({lockCourseStore:m.lock}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {saveCoursePlanReminderSetting,getCoursePlanReminderSettings} from "@/server/actions/course-plan-reminders";
const input={planId:"p",enabled:true,threshold:3,expiry:{enabled:true,days:[30,7,7]}};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"s"});m.write.mockResolvedValue(1);m.transaction.mockImplementation(async work=>work({$executeRaw:m.write,messageTemplate:{upsert:m.upsert}}));});
it("stores both rules atomically in the authorized course store and normalizes duplicate days",async()=>{
 expect(await saveCoursePlanReminderSetting(input)).toMatchObject({success:true});expect(m.permission).toHaveBeenCalledWith("business_hours.manage");expect(m.lock).toHaveBeenCalledWith(expect.anything(),"s");expect(m.transaction).toHaveBeenCalledOnce();
 expect(m.write.mock.calls[0].slice(1)).toEqual([true,3,"p","s"]);expect(m.upsert.mock.calls[0][0].create).toMatchObject({id:"course-expiry-plan:s:p",storeId:"s",body:JSON.stringify({enabled:true,days:[30,7]})});
});
it("rejects another store's plan and does not create its expiry override",async()=>{
 m.write.mockResolvedValue(0);expect(await saveCoursePlanReminderSetting(input)).toMatchObject({success:false});expect(m.upsert).not.toHaveBeenCalled();
});
it("propagates expiry storage failure out of the transaction so quota changes roll back",async()=>{
 m.upsert.mockRejectedValue(new Error("storage unavailable")); let rolledBack=false;
 m.transaction.mockImplementation(async work=>{try{return await work({$executeRaw:m.write,messageTemplate:{upsert:m.upsert}});}catch(error){rolledBack=true;throw error;}});
 expect(await saveCoursePlanReminderSetting(input)).toMatchObject({success:false});expect(rolledBack).toBe(true);
});
it.each([[],[0],[366],[1.5],[1,2,3,4,5,6,7]].map(days => [days]))("rejects invalid day list %j before writes",async days=>{
 expect(await saveCoursePlanReminderSetting({...input,expiry:{enabled:true,days}})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("blocks unauthorized writes",async()=>{m.permission.mockRejectedValue(new Error("denied"));expect(await saveCoursePlanReminderSetting(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();});
it("reads overrides by store and defaults unconfigured plans to 14 and 7",async()=>{
 m.plans.mockResolvedValue([{id:"p"},{id:"new"}]);m.settings.mockResolvedValue([{id:"course-expiry-plan:s:p",body:JSON.stringify({enabled:true,days:[30]})}]);
 expect(await getCoursePlanReminderSettings()).toMatchObject([{id:"p",expiry:{enabled:true,days:[30]}},{id:"new",expiry:{enabled:true,days:[14,7]}}]);expect(m.settings).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"s",id:{startsWith:"course-expiry-plan:s:"}}}));
});
