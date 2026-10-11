import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),scope:vi.fn(),guard:vi.fn(),raw:vi.fn(),write:vi.fn(),skillsDelete:vi.fn(),availabilityDelete:vi.fn(),exception:vi.fn(),bookings:vi.fn(),snapshot:vi.fn(),initial:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.scope}));
vi.mock("@/lib/industry-module-server",()=>({requireSpaStore:m.guard}));
vi.mock("@/lib/spa-schema-readiness",()=>({isSpaOperationalSchemaReady:async()=>true,isSpaCompensationSchemaReady:async()=>true}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/server/services/staff-save-snapshot",()=>({readSavedStaff:m.snapshot}));
vi.mock("@/server/services/spa-initial-staff-write",()=>({writeInitialSpaStaff:m.initial}));
vi.mock("@/lib/revalidation",()=>({revalidateStaffInRoute:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:async(work:(tx:unknown)=>unknown)=>work({$queryRaw:m.raw,$executeRaw:m.write,spaStaffSkill:{deleteMany:m.skillsDelete},spaStaffAvailability:{deleteMany:m.availabilityDelete},spaStaffAvailabilityException:{create:m.exception},spaBooking:{findMany:m.bookings}})}}));
import {saveSpaStaffConfirmed} from "@/server/actions/spa-operations";
const version="2026-10-01T00:00:00.000Z",key="11111111-1111-4111-a111-111111111111",receipt={expectedStoreId:"s",expectedVersion:version,requestKey:key,id:"p"};
beforeEach(()=>{vi.resetAllMocks();m.permission.mockResolvedValue({id:"owner",role:"OWNER",staffId:"owner",storeId:"s"});m.scope.mockResolvedValue("s");m.guard.mockResolvedValue(undefined);m.raw.mockImplementation(async(s:TemplateStringsArray)=>s.join("").includes('FROM "Staff"')?[{userId:"u",updatedAt:new Date(version)}]:[]);m.snapshot.mockResolvedValue({id:"p",displayName:"確認名稱"});m.bookings.mockResolvedValue([]);});
it("saves specialties then returns persisted authority instead of the input",async()=>{
 expect(await saveSpaStaffConfirmed({...receipt,kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:true,data:{displayName:"確認名稱"}});expect(m.initial).toHaveBeenCalledWith(expect.anything(),"s","p",expect.objectContaining({spaSkillKeys:["body"]}));expect(m.write.mock.calls[0][1]).toBe("spa-schedule:s");
});
it("rejects stale versions, switched stores and unavailable module before mutation",async()=>{
 expect(await saveSpaStaffConfirmed({...receipt,expectedVersion:null,kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:false,uncertain:false});expect(m.initial).not.toHaveBeenCalled();
 expect(await saveSpaStaffConfirmed({...receipt,expectedStoreId:"foreign",kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:false});m.guard.mockRejectedValue(Error("wrong module"));expect(await saveSpaStaffConfirmed({...receipt,kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:false});expect(m.initial).not.toHaveBeenCalled();
});
it("same-key acknowledgement retry skips all writes; another actor cannot reuse the receipt",async()=>{
 m.raw.mockResolvedValue([{actorUserId:"owner",targetId:"p",afterJson:{kind:"skills"}}]);expect(await saveSpaStaffConfirmed({...receipt,kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:true});expect(m.initial).not.toHaveBeenCalled();expect(m.skillsDelete).not.toHaveBeenCalled();
 m.raw.mockResolvedValue([{actorUserId:"foreign",targetId:"p",afterJson:{kind:"skills"}}]);expect(await saveSpaStaffConfirmed({...receipt,kind:"skills",values:{skillKeys:["body"]}})).toMatchObject({success:false});
});
it("leave conflicts are checked while holding the scheduling lock, and prevent exception creation",async()=>{
 m.bookings.mockResolvedValue([{startTime:"10:00",items:[{serviceMinutes:60,bufferMinutes:15}]}]);
 expect(await saveSpaStaffConfirmed({...receipt,kind:"exception",values:{date:"2030-10-10",type:"UNAVAILABLE",startTime:"11:00",endTime:"12:00",reason:"請假"}})).toMatchObject({success:false,uncertain:false});expect(m.exception).not.toHaveBeenCalled();
 expect(await saveSpaStaffConfirmed({...receipt,kind:"exception",values:{date:"2030-10-10",type:"UNAVAILABLE",startTime:"11:30",endTime:"12:00",reason:"請假"}})).toMatchObject({success:true});expect(m.exception).toHaveBeenCalledWith({data:expect.objectContaining({id:`spa-staff-exception:s:${key}`,storeId:"s",staffId:"p"})});
});
it("validates duplicate weekdays, overnight time ranges and percentage limits before writes",async()=>{
 for(const input of [{kind:"weekly",values:{availability:[{dayOfWeek:1,startTime:"10:00",endTime:"09:00"}]}},{kind:"weekly",values:{availability:[{dayOfWeek:1,startTime:"10:00",endTime:"18:00"},{dayOfWeek:1,startTime:"12:00",endTime:"18:00"}]}},{kind:"compensation",values:{mode:"PERCENTAGE",value:101}}])expect(await saveSpaStaffConfirmed({...receipt,...input})).toMatchObject({success:false,uncertain:false});
 expect(m.initial).not.toHaveBeenCalled();
});
