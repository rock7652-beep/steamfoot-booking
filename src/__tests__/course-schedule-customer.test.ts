import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),find:vi.fn(),create:vi.fn(),count:vi.fn(),audit:vi.fn(),limits:vi.fn(),lock:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access}));
vi.mock("@/server/queries/course-members",()=>({getCourseCards:vi.fn()}));
vi.mock("@/lib/shop-config",()=>({getTrialSettings:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:m.limits}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:()=>({})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:(work:(tx:unknown)=>unknown)=>work({$queryRaw:m.lock,customer:{findFirst:m.find,create:m.create,count:m.count},auditLog:{create:m.audit}})}}));
import {createScheduleCustomer} from "@/server/actions/course-schedule-enrollment";
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({storeId:"store",user:{id:"owner",role:"OWNER"}});m.limits.mockResolvedValue({maxCustomers:null});});
it("normalizes a mobile number and reuses its original customer without overwriting their name",async()=>{
  m.find.mockResolvedValue({id:"old",name:"原姓名",phone:"0912345678"});
  expect(await createScheduleCustomer({name:"另一個姓名",phone:"+886 912-345-678"})).toMatchObject({success:true,customer:{id:"old",name:"原姓名",existing:true}});
  expect(m.find.mock.calls[0][0].where).toMatchObject({storeId:"store",phone:"0912345678"});
  expect(m.create).not.toHaveBeenCalled();
});
it("rejects invalid mobile data before any customer write",async()=>{
  expect(await createScheduleCustomer({name:"小安",phone:"12345"})).toMatchObject({success:false});
  expect(m.create).not.toHaveBeenCalled();
});
it("creates and audits one new learner under the store lock",async()=>{
  m.find.mockResolvedValue(null);m.create.mockResolvedValue({id:"new",name:"小安",phone:"0912345678"});
  expect(await createScheduleCustomer({name:"小安",phone:"0912345678"})).toMatchObject({success:true,customer:{id:"new",existing:false}});
  expect(m.lock).toHaveBeenCalledTimes(1);expect(m.create).toHaveBeenCalledTimes(1);expect(m.audit).toHaveBeenCalledTimes(1);
});
