import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({finance:false,denied:"",manager:vi.fn(),compensation:vi.fn(),plans:vi.fn(),savePlan:vi.fn()}));
vi.mock("@/lib/sports-staging",()=>({requireSportsStaging:()=>{}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:async()=>({})},customer:{findMany:async()=>[]},staff:{findMany:async()=>[]}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:async()=>({selfBookingEnabled:false,assignedSchedulingEnabled:true})},$transaction:async(cb:(tx:object)=>unknown)=>cb({}),musicSubject:{findMany:async()=>[]},coursePointPlan:{findMany:m.plans},courseTemplate:{findMany:async()=>[{id:"t",musicSubjectId:"subject",pointCost:2}]},coursePointCard:{findMany:async()=>[]},courseRoom:{findMany:async()=>[]},courseCompensation:{findMany:m.compensation},courseSession:{findMany:async()=>[]},courseRental:{findMany:async()=>[]},$queryRaw:async()=>[]}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseMember:vi.fn(),courseTransaction:vi.fn()}));
vi.mock("@/server/services/sports-production-readiness",()=>({assertSportsProductionReady:async()=>{}}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCoursePointPlan:m.savePlan}));
vi.mock("@/server/actions/course",()=>({}));
vi.mock("@/server/actions/course-rental",()=>({}));
vi.mock("@/server/actions/course-trial",()=>({}));
vi.mock("@/server/actions/course-refund",()=>({}));
import {loadSportsStaging} from "@/server/actions/sports-staging";
beforeEach(()=>{
 vi.clearAllMocks();m.finance=false;m.denied="";
 m.manager.mockImplementation(async(permission:string)=>{if(permission===m.denied||permission==="teacher.compensation.read"&&!m.finance)throw new Error("FORBIDDEN");return {storeId:"sports-live-flow-store",user:{id:"staff",role:"STAFF"}};});
 m.compensation.mockResolvedValue([{templateId:"t",rules:[{mode:"HOUR",value:700}]}]);m.plans.mockResolvedValue([{id:"plan",name:"十堂",points:10,price:2000,validDays:90,unit:"SESSION",templateIds:["t"],isActive:true}]);
});
it.each([false,true])("排課讀取無論有無計酬權限(%s)均不查詢或回傳計酬",async finance=>{
 m.finance=finance;const result=await loadSportsStaging(true);expect(result.success).toBe(true);if(!result.success)return;
 expect(result.data.fees).toHaveLength(1);expect(result.data.fees[0].compensation).toBeUndefined();expect(m.compensation).not.toHaveBeenCalled();expect(m.manager).not.toHaveBeenCalledWith("teacher.compensation.read");
});
it("管理讀取無計酬權限仍拒絕，不洩漏費率",async()=>{
 expect((await loadSportsStaging()).success).toBe(false);expect(m.compensation).not.toHaveBeenCalled();
});
it("授權管理讀取保留計酬設定",async()=>{
 m.finance=true;const result=await loadSportsStaging();expect(result.success).toBe(true);if(result.success)expect(result.data.fees[0].compensation).toEqual({mode:"HOUR",value:700});expect(m.manager).toHaveBeenCalledWith("teacher.compensation.read");
});
it.each(["booking.read","customer.read","wallet.read","transaction.read","plans.edit"])("排課仍檢查必要權限 %s",async permission=>{
 m.denied=permission;expect((await loadSportsStaging(true)).success).toBe(false);expect(m.compensation).not.toHaveBeenCalled();
});

it("新版編輯既有收費不再改寫教學項目的全體授課資格",async()=>{
 const {saveSportsFee}=await import("@/server/actions/sports-staging");
 const {coursePlanValues}=await import("@/lib/course-plan-save");
 m.savePlan.mockResolvedValue({success:true});
 const snapshot=coursePlanValues.parse({name:"既有舞蹈",points:10,price:5800,validDays:90,unit:"SESSION",templateIds:["existing-template"]});
 expect(await saveSportsFee({id:"legacy",sportsMode:"LEGACY",subject:"subject",name:"既有舞蹈",unit:"堂數",amount:10,price:5800,days:90,cost:1,shared:false,coachIds:[],requestKey:"00000000-0000-4000-8000-000000000001",snapshot:JSON.stringify(snapshot),chargeSettings:{kind:"plan",durationMinutes:60,providerIds:["coach"],trialPrice:null,trialDuration:null}})).toMatchObject({success:true});
 expect(m.savePlan).toHaveBeenCalledWith(expect.objectContaining({templateIds:["existing-template"],sportsSetup:undefined}));
 expect(m.manager.mock.calls.map(call=>call[0])).not.toContain("staff.manage");
});
