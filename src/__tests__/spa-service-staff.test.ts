import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn(),tx:vi.fn(),staffFind:vi.fn(),staffList:vi.fn(),staffCount:vi.fn(),treatments:vi.fn(),links:vi.fn(),regular:vi.fn(),exceptions:vi.fn(),bookings:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/actions/spa-resources",()=>({spaResourceStore:m.store}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:m.staffFind,findMany:m.staffList,count:m.staffCount}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:m.tx,spaTreatment:{findMany:m.treatments},spaStaffSkill:{findMany:m.links},spaStaffAvailability:{findMany:m.regular},spaStaffAvailabilityException:{findMany:m.exceptions},spaBooking:{findMany:m.bookings}}}));
import { getSpaAvailableProviders,saveSpaPersonServices,saveSpaServiceProviders } from "@/server/actions/spa-service-staff";
beforeEach(()=>{vi.clearAllMocks();m.store.mockResolvedValue("store");m.staffFind.mockResolvedValue({id:"A"});m.staffList.mockResolvedValue([{id:"A",displayName:"甲"},{id:"B",displayName:"乙"}]);});
describe("service-provider relation",()=>{
 it("removing one person's service preserves other providers and other services",async()=>{
  const create=vi.fn(),remove=vi.fn();m.tx.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),spaTreatment:{findMany:vi.fn().mockResolvedValue([{id:"T1",skills:[{skillId:"shared"}]},{id:"T2",skills:[{skillId:"shared"}]}])},spaStaffSkill:{findMany:vi.fn().mockResolvedValue([{staffId:"A",skillId:"shared"},{staffId:"B",skillId:"shared"}]),deleteMany:vi.fn(),createMany:create},spaSkill:{findUnique:vi.fn().mockResolvedValue(null),upsert:vi.fn()},spaTreatmentSkill:{deleteMany:remove,create:vi.fn()}}));
  expect((await saveSpaPersonServices({staffId:"A",treatmentIds:["T2"]})).success).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledWith({where:{storeId:"store",treatmentId:"T1"}});
  expect(create).toHaveBeenCalledWith({data:[{storeId:"store",staffId:"B",skillId:"spa-service:T1"}]});
 });
 it("rejects a provider outside the authorized store",async()=>{
  const write=vi.fn();m.staffCount.mockResolvedValue(0);m.tx.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),spaTreatment:{findFirst:vi.fn().mockResolvedValue({id:"T1"})},spaSkill:{upsert:write}}));
  expect((await saveSpaServiceProviders({treatmentId:"T1",staffIds:["other-store-person"]})).success).toBe(false);expect(write).not.toHaveBeenCalled();
 });
 it("requires all services, excludes breaks and excludes existing bookings",async()=>{
  m.staffList.mockResolvedValue(["A","B","C","D"].map(id=>({id,displayName:id})));
  m.treatments.mockResolvedValue([{id:"T1",serviceMinutes:30,bufferMinutes:0,skills:[{skillId:"S1"}]},{id:"T2",serviceMinutes:30,bufferMinutes:0,skills:[{skillId:"S2"}]}]);
  m.links.mockResolvedValue(["A","B","C","D"].flatMap(staffId=>(staffId==="B"?["S1"]:["S1","S2"]).map(skillId=>({staffId,skillId}))));
  m.regular.mockResolvedValue(["A","B","C","D"].map(staffId=>({staffId,startTime:"09:00",endTime:"18:00",isActive:true})));
  m.exceptions.mockResolvedValue([{staffId:"C",type:"UNAVAILABLE",startTime:"12:00",endTime:"13:00"}]);m.bookings.mockResolvedValue([{serviceStaffId:"D"}]);
  const result=await getSpaAvailableProviders({date:"2026-09-11",startTime:"12:00",treatmentIds:["T1","T2"]});
  expect(result).toEqual({success:true,people:[{id:"A",name:"A"}]});
 });
});
