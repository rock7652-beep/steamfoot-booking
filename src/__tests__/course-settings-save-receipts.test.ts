import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),transaction:vi.fn(),template:vi.fn(),createTemplate:vi.fn(),updateTemplate:vi.fn(),room:vi.fn(),duration:vi.fn(),plan:vi.fn(),createPlan:vi.fn(),updatePlan:vi.fn(),revalidate:vi.fn(),music:vi.fn(),term:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access,courseTransaction:m.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseTemplate:{count:async()=>0}}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock("@/server/services/course-availability",()=>({assertMusicCourseDuration:m.duration}));
vi.mock("@/server/services/course-coach-notification-kick",()=>({kickCoachNotifications:vi.fn()}));
vi.mock("@/server/services/course-term",()=>({validateCourseTerm:m.term}));
vi.mock("@/server/services/course-shared-card",()=>({getCourseSharedCardStateInTransaction:async()=>"ENABLED"}));
vi.mock("@/server/services/course-booking",()=>({}));
vi.mock("@/server/services/course-waitlist",()=>({}));
vi.mock("@/server/services/course-display-order",()=>({}));
vi.mock("@/server/services/music-subject-rule",()=>({}));
vi.mock("@/server/services/course-low-balance-schedule",()=>({}));
vi.mock("@/server/services/course-assignment-checkout",()=>({}));
vi.mock("@/server/services/operation-audit-outbox",()=>({}));
import {saveCourseTemplateSettings} from "@/server/actions/course";
import {saveCoursePointPlan} from "@/server/actions/course-members";
import {courseTemplateInput} from "@/lib/course-scheduling";
import {courseTemplateRevision} from "@/lib/course-template-save";
import {coursePlanValues} from "@/lib/course-plan-save";
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
const template=courseTemplateInput.parse({name:"瑜珈",durationMinutes:60,pointCost:1,capacity:10});
const plan=coursePlanValues.parse({name:"十堂",points:10,price:1000,validDays:90,allowShared:false});
let savedTemplate:Record<string,unknown>|null,savedPlan:Record<string,unknown>|null;
beforeEach(()=>{
 vi.resetAllMocks();savedTemplate=null;savedPlan=null;m.access.mockResolvedValue({storeId:"store",user:{id:"user"}});m.music.mockResolvedValue(null);m.term.mockResolvedValue([]);
 m.template.mockImplementation(async()=>savedTemplate);m.plan.mockImplementation(async()=>savedPlan);
 m.createTemplate.mockImplementation(async({data})=>savedTemplate={...data,isActive:true,visibility:"PUBLIC",musicSubjectId:null,musicSubject:null,_count:{sessions:0},updatedAt:new Date()});
 m.createPlan.mockImplementation(async({data})=>savedPlan={...data,lowBalanceEnabled:false,lowBalanceThreshold:null});
 m.updateTemplate.mockImplementation(async({data})=>{savedTemplate={...savedTemplate,...data,updatedAt:new Date()};return {count:1};});
 m.updatePlan.mockImplementation(async({data})=>{savedPlan={...savedPlan,...data};return {count:1};});
 m.transaction.mockImplementation(async(_store,work)=>work({courseTemplate:{findFirst:m.template,findFirstOrThrow:m.template,create:m.createTemplate,updateMany:m.updateTemplate},courseRoom:{findFirst:m.room},coursePointPlan:{findFirst:m.plan,findFirstOrThrow:m.plan,create:m.createPlan,updateMany:m.updatePlan},coursePurchase:{count:async()=>0},$queryRaw:async()=>[]}));
});
it("confirms the same course create after a lost reply; changed retry cannot overwrite it",async()=>{
 const first=await saveCourseTemplateSettings({...template,...receipt});expect(first).toMatchObject({success:true,data:{name:"瑜珈",hasSessions:false}});
 expect(await saveCourseTemplateSettings({...template,...receipt})).toEqual(first);expect(m.createTemplate).toHaveBeenCalledTimes(1);
 expect((await saveCourseTemplateSettings({...template,name:"另一門",...receipt})).success).toBe(false);
});
it("recovers an already applied course edit and rejects a stale different edit",async()=>{
 await saveCourseTemplateSettings({...template,...receipt});const old={...savedTemplate!};const id=String(old.id),revision=courseTemplateRevision(old);
 const input={...template,name:"更新",id,...receipt,expectedRevision:revision};const first=await saveCourseTemplateSettings(input);
 expect(first.success).toBe(true);expect(await saveCourseTemplateSettings(input)).toEqual(first);expect(m.updateTemplate).toHaveBeenCalledTimes(1);
 expect((await saveCourseTemplateSettings({...input,name:"過期內容"})).success).toBe(false);expect(m.updateTemplate).toHaveBeenCalledTimes(1);
});
it("keeps scheduled class types and active-room validation",async()=>{
 await saveCourseTemplateSettings({...template,...receipt});savedTemplate={...savedTemplate!,_count:{sessions:1}};
 expect((await saveCourseTemplateSettings({...template,...receipt,id:String(savedTemplate.id),expectedRevision:courseTemplateRevision(savedTemplate),classType:"PRIVATE"})).success).toBe(false);
 expect((await saveCourseTemplateSettings({...template,...receipt,requestKey:"223e4567-e89b-42d3-a456-426614174000",defaultRoomId:"foreign"})).success).toBe(false);expect(m.updateTemplate).not.toHaveBeenCalled();
});
it("confirms point-plan creates and already applied edits without duplicate writes",async()=>{
 const first=await saveCoursePointPlan({...plan,receipt});expect(first).toMatchObject({success:true,data:{name:"十堂",lowBalanceEnabled:false}});
 expect(await saveCoursePointPlan({...plan,receipt})).toEqual(first);expect(m.createPlan).toHaveBeenCalledTimes(1);
 const input={...plan,id:String(savedPlan!.id),price:2000,expectedSnapshot:JSON.stringify(plan),receipt};const edited=await saveCoursePointPlan(input);
 expect(edited.success).toBe(true);expect(await saveCoursePointPlan(input)).toEqual(edited);expect(m.updatePlan).toHaveBeenCalledTimes(1);
 expect((await saveCoursePointPlan({...input,price:3000})).success).toBe(false);expect(m.updatePlan).toHaveBeenCalledTimes(1);
});
it("rejects cross-store requests before transactions; committed saves survive cache failures",async()=>{
 expect((await saveCourseTemplateSettings({...template,...receipt,expectedStoreId:"other"})).success).toBe(false);
 expect((await saveCoursePointPlan({...plan,receipt:{...receipt,expectedStoreId:"other"}})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 m.revalidate.mockImplementation(()=>{throw new Error("cache failed");});
 expect(await saveCourseTemplateSettings({...template,...receipt})).toMatchObject({success:true,syncWarning:true});
 expect(await saveCoursePointPlan({...plan,receipt})).toMatchObject({success:true,syncWarning:true});
});
