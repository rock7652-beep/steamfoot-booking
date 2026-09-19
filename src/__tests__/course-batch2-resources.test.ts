import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {assertCourseResources,assertNoCourseResourceUse,handleCourseActionError} from "@/server/services/course-resources";
const tx={courseRoom:{findFirst:vi.fn()},courseTemplate:{findFirst:vi.fn()},courseSession:{findMany:vi.fn()},$queryRaw:vi.fn()};
const input={templateId:"t",roomId:"r",coachId:"c",capacity:5};
beforeEach(()=>{vi.resetAllMocks();tx.courseRoom.findFirst.mockResolvedValue({capacity:5});tx.courseTemplate.findFirst.mockResolvedValue({isActive:true,visibility:"PUBLIC"});tx.$queryRaw.mockResolvedValue([{courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["t"]}]);});
it("new scheduling requires explicit qualification, while unchanged old resource edits tolerate pending qualification",async()=>{
 tx.$queryRaw.mockResolvedValue([{courseCoachEnabled:true,courseQualificationsConfirmed:false,courseQualifiedTemplateIds:[]}]);
 await expect(assertCourseResources(tx as never,"s",input)).rejects.toThrow("授課資格");
 await expect(assertCourseResources(tx as never,"s",input,{templateId:"t",coachId:"c"})).resolves.toBeUndefined();
 await expect(assertCourseResources(tx as never,"s",input,{templateId:"other",coachId:"c"})).rejects.toThrow("授課資格");
});
it("confirmed empty qualification is not a legacy exception",async()=>{tx.$queryRaw.mockResolvedValue([{courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[]}]);await expect(assertCourseResources(tx as never,"s",input,input)).rejects.toThrow("授課資格");});
it("hidden permits manager scheduling; off only preserves old unchanged course",async()=>{tx.courseTemplate.findFirst.mockResolvedValue({isActive:true,visibility:"HIDDEN"});await expect(assertCourseResources(tx as never,"s",input)).resolves.toBeUndefined();tx.courseTemplate.findFirst.mockResolvedValue({isActive:false,visibility:"OFF"});await expect(assertCourseResources(tx as never,"s",input)).rejects.toThrow("下架");await expect(assertCourseResources(tx as never,"s",input,input)).resolves.toBeUndefined();});
it("capacity and revoked coach remain guarded for old classes",async()=>{await expect(assertCourseResources(tx as never,"s",{...input,capacity:6},input)).rejects.toThrow("容量");tx.$queryRaw.mockResolvedValue([{courseCoachEnabled:false}]);await expect(assertCourseResources(tx as never,"s",input,input)).rejects.toThrow("教練身分");});
it("resource conflicts include in-progress classes and exclude ended/cancelled at the boundary",async()=>{const now=new Date('2026-09-19T01:00:00Z');tx.courseSession.findMany.mockResolvedValue([{id:"one",nameSnapshot:"Class",startsAt:new Date('2026-09-19T00:30:00Z'),capacity:6}]);try{await assertNoCourseResourceUse(tx as never,"s",{roomId:"r",capacity:5},now);throw Error("expected rejection");}catch(e){const r=handleCourseActionError(e);expect(r.conflicts[0]).toMatchObject({id:"one",capacity:6});expect(r.success).toBe(false);}expect(tx.courseSession.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"s",cancelledAt:null,endsAt:{gt:now},roomId:"r",capacity:{gt:5}}}));});
