import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ manager: vi.fn(), member: vi.fn(), transaction: vi.fn(), feature: vi.fn(), join: vi.fn(), promote: vi.fn(), after: vi.fn(), notify: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({courseManager:m.manager,courseMember:m.member,courseTransaction:m.transaction}));
vi.mock("@/lib/feature-gate", () => ({requireStoreFeature:m.feature}));
vi.mock("@/server/services/course-waitlist", () => ({joinCourseWaitlist:m.join,promoteCourseWaitlistForSession:m.promote}));
vi.mock("@/server/services/course-waitlist-notifications", () => ({notifyCourseWaitlistPromotions:m.notify}));
vi.mock("@/server/services/operation-audit-outbox", () => ({enqueueOperationAudit:vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath:vi.fn()}));
vi.mock("next/server", () => ({after:m.after}));
import { AppError } from "@/lib/errors";
import { joinMemberCourseWaitlist, promoteCourseWaitlistManually } from "@/server/actions/course-waitlist";
const tx = {};
beforeEach(()=>{
  vi.resetAllMocks();
  m.manager.mockResolvedValue({user:{id:"manager",name:"店長"},storeId:"course-a"});
  m.member.mockResolvedValue({user:{id:"member"},customer:{id:"student",name:"學員"},storeId:"course-a"});
  m.transaction.mockImplementation(async(_store,work)=>work(tx));
  m.promote.mockResolvedValue([]);
  m.join.mockResolvedValue({position:1,rows:[{}]});
});
it("only the authorized staff action requests manual override for the resolved store",async()=>{
  expect(await promoteCourseWaitlistManually({sessionId:"session",storeId:"other"})).toMatchObject({success:true});
  expect(m.manager).toHaveBeenCalledExactlyOnceWith("booking.update");
  expect(m.feature).toHaveBeenCalledWith("course-a","course_waitlist");
  expect(m.transaction).toHaveBeenCalledWith("course-a",expect.any(Function),expect.any(Function));
  expect(m.promote).toHaveBeenCalledWith(tx,"course-a","session",{ignoreCutoff:true,manual:true});
  expect(m.after).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it("a student or unauthorized staff cannot enter manual promotion",async()=>{
  m.manager.mockRejectedValue(new AppError("FORBIDDEN","無權限"));
  expect(await promoteCourseWaitlistManually({sessionId:"session"})).toMatchObject({success:false});
  expect(m.transaction).not.toHaveBeenCalled();expect(m.promote).not.toHaveBeenCalled();
});
it("student input cannot supply a manual override or override its actor/store",async()=>{
  const input={sessionId:"session",cardId:"card",customerIds:["student"],requestKey:"6c1a52c3-bb19-4e66-94b2-460a76594d1b"};
  expect(await joinMemberCourseWaitlist({...input,manual:true,manualWaitlistPromotion:true,storeId:"other",customerId:undefined})).toMatchObject({success:true});
  expect(m.join).toHaveBeenCalledWith({userId:"member",storeId:"course-a",name:"學員",customerId:"student"},input);
});
