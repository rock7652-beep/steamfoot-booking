import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({finance:false,denied:"",manager:vi.fn(),compensation:vi.fn(),plans:vi.fn(),savePlan:vi.fn(),room:vi.fn(),template:vi.fn(),coaches:vi.fn(),plan:vi.fn(),schedule:vi.fn()}));
vi.mock("@/lib/sports-staging",()=>({requireSportsStaging:()=>{}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:async()=>({})},customer:{findMany:async()=>[]},staff:{findMany:m.coaches}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:async()=>({selfBookingEnabled:false,assignedSchedulingEnabled:true})},$transaction:async(cb:(tx:object)=>unknown)=>cb({}),musicSubject:{findMany:async()=>[]},coursePointPlan:{findMany:m.plans,findFirst:m.plan},courseTemplate:{findFirst:m.template,findMany:async()=>[{id:"t",musicSubjectId:"subject",pointCost:2}]},coursePointCard:{findMany:async()=>[]},courseRoom:{findFirst:m.room,findMany:async()=>[]},courseCompensation:{findMany:m.compensation},courseSession:{findMany:async()=>[]},courseRental:{findMany:async()=>[]},$queryRaw:async()=>[]}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseMember:vi.fn(),courseTransaction:vi.fn()}));
vi.mock("@/server/services/sports-production-readiness",()=>({assertSportsProductionReady:async()=>{}}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCoursePointPlan:m.savePlan}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:m.schedule}));
vi.mock("@/server/actions/course-rental",()=>({}));
vi.mock("@/server/actions/course-trial",()=>({}));
vi.mock("@/server/actions/course-refund",()=>({}));
import {loadSportsStaging} from "@/server/actions/sports-staging";
beforeEach(()=>{
 vi.clearAllMocks();m.room.mockResolvedValue({id:"room",capacity:8});m.template.mockResolvedValue({id:"t"});m.coaches.mockResolvedValue([]);m.finance=false;m.denied="";
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

it("儲存一般與體驗成本不再將店家成本改成零",async()=>{
 const {saveSportsFee}=await import("@/server/actions/sports-staging");m.savePlan.mockResolvedValue({success:true});
 const data={sportsMode:"ASSIGNED",subject:"subject",name:"舞蹈單堂",unit:"堂數",amount:1,price:600,storeCost:350,days:90,cost:1,shared:false,requestKey:"00000000-0000-4000-8000-000000000001",chargeSettings:{kind:"single",durationMinutes:60,trialPrice:300,trialDuration:30,trialStoreCost:120,providerIds:["coach"]}};
 expect(await saveSportsFee(data)).toMatchObject({success:true});
 expect(m.savePlan).toHaveBeenCalledWith(expect.objectContaining({storeCost:350,chargeSettings:expect.objectContaining({trialStoreCost:120})}));
 m.savePlan.mockClear();expect(await saveSportsFee({...data,storeCost:-1})).toMatchObject({success:false});expect(m.savePlan).not.toHaveBeenCalled();
});

it.each([true,false])('保留舊方案資格與空收費設定，單獨更新顧客可購買=%s',async customerPurchasable=>{
 const {saveSportsFee}=await import('@/server/actions/sports-staging');
 const {coursePlanValues}=await import('@/lib/course-plan-save');
 const base=coursePlanValues.parse({name:'舞蹈(常態)-10堂',points:10,price:5800,validDays:90,unit:'SESSION',templateIds:['old-rule'],customerPurchasable:!customerPurchasable});
 m.savePlan.mockResolvedValue({success:true,data:{...base,customerPurchasable}});
 const snapshot=JSON.stringify(base);
 expect(await saveSportsFee({id:'legacy',sportsMode:'LEGACY',chargeSettings:null,name:base.name,unit:'堂數',amount:10,price:5800,days:90,cost:1,shared:false,coachIds:[],customerPurchasable,requestKey:'00000000-0000-4000-8000-000000000001',snapshot})).toMatchObject({success:true,data:{customerPurchasable}});
 expect(m.savePlan).toHaveBeenCalledWith(expect.objectContaining({id:'legacy',chargeSettings:null,templateIds:['old-rule'],sportsSetup:undefined,customerPurchasable,expectedSnapshot:snapshot,receipt:{expectedStoreId:'sports-live-flow-store',requestKey:'00000000-0000-4000-8000-000000000001'}}));
 expect(m.manager.mock.calls.map(c=>c[0])).toEqual(['plans.edit']);
});
it('空收費設定不讓新建或缺少快照的舊流程略過資格設定',async()=>{
 const {saveSportsFee}=await import('@/server/actions/sports-staging');
 m.denied='staff.manage';
 const input={sportsMode:'LEGACY',chargeSettings:null,name:'舞蹈',unit:'堂數',amount:10,price:5800,days:90,cost:1,shared:false,coachIds:[],customerPurchasable:true,requestKey:'00000000-0000-4000-8000-000000000001'};
 expect((await saveSportsFee(input)).success).toBe(false);
 expect((await saveSportsFee({...input,id:'legacy'})).success).toBe(false);
 expect(m.savePlan).not.toHaveBeenCalled();
});

it('體驗新客由共用排課交易建立並預約，保留方案選擇且不重複加入舊學員規則',async()=>{
 const {sportsStagingCommand}=await import('@/server/actions/sports-staging');
 m.plan.mockResolvedValue({id:'single',templateIds:['t'],chargeSettings:{kind:'single',durationMinutes:90,trialPrice:480,trialDuration:null,providerIds:['coach']}});m.coaches.mockResolvedValue([{id:'coach'}]);m.schedule.mockResolvedValue({success:true});
 const trialLearner={participantKey:'00000000-0000-4000-8000-000000000002',name:'體驗學員',phone:'0912345678'};
 const payload={subject:'subject',fee:'single',kind:'體驗',mode:'指定學員',date:'2026-10-27',time:'10:00',duration:90,count:1,coach:'老師',coachId:'coach',room:'A',capacity:1,students:[],price:480,trialLearner,requestKey:'00000000-0000-4000-8000-000000000001'};
 expect(await sportsStagingCommand({operation:'schedule',payload})).toMatchObject({success:true});
 expect(m.schedule).toHaveBeenCalledWith(expect.objectContaining({chargePlanId:'single',isTrial:true,learners:[{customerId:null,cardId:null,participantKey:trialLearner.participantKey,customerName:trialLearner.name,customerPhone:trialLearner.phone}],sportsStaging:expect.objectContaining({students:[],enrollment:'ASSIGNED',frequency:'SINGLE'})}));
 m.schedule.mockClear();m.plan.mockResolvedValue({id:'single',templateIds:['t'],chargeSettings:null});expect((await sportsStagingCommand({operation:'schedule',payload})).success).toBe(false);expect(m.schedule).not.toHaveBeenCalled();
});
