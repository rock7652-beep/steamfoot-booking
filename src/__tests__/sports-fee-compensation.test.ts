import {beforeEach,it,expect,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/sports-staging",()=>({requireSportsStaging:()=>{}}));
vi.mock("@/server/services/sports-production-readiness",()=>({assertSportsProductionReady:async()=>{}}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:async()=>{}}));
import {prepareSportsFee} from "@/server/services/sports-staging-fee";
const m={compensation:vi.fn(),update:vi.fn(),create:vi.fn(),templateCreate:vi.fn()};
const template={id:"template",musicSubjectId:"subject",pointCost:2};
const tx={musicSubject:{findFirst:async()=>({id:"subject",name:"瑜珈"})},coursePointPlan:{findFirst:async()=>({id:"plan",templateIds:["template"],storeCost:50})},courseTemplate:{findFirst:async()=>template,create:m.templateCreate},courseCompensation:{findUnique:m.compensation,update:m.update,create:m.create},$queryRaw:async()=>[{id:"coach"}],$executeRaw:async()=>1} as unknown as Prisma.TransactionClient;
const d={subject:"subject",cost:2,coachIds:["coach"],requestKey:"07b9dd7d-f8c6-4420-8315-69fe167224ea",compensation:{mode:"HOUR" as const,value:700},expectedCompensation:{mode:"HOUR" as const,value:600}};
beforeEach(()=>{vi.clearAllMocks();m.compensation.mockResolvedValue({rules:[{mode:"HOUR",value:600}],revision:1});});
it("keeps the template and existing cards valid when only the hourly rate changes",async()=>{
 expect(await prepareSportsFee(tx,"store","owner","plan",d,"POINT")).toEqual({templateId:"template",storeCost:50});
 expect(m.templateCreate).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledOnce();
 expect(m.update.mock.calls[0][0].data).toMatchObject({rules:[{mode:"HOUR",value:700}],revision:{increment:1}});
});
it("rejects a stale compensation edit without overwriting the current rule",async()=>{
 m.compensation.mockResolvedValue({rules:[{mode:"HOUR",value:800}],revision:2});
 await expect(prepareSportsFee(tx,"store","owner","plan",d,"POINT")).rejects.toThrow("計酬設定已更新");expect(m.update).not.toHaveBeenCalled();
});
it("replaying the same committed rate does not create a new revision",async()=>{
 m.compensation.mockResolvedValue({rules:[{mode:"HOUR",value:700}],revision:2});
 await prepareSportsFee(tx,"store","owner","plan",d,"POINT");expect(m.update).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
