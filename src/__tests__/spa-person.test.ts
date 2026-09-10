import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),feature:vi.fn(),limit:vi.fn(),tx:vi.fn(),find:vi.fn(),create:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/server/actions/spa-resources",()=>({spaResourceStore:m.store}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature,getStoreLimitsByStoreId:m.limit}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.tx}}));
import { createSpaPerson } from "@/server/actions/spa-person";
const input={name:"小美",phone:"",colorCode:"#6366f1",requestKey:"1d6f4811-7646-4f6a-b70d-28db88f89e8b"};
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({role:"OWNER"});m.store.mockResolvedValue("spa-test");m.feature.mockResolvedValue(undefined);m.limit.mockResolvedValue({maxStaff:null});m.find.mockResolvedValue(null);m.tx.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),staff:{findFirst:m.find,count:vi.fn().mockResolvedValue(1)},user:{create:m.create}}));});
describe("SPA scheduling-person creation",()=>{
 it("creates a store-scoped person without granting login or owner access",async()=>{const r=await createSpaPerson(input);expect(r.success).toBe(true);const data=m.create.mock.calls[0][0].data;expect(data).toMatchObject({name:"小美",email:null,passwordHash:null,status:"SUSPENDED",role:"CUSTOMER",staff:{create:{storeId:"spa-test",isOwner:false,status:"ACTIVE",spaceFeeEnabled:false}}});expect(data.staff.create.permissions).toBeUndefined();});
 it("does not duplicate a successful retry",async()=>{m.find.mockResolvedValue({id:"existing"});expect((await createSpaPerson(input)).success).toBe(true);expect(m.create).not.toHaveBeenCalled();});
 it("rejects non-owner before creating a person",async()=>{m.permission.mockResolvedValue({role:"PARTNER"});expect((await createSpaPerson(input)).success).toBe(false);expect(m.tx).not.toHaveBeenCalled();});
 it("preserves the store's staff limit",async()=>{m.limit.mockResolvedValue({maxStaff:1});expect((await createSpaPerson(input)).success).toBe(false);expect(m.create).not.toHaveBeenCalled();});
});
