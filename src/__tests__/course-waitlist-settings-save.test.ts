import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),feature:vi.fn(),transaction:vi.fn(),read:vi.fn(),write:vi.fn(),audit:vi.fn(),cache:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.cache}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-waitlist",()=>({}));
vi.mock("@/server/services/course-waitlist-notifications",()=>({}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:m.audit}));
import {saveCourseWaitlistSettings} from "@/server/actions/course-waitlist";
import {waitlistRevision} from "@/lib/course-waitlist-save";
const initial={enabled:false,defaultLimit:5,autoPromoteStopMinutes:240};
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000",expectedRevision:waitlistRevision(initial)};
let row=initial;
beforeEach(()=>{
 vi.resetAllMocks();row={...initial};m.access.mockResolvedValue({storeId:"store",user:{id:"actor"}});m.read.mockImplementation(async()=>row);
 m.write.mockImplementation(async({update})=>row={...row,...update});
 m.transaction.mockImplementation(async(_store,work,audit)=>{const tx={courseWaitlistSetting:{findUnique:m.read,upsert:m.write}};const result=await work(tx);await audit(result,tx);return result;});
});
it("confirms the committed candidate count and retries without duplicate writes or audits",async()=>{
 const input={...initial,enabled:true,defaultLimit:8,receipt};const first=await saveCourseWaitlistSettings(input);
 expect(first).toMatchObject({success:true,storeId:"store",data:{enabled:true,defaultLimit:8}});
 expect(await saveCourseWaitlistSettings(input)).toEqual(first);expect(m.write).toHaveBeenCalledTimes(1);expect(m.audit).toHaveBeenCalledTimes(1);
 expect((await saveCourseWaitlistSettings({...input,defaultLimit:10})).success).toBe(false);expect(m.write).toHaveBeenCalledTimes(1);
});
it("blocks cross-store and unavailable-feature edits before a transaction",async()=>{
 expect((await saveCourseWaitlistSettings({...initial,receipt:{...receipt,expectedStoreId:"other"}})).success).toBe(false);
 m.feature.mockRejectedValueOnce(new Error("feature unavailable"));expect((await saveCourseWaitlistSettings({...initial,receipt})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("keeps a committed success when route cache updates fail",async()=>{
 m.cache.mockImplementation(()=>{throw new Error("cache");});expect(await saveCourseWaitlistSettings({...initial,enabled:true,receipt})).toMatchObject({success:true,syncWarning:true});
});
