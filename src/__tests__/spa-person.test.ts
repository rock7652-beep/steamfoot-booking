import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),feature:vi.fn(),limit:vi.fn(),tx:vi.fn(),find:vi.fn(),create:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/server/actions/spa-resources",()=>({spaResourceStore:m.store}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature,getStoreLimitsByStoreId:m.limit}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.tx}}));
import { createSpaPerson,updateSpaPerson } from "@/server/actions/spa-person";
const input={name:"小美",phone:"",requestKey:"1d6f4811-7646-4f6a-b70d-28db88f89e8b"};
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({role:"OWNER"});m.store.mockResolvedValue("spa-test");m.feature.mockResolvedValue(undefined);m.limit.mockResolvedValue({maxStaff:null});m.find.mockResolvedValue(null);m.tx.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),staff:{findFirst:m.find,count:vi.fn().mockResolvedValue(1)},user:{create:m.create}}));});
describe("SPA scheduling-person creation",()=>{
 it("creates a store-scoped person without granting login or owner access",async()=>{const r=await createSpaPerson(input);expect(r.success).toBe(true);const data=m.create.mock.calls[0][0].data;expect(data).toMatchObject({name:"小美",email:null,passwordHash:null,status:"SUSPENDED",role:"CUSTOMER",staff:{create:{storeId:"spa-test",isOwner:false,status:"ACTIVE",spaceFeeEnabled:false,colorCode:"#0d9488"}}});expect(data.staff.create.permissions).toBeUndefined();});
 it("does not duplicate a successful retry",async()=>{m.find.mockResolvedValue({id:"existing"});expect((await createSpaPerson(input)).success).toBe(true);expect(m.create).not.toHaveBeenCalled();});
 it("rejects non-owner before creating a person",async()=>{m.permission.mockResolvedValue({role:"PARTNER"});expect((await createSpaPerson(input)).success).toBe(false);expect(m.tx).not.toHaveBeenCalled();});
 it("preserves the store's staff limit",async()=>{m.limit.mockResolvedValue({maxStaff:1});expect((await createSpaPerson(input)).success).toBe(false);expect(m.create).not.toHaveBeenCalled();});
});

describe("SPA person editing protection",()=>{
 const d={staffId:"spa-person:spa-test:person",name:"小美改名",phone:"",deactivate:true};
 function setup(bookings:{id:string}[],owner=false){const update=vi.fn(),userUpdate=vi.fn();m.tx.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),$queryRaw:vi.fn().mockResolvedValue(bookings),staff:{findFirst:vi.fn().mockResolvedValue({id:d.staffId,userId:"user",isOwner:owner,user:{status:"SUSPENDED",passwordHash:null,email:null}}),update},user:{update:userUpdate}}));return{update,userUpdate};}
 it("refuses deactivation before touching data when an unfinished booking exists",async()=>{const m=setup([{id:"booking"}]);const r=await updateSpaPerson(d);expect(r.success).toBe(false);if(!r.success)expect(r.error).toContain("1 筆");expect(m.update).not.toHaveBeenCalled();expect(m.userUpdate).not.toHaveBeenCalled();});
 it("preserves owner accounts even when the id resembles a scheduling person",async()=>{const m=setup([],true);expect((await updateSpaPerson(d)).success).toBe(false);expect(m.update).not.toHaveBeenCalled();});
 it("deactivates an unbooked scheduling person without deleting history",async()=>{const m=setup([]);expect((await updateSpaPerson(d)).success).toBe(true);expect(m.update).toHaveBeenCalledWith({where:{id:d.staffId},data:{displayName:d.name,status:"INACTIVE"}});expect(m.userUpdate).toHaveBeenCalledWith({where:{id:"user"},data:{name:d.name,phone:null}});});
});
