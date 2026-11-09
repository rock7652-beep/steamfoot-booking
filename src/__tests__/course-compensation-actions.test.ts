import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("@/server/services/music-finance-access",()=>({requireMusicFinance:vi.fn()}));
const m=vi.hoisted(()=>({manager:vi.fn(),raw:vi.fn(),execute:vi.fn(),template:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:async(_s:string,fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.execute,courseTemplate:{findFirst:m.template}})}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$queryRaw:m.raw}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {saveCourseCompensation} from "@/server/actions/course-compensation";
import {requireMusicFinance} from "@/server/services/music-finance-access";
const input={templateId:"course",staffId:"teacher",rules:[{mode:"CLASS",value:600}],revision:0};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"A",user:{role:"OWNER"}});m.template.mockResolvedValue({id:"course",name:"木吉他"});m.execute.mockResolvedValue(1);});
describe("compensation settings authorization and concurrency",()=>{
 it("checks music share eligibility inside the store transaction before writing",async()=>{
  m.raw.mockResolvedValueOnce([]);
  expect(await saveCourseCompensation({...input,rules:[{mode:"SHARE",value:55}]})).toMatchObject({success:false,error:"只有音樂教室可設定老師拆帳比例"});
  expect(m.raw.mock.calls[0].slice(1)).toEqual(["A"]);
  expect(m.template).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
 });
 it("saves music share with qualified teacher and matching snapshot revision",async()=>{
  m.raw.mockResolvedValueOnce([{featureKey:"business.music"}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"teacher",name:"老師甲"}]);
  expect(await saveCourseCompensation({...input,rules:[{mode:"SHARE",value:55}]})).toMatchObject({success:true});
  expect(m.execute).toHaveBeenCalledTimes(2);
 });
 it("checks the teacher finance permission before reading or writing compensation",async()=>{
  vi.mocked(requireMusicFinance).mockRejectedValueOnce(new Error("permission denied"));
  expect((await saveCourseCompensation(input)).success).toBe(false);
  expect(requireMusicFinance).toHaveBeenCalledWith({role:"OWNER"},"A","teacher.compensation.manage","teacher");
  expect(m.template).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
 });
 it("saves a fixed teacher fee without requiring course-level defaults",async()=>{m.raw.mockResolvedValueOnce([{staffId:"",rules:[{mode:"SHARE",value:40}],revision:1}]).mockResolvedValueOnce([{id:"teacher",name:"老師甲"}]);expect((await saveCourseCompensation(input)).success).toBe(true);expect(m.execute).toHaveBeenCalledTimes(2);});
 it("rejects a different store's template",async()=>{m.template.mockResolvedValue(null);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects stale edits",async()=>{m.raw.mockResolvedValue([{staffId:"teacher",rules:input.rules,revision:3}]);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects nonqualified teachers",async()=>{m.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects removed hourly and share modes",async()=>{m.raw.mockResolvedValueOnce([{staffId:"",rules:[{mode:"CLASS",value:600}],revision:1}]).mockResolvedValueOnce([{id:"teacher",name:"老師甲"}]);expect((await saveCourseCompensation({...input,rules:[{mode:"HOUR",value:600}]})).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("does not remove a method still selected by a teacher",async()=>{m.raw.mockResolvedValue([{staffId:"",rules:input.rules,revision:1},{staffId:"teacher",rules:input.rules,revision:1}]);expect((await saveCourseCompensation({...input,staffId:"",rules:[],revision:1})).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects multiple teacher methods",async()=>{m.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"teacher",name:"老師甲"}]);expect((await saveCourseCompensation({...input,rules:[...input.rules,{mode:"CLASS",value:600}]})).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
});

it("persists the old and new fee in the same transaction with recognizable names",async()=>{
 m.raw.mockResolvedValueOnce([{staffId:"teacher",rules:[{mode:"CLASS",value:500}],revision:2}]).mockResolvedValueOnce([{id:"teacher",name:"老師甲"}]);
 expect((await saveCourseCompensation({...input,revision:2})).success).toBe(true);
 const call=m.execute.mock.calls[1];
 expect(call[0].join(" ")).toContain('INSERT INTO "AuditLog"');
 const snapshots=call.filter(v=>typeof v==="string" && v.startsWith("{" )).map(v=>JSON.parse(v));
 expect(snapshots).toEqual([
 {storeId:"A",staffName:"老師甲",templateName:"木吉他",rules:[{mode:"CLASS",value:500}]},
 {storeId:"A",staffName:"老師甲",templateName:"木吉他",rules:[{mode:"CLASS",value:600}]},
 ]);
});
