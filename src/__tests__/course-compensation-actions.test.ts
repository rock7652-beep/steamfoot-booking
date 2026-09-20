import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),raw:vi.fn(),execute:vi.fn(),template:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:async(_s:string,fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.execute,courseTemplate:{findFirst:m.template}})}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$queryRaw:m.raw}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {saveCourseCompensation} from "@/server/actions/course-compensation";
const input={templateId:"course",staffId:"teacher",rules:[{mode:"SHARE",value:50}],revision:0};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"A",user:{role:"OWNER"}});m.template.mockResolvedValue({id:"course"});m.execute.mockResolvedValue(1);});
describe("compensation settings authorization and concurrency",()=>{
 it("saves one enabled method with an individual rate",async()=>{m.raw.mockResolvedValueOnce([{staffId:"",rules:[{mode:"SHARE",value:40}],revision:1}]).mockResolvedValueOnce([{id:"teacher"}]);expect((await saveCourseCompensation(input)).success).toBe(true);expect(m.execute).toHaveBeenCalledTimes(1);});
 it("rejects a different store's template",async()=>{m.template.mockResolvedValue(null);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects stale edits",async()=>{m.raw.mockResolvedValue([{staffId:"teacher",rules:input.rules,revision:3}]);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects nonqualified teachers",async()=>{m.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects a method the course has not enabled",async()=>{m.raw.mockResolvedValueOnce([{staffId:"",rules:[{mode:"CLASS",value:600}],revision:1}]).mockResolvedValueOnce([{id:"teacher"}]);expect((await saveCourseCompensation(input)).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("does not remove a method still selected by a teacher",async()=>{m.raw.mockResolvedValue([{staffId:"",rules:input.rules,revision:1},{staffId:"teacher",rules:input.rules,revision:1}]);expect((await saveCourseCompensation({...input,staffId:"",rules:[],revision:1})).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
 it("rejects multiple teacher methods",async()=>{m.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"teacher"}]);expect((await saveCourseCompensation({...input,rules:[...input.rules,{mode:"CLASS",value:600}]})).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();});
});
