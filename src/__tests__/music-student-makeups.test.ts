import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),permission:vi.fn(),customer:vi.fn(),music:vi.fn(),workspace:vi.fn(),context:vi.fn(),write:vi.fn(),tx:vi.fn(),schedule:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.read,courseManager:m.write,courseTransaction:m.tx}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer},storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:()=>({assignedStaffId:"manager"})}));
vi.mock("@/server/services/music-data-scope",()=>({musicCustomerWhere:()=>({isTest:false})}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:m.context}));
vi.mock("@/server/queries/music-leave-workspace",()=>({getMusicLeaveWorkspace:m.workspace}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:async()=>({maxMonthlyBookings:500})}));
vi.mock("@/server/services/music-student-makeup-schedule",()=>({scheduleMusicStudentMakeup:m.schedule}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {loadMusicStudentMakeups,createMusicStudentMakeupSchedule} from "@/server/actions/music-student-makeups";
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue({storeId:"store",user:{id:"u",role:"MANAGER",staffId:"manager"}});m.permission.mockResolvedValue(true);m.customer.mockResolvedValue({id:"learner",name:"測試學員"});m.music.mockResolvedValue({storeId:"store"});m.context.mockResolvedValue(null);m.workspace.mockResolvedValue({rows:[],truncated:false,sessionsTruncated:false});});
it("loads only one visible learner in the authorized store and scope",async()=>{expect(await loadMusicStudentMakeups("learner","operational")).toMatchObject({success:true,data:{canArrange:true,customerName:"測試學員"}});expect(m.read).toHaveBeenCalledWith("booking.read");expect(m.customer.mock.calls[0][0].where).toMatchObject({id:"learner",storeId:"store",assignedStaffId:"manager",mergedIntoCustomerId:null,AND:[{isTest:false}]});expect(m.workspace).toHaveBeenCalledWith("store",[{id:"learner",name:"測試學員"}],"operational");});
it("does not expose another learner or query all customers",async()=>{m.customer.mockResolvedValue(null);expect(await loadMusicStudentMakeups("other")).toMatchObject({success:false});expect(m.workspace).not.toHaveBeenCalled();});
it("hides the widget without the existing wallet and customer permissions",async()=>{m.permission.mockResolvedValue(false);expect(await loadMusicStudentMakeups("learner")).toEqual({success:true,data:null});expect(m.customer).not.toHaveBeenCalled();expect(m.workspace).not.toHaveBeenCalled();});
it("keeps preview-only access and read-only staff from arranging",async()=>{m.context.mockResolvedValue({isViewMode:true});expect(await loadMusicStudentMakeups("learner")).toMatchObject({success:true,data:{canArrange:false}});m.permission.mockImplementation(async (_r:string,_s:string,p:string)=>p!=="booking.create");m.context.mockResolvedValue(null);expect(await loadMusicStudentMakeups("learner")).toMatchObject({success:true,data:{canArrange:false}});});

const scheduleInput={customerId:"learner",sourceId:"leave",date:"2099-11-20",time:"18:00",roomId:"room",coachId:"teacher",requestKey:"00000000-0000-4000-8000-000000000001"};
it("authorizes the write store and creates the session and booking inside the shared transaction",async()=>{
 m.write.mockResolvedValue({storeId:"store",user:{id:"u",role:"MANAGER",staffId:"manager"}});m.workspace.mockResolvedValue({rows:[{id:"leave",cardId:"card"}],truncated:false});m.tx.mockImplementation(async(_s,work)=>work("transaction"));m.schedule.mockResolvedValue({sessionId:"new",bookingId:"new-booking"});
 expect(await createMusicStudentMakeupSchedule(scheduleInput)).toMatchObject({success:true,data:{sessionId:"new"}});expect(m.write).toHaveBeenCalledWith("booking.create");expect(m.tx).toHaveBeenCalledWith("store",expect.any(Function));expect(m.schedule).toHaveBeenCalledWith("transaction",{storeId:"store",userId:"u",name:"店長"},expect.objectContaining({sourceId:"leave",cardId:"card",customerId:"learner"}),500);
});
it("does not write through a read-only preview or a missing learner scope",async()=>{
 m.write.mockResolvedValue({storeId:"store",user:{id:"u",role:"MANAGER",staffId:"manager"}});m.workspace.mockResolvedValue({rows:[{id:"leave",cardId:"card"}],truncated:false});m.context.mockResolvedValue({isViewMode:true});expect(await createMusicStudentMakeupSchedule(scheduleInput)).toMatchObject({success:false});expect(m.tx).not.toHaveBeenCalled();
});
it("returns a failure from the transaction when reservation fails, without reporting a successful lesson",async()=>{
 m.write.mockResolvedValue({storeId:"store",user:{id:"u",role:"MANAGER",staffId:"manager"}});m.workspace.mockResolvedValue({rows:[{id:"leave",cardId:"card"}],truncated:false});m.tx.mockRejectedValue(new Error("reservation failed"));expect(await createMusicStudentMakeupSchedule(scheduleInput)).toMatchObject({success:false});
});
