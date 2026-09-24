import { beforeEach, expect, it, vi } from "vitest";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import { personalIncomeView } from "@/lib/course-personal-income";
const mocks = vi.hoisted(()=>({account:vi.fn(),link:vi.fn(),feature:vi.fn(),settings:vi.fn(),report:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{staffMemberLink:{findFirst:mocks.link}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$transaction:mocks.transaction}}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:mocks.feature}));
vi.mock("@/server/services/course-access",()=>({courseAccount:mocks.account}));
vi.mock("@/server/services/course-monthly-settlement",()=>({readSettlementSettings:mocks.settings,readCourseMonthlySettlement:mocks.report}));
import {readMyCourseIncome} from "@/server/services/course-personal-income";
const line=(overrides:Partial<SettlementLine>={}):SettlementLine=>({kind:"FEE",id:"session-a",staffId:"self",name:"私人姓名",label:"團課",date:"2026-08-01T01:00:00.000Z",amount:600,paid:0,issue:null,payments:[],...overrides});
const revision=(snapshot:SettlementLine[])=>({revision:1,createdAt:new Date("2026-09-01T01:00:00.000Z"),snapshot});
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.account.mockResolvedValue({user:{id:"member"},storeId:"store-a"});
 mocks.link.mockResolvedValue({staffId:"self"});
 mocks.feature.mockResolvedValue(true);
 mocks.settings.mockResolvedValue({personalIncomeEnabled:true});
 mocks.report.mockResolvedValue({settings:{personalIncomeEnabled:true},lines:[line()],revisions:[revision([line()])]});
 mocks.transaction.mockImplementation(work=>work({}));
});
it("does not turn unconfirmed income into zero or expose live amounts",()=>{
 expect(personalIncomeView("self",[line()])).toEqual({confirmed:false,pending:false,revision:null,confirmedAt:null,lines:[]});
});
it("filters other personnel and strips identifiers, notes and reasons",()=>{
 const own=line({paid:600,payments:[{id:"secret-payment",amount:600,date:"2026-09-01",note:"bank account",reason:"internal",voided:false}]});
 const view=personalIncomeView("self",[own,line({staffId:"other",id:"other-id"})],revision([own,line({staffId:"other",label:"other-label"})]));
 expect(view.lines).toHaveLength(1);
 expect(JSON.stringify(view)).not.toMatch(/secret-payment|bank account|internal|other-label|私人姓名|session-a|staffId/);
});
it("keeps confirmed obligations while refund awaits confirmation; payments remain live",()=>{
 const view=personalIncomeView("self",[line({amount:300,paid:600})],revision([line()]));
 expect(view.pending).toBe(true);expect(view.lines[0]).toMatchObject({amount:600,paid:600});
});
it("payment-only changes do not require reconfirmation",()=>{
 expect(personalIncomeView("self",[line({paid:600})],revision([line()])).pending).toBe(false);
});
it("does not reveal unrelated personnel changes through pending status",()=>{
 expect(personalIncomeView("self",[line(),line({staffId:"other",amount:900})],revision([line(),line({staffId:"other"})])).pending).toBe(false);
});
it("reassigned live rows cannot expose the new assignee's payment",()=>{
 const view=personalIncomeView("self",[line({staffId:"other",paid:999})],revision([line()]));
 expect(view.pending).toBe(true);expect(view.lines[0].paid).toBeNull();expect(view.lines[0].payments).toEqual([]);
});
it("preserves separate fee and profit lines for dual roles",()=>{
 const lines=[line(),line({kind:"PROFIT",amount:2000})];
 expect(personalIncomeView("self",lines,revision(lines)).lines.map(l=>l.kind)).toEqual(["FEE","PROFIT"]);
});
it.each(["feature","settings","link"])("denies access when %s is unavailable before reading income",async gate=>{
 if(gate==="feature")mocks.feature.mockResolvedValue(false);
 if(gate==="settings")mocks.settings.mockResolvedValue({personalIncomeEnabled:false});
 if(gate==="link")mocks.link.mockResolvedValue(null);
 await expect(readMyCourseIncome("2026-08")).rejects.toThrow("尚未開放");
 expect(mocks.report).not.toHaveBeenCalled();
});
it("derives identity and store from session; requires active same-store unrevoked link",async()=>{
 const view=await readMyCourseIncome("2026-08");
 expect(view.lines).toHaveLength(1);
 expect(mocks.link).toHaveBeenCalledWith({where:{userId:"member",storeId:"store-a",revokedAt:null,staff:{storeId:"store-a",status:"ACTIVE"}},select:{staffId:true}});
 expect(mocks.report).toHaveBeenCalledWith({},"store-a","2026-08");
});
it("rejects unauthenticated or deactivated accounts without querying income",async()=>{
 mocks.account.mockRejectedValue(new Error("帳號已停用"));
 await expect(readMyCourseIncome("2026-08")).rejects.toThrow("帳號已停用");expect(mocks.report).not.toHaveBeenCalled();
});
it("rechecks disabled setting in the report transaction",async()=>{
 mocks.report.mockResolvedValue({settings:{personalIncomeEnabled:false}});
 await expect(readMyCourseIncome("2026-08")).rejects.toThrow("已關閉");
});
it("rejects invalid month before querying",async()=>{
 await expect(readMyCourseIncome("2026-13")).rejects.toThrow();expect(mocks.account).not.toHaveBeenCalled();
});
