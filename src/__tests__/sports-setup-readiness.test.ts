import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({native:true,plans:[{templateIds:["active"]}],staff:[{courseQualifiedTemplateIds:["active"]}]}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.native}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock("@/lib/db",()=>({prisma:{staff:{count:async()=>1,findMany:async()=>m.staff},storeFeatureEntitlement:{findFirst:async()=>null},businessHours:{findMany:async()=>[{isOpen:true,openTime:"09:00",closeTime:"21:00",slotInterval:30,defaultCapacity:6,segments:null}]},shopConfig:{findUnique:async()=>({dutySchedulingEnabled:false})}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseRoom:{count:async()=>1},courseTemplate:{count:async()=>1,findMany:async()=>[{id:"active"}]},coursePointPlan:{count:async()=>1,findMany:async()=>m.plans},courseSession:{count:async()=>1,findFirst:async()=>null},musicSubject:{count:async()=>1}}}));
import {getCourseSetup} from "@/server/queries/course-setup";
beforeEach(()=>{m.native=true;m.plans=[{templateIds:["active"]}];m.staff=[{courseQualifiedTemplateIds:["active"]}];});
it("recognizes an already configured sports store without requiring duplicate resources",async()=>{
 const setup=await getCourseSetup("sports-live-flow-store","owner");expect(setup.localSections).toBe(true);expect(setup.steps.every(s=>s.done)).toBe(true);expect(setup.steps.every(s=>!s.href.includes("action=create"))).toBe(true);
});
it("unlinked or inactive-template fees cannot mark opening ready",async()=>{
 m.plans=[{templateIds:["inactive"]}];const setup=await getCourseSetup("sports-live-flow-store","owner");expect(setup.steps.find(s=>s.id==="plan")).toMatchObject({done:false,status:"repair"});expect(setup.steps.find(s=>s.id==="coach")?.done).toBe(false);
});
it("a qualified coach for a different fee template cannot complete opening",async()=>{
 m.staff=[{courseQualifiedTemplateIds:["other"]}];expect((await getCourseSetup("sports-live-flow-store","owner")).steps.find(s=>s.id==="coach")?.done).toBe(false);
});
it("music and other course stores retain the existing readiness calculation",async()=>{
 m.native=false;m.plans=[];expect((await getCourseSetup("music","owner")).steps.every(s=>s.done)).toBe(true);
});
