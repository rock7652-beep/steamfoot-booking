import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),rule:vi.fn(),notice:vi.fn(),booking:vi.fn(),session:vi.fn(),permission:vi.fn(),music:vi.fn(),coach:vi.fn()}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:m.rule},courseStoreNotice:{findFirst:m.notice},courseBooking:{findFirst:m.booking},courseSession:{findFirst:m.session},$queryRaw:m.coach}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:vi.fn()}));
import {loadCourseStoreNoticeTarget} from "@/server/actions/course-store-notices";
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"s",user:{role:"STAFF",staffId:"u"}});m.rule.mockResolvedValue({backendNoticesEnabled:true});m.notice.mockResolvedValue({subjectKey:"session:lesson"});m.session.mockResolvedValue({id:"lesson",nameSnapshot:"現行課程 · 83f866",startsAt:new Date("2026-10-13T02:00:00Z"),capacity:4,coachId:"t",roomId:"r",cancelledAt:null,template:{classType:"GROUP"},room:{name:"教室"}});m.coach.mockResolvedValue([{displayName:"老師",phone:null}]);m.permission.mockResolvedValue(false);});
it("checks permission, requested store and enabled setting before reading any target",async()=>{
 m.manager.mockRejectedValueOnce(new Error("forbidden"));expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n"})).toMatchObject({success:false});expect(m.notice).not.toHaveBeenCalled();
 expect(await loadCourseStoreNoticeTarget({storeId:"other",id:"n"})).toMatchObject({success:false});expect(m.notice).not.toHaveBeenCalled();
 m.rule.mockResolvedValue({backendNoticesEnabled:false});expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n"})).toMatchObject({success:false});expect(m.notice).not.toHaveBeenCalled();
});
it("resolves a saved session subject in the authorized store and returns actual permissions",async()=>{
 expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n",sessionId:"foreign"})).toMatchObject({success:true,storeId:"s",data:{id:"lesson",courseName:"現行課程",canEdit:false,canCreate:false,musicLayout:false}});
 expect(m.manager).toHaveBeenCalledWith("booking.read");expect(m.notice).toHaveBeenCalledWith({where:{id:"n",storeId:"s"},select:{subjectKey:true}});expect(m.session).toHaveBeenCalledWith(expect.objectContaining({where:{id:"lesson",storeId:"s"}}));
});
it("uses the booking's current session after rescheduling, not a snapshot time or previous booking",async()=>{
 m.notice.mockResolvedValue({subjectKey:"booking:current-booking"});m.booking.mockResolvedValue({sessionId:"current-session"});await loadCourseStoreNoticeTarget({storeId:"s",id:"n"});
 expect(m.booking).toHaveBeenCalledWith({where:{id:"current-booking",storeId:"s"},select:{sessionId:true}});expect(m.session).toHaveBeenCalledWith(expect.objectContaining({where:{id:"current-session",storeId:"s"}}));
});
it("fails closed for deleted or synthetic targets and disables editing cancelled classes",async()=>{
 m.notice.mockResolvedValue({subjectKey:"pr1296:leave"});expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n"})).toMatchObject({success:false});expect(m.session).not.toHaveBeenCalled();
 m.notice.mockResolvedValue({subjectKey:"session:gone"});m.session.mockResolvedValueOnce(null);expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n"})).toMatchObject({success:false});
 m.permission.mockResolvedValue(true);m.session.mockResolvedValueOnce({id:"lesson",nameSnapshot:"已取消課 · 83f866",startsAt:new Date(),cancelledAt:new Date(),template:{classType:"GROUP"},room:{name:"教室"}});expect(await loadCourseStoreNoticeTarget({storeId:"s",id:"n"})).toMatchObject({success:true,data:{canEdit:false,canCreate:false}});
});
