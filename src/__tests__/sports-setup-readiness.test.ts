import {beforeEach,expect,it,vi} from "vitest";
type Plan={templateIds:string[];sportsMode?:string;unit?:string;sportsSubjectId?:string|null;sportsCost?:number|null};
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({confirmed:true,native:true,plans:[{templateIds:["active"]}] as Plan[],staff:[{courseQualifiedTemplateIds:["active"]}],subjects:[{id:"subject-a"}],templates:[{id:"active"}]}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.native}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock("@/lib/db",()=>({prisma:{auditLog:{findFirst:async()=>m.confirmed?{id:"confirmed"}:null},staff:{count:async()=>1,findMany:async()=>m.staff},storeFeatureEntitlement:{findFirst:async()=>null},businessHours:{findMany:async()=>[{isOpen:true,openTime:"09:00",closeTime:"21:00",slotInterval:30,defaultCapacity:6,segments:null}]},shopConfig:{findUnique:async()=>({dutySchedulingEnabled:false})}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseRoom:{count:async()=>1},courseTemplate:{count:async()=>1,findMany:async()=>m.templates},coursePointPlan:{count:async()=>1,findMany:async()=>m.plans},courseSession:{count:async()=>1,findFirst:async()=>null},musicSubject:{count:async()=>1,findMany:async()=>m.subjects}}}));
import {getCourseSetup} from "@/server/queries/course-setup";
beforeEach(()=>{m.confirmed=true;m.native=true;m.plans=[{templateIds:["active"]}];m.staff=[{courseQualifiedTemplateIds:["active"]}];m.subjects=[{id:"subject-a"}];m.templates=[{id:"active"}];});
it("recognizes an already configured sports store without requiring duplicate resources",async()=>{
 const setup=await getCourseSetup("sports-live-flow-store","owner");expect(setup.localSections).toBe(true);expect(setup.steps.every(s=>s.done)).toBe(true);expect(setup.steps.every(s=>!s.href.includes("action=create"))).toBe(true);
});
it("unlinked or inactive-template fees cannot mark opening ready",async()=>{
 m.plans=[{templateIds:["inactive"]}];const setup=await getCourseSetup("sports-live-flow-store","owner");expect(setup.steps.find(s=>s.id==="plan")).toMatchObject({done:false,status:"repair"});expect(setup.steps.find(s=>s.id==="coach")?.done).toBe(true);expect(setup.steps.every(s=>s.done)).toBe(false);expect(setup.steps.filter(s=>s.done)).toHaveLength(5);
});
it("qualifications for an inactive or different teaching template repair the subject step",async()=>{
 m.staff=[{courseQualifiedTemplateIds:["other"]}];const setup=await getCourseSetup("sports-live-flow-store","owner");expect(setup.steps.find(s=>s.id==="coach")?.done).toBe(true);expect(setup.steps.find(s=>s.id==="course")).toMatchObject({done:false,status:"repair",href:"/dashboard/courses?view=catalog"});expect(setup.steps.find(s=>s.id==="plan")?.done).toBe(true);expect(setup.steps.every(s=>s.done)).toBe(false);expect(setup.steps.filter(s=>s.done)).toHaveLength(5);
});
it("music and other course stores retain the existing readiness calculation",async()=>{
 m.native=false;m.plans=[];expect((await getCourseSetup("music","owner")).steps.every(s=>s.done)).toBe(true);
});

it("restores subject completion only after a coach qualifies for an active teaching item",async()=>{
 m.staff=[{courseQualifiedTemplateIds:[]}];
 const incomplete=await getCourseSetup("sports-live-flow-store","owner");
 expect(incomplete.steps.find(s=>s.id==="coach")?.done).toBe(true);
 expect(incomplete.steps.find(s=>s.id==="course")).toMatchObject({done:false,status:"repair"});
 expect(incomplete.steps.find(s=>s.id==="plan")?.done).toBe(true);
 expect(incomplete.steps.filter(s=>s.done)).toHaveLength(5);
 m.staff=[{courseQualifiedTemplateIds:["active"]}];
 const completed=await getCourseSetup("sports-live-flow-store","owner");
 expect(completed.steps.filter(s=>s.done)).toHaveLength(6);
 expect(completed.steps.every(s=>s.done)).toBe(true);
});

it("recognizes an open universal card without any template binding",async()=>{
 m.plans=[{templateIds:[],sportsMode:"OPEN",sportsSubjectId:null,sportsCost:null,unit:"POINT"}];
 expect((await getCourseSetup("sports-live-flow-store","owner")).steps.every(s=>s.done)).toBe(true);
});

it("allows the universal-card step to be complete before teaching items are configured",async()=>{
 m.plans=[{templateIds:[],sportsMode:"OPEN",unit:"SESSION"}];m.subjects=[];m.templates=[];
 const setup=await getCourseSetup("sports-live-flow-store","owner");
 expect(setup.steps.find(s=>s.id==="plan")?.done).toBe(true);
 expect(setup.steps.find(s=>s.id==="course")?.done).toBe(false);
 expect(setup.steps.every(s=>s.done)).toBe(false);
});

it("recognizes an assigned-item plan by its active subject rather than legacy templates",async()=>{
 m.plans=[{templateIds:[],sportsMode:"ASSIGNED",sportsSubjectId:"subject-a",sportsCost:2,unit:"POINT"}];
 expect((await getCourseSetup("sports-live-flow-store","owner")).steps.every(s=>s.done)).toBe(true);
});

it.each([
 {templateIds:[],sportsMode:"ASSIGNED",sportsSubjectId:"inactive-subject",sportsCost:2,unit:"POINT"},
 {templateIds:[],sportsMode:"ASSIGNED",sportsSubjectId:"subject-a",sportsCost:0,unit:"POINT"},
 {templateIds:[],sportsMode:"ASSIGNED",sportsSubjectId:"subject-a",sportsCost:2,unit:"SESSION"},
 {templateIds:[],sportsMode:"OPEN",sportsSubjectId:"subject-a",sportsCost:null,unit:"POINT"},
 {templateIds:[],sportsMode:"OPEN",unit:"INVALID"},
 {templateIds:[]},
])("does not mark invalid, inactive-subject or unrestricted legacy rights ready: %j",async plan=>{
 m.plans=[plan];
 expect((await getCourseSetup("sports-live-flow-store","owner")).steps.find(s=>s.id==="plan")).toMatchObject({done:false,status:"repair"});
});

it("provisioned open hours do not skip the explicit store confirmation",async()=>{m.confirmed=false;const setup=await getCourseSetup("new-store","owner");expect(setup.steps.find(s=>!s.done)).toMatchObject({id:"hours",label:"確認營業時間與公休"});expect(setup.steps[0].done).toBe(false);m.confirmed=true;expect((await getCourseSetup("new-store","owner")).steps[0].done).toBe(true);});
