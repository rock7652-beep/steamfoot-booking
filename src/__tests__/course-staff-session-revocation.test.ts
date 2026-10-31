vi.mock("@/server/services/music-finance-access",()=>({canMusicFinance:async()=>true,requireMusicFinance:async()=>{},isMusicFinanceStore:async()=>false}));
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),staff:vi.fn(),module:vi.fn(),cookies:vi.fn(),headers:vi.fn()}));
vi.mock("react",()=>({cache:(fn:unknown)=>fn}));
vi.mock("next/headers",()=>({cookies:m.cookies,headers:m.headers}));
vi.mock("@/lib/auth",()=>({auth:m.auth}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:m.staff}}}));
vi.mock("@/lib/permissions",()=>({isStaffRole:(role:string)=>["OWNER","STAFF","ADMIN"].includes(role)}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/server/services/central-member-resolver",()=>({resolveCentralMemberCustomerForStore:vi.fn()}));
import {requireStaffSession} from "@/lib/session";
const user={id:"u",role:"OWNER",storeId:"s",staffId:"staff",customerId:null,storeSlug:"s"};
beforeEach(()=>{vi.resetAllMocks();m.headers.mockResolvedValue(new Headers());m.cookies.mockResolvedValue({get:()=>undefined});m.auth.mockResolvedValue({user});m.staff.mockResolvedValue(null);});
it("rechecks active course Staff on an existing session",async()=>{
 m.module.mockResolvedValue("course");
 await expect(requireStaffSession()).rejects.toThrow("工作權限已停用");
 expect(m.staff).toHaveBeenCalledWith({where:{id:"staff",userId:"u",storeId:"s",status:"ACTIVE"}});
 m.staff.mockResolvedValue({id:"staff"});await expect(requireStaffSession()).resolves.toEqual(user);
});
it.each(["steamfoot","spa"])("preserves %s work-session behavior without the course-only guard",async module=>{
 m.module.mockResolvedValue(module);await expect(requireStaffSession()).resolves.toEqual(user);expect(m.staff).not.toHaveBeenCalled();
});
it("keeps headquarters sessions independent of a store coach record",async()=>{
 m.auth.mockResolvedValue({user:{...user,role:"ADMIN",storeId:null}});await expect(requireStaffSession()).resolves.toMatchObject({role:"ADMIN"});expect(m.module).not.toHaveBeenCalled();
});

import {withReadRequestMemo,rememberVerifiedStaffRead} from "@/server/services/read-request-memo";
const verified={userId:"u",role:"OWNER",staffId:"staff",storeId:"s",industryModule:"COURSE"};
it("uses the current auth database check only inside one explicit read and rechecks the next request",async()=>{
 m.module.mockResolvedValue("course");
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead(verified);await expect(requireStaffSession()).resolves.toEqual(user);});
 expect(m.staff).not.toHaveBeenCalled();
 await expect(withReadRequestMemo(requireStaffSession)).rejects.toThrow("工作權限已停用");
 expect(m.staff).toHaveBeenCalledOnce();
});
it.each([{userId:"another"},{role:"STAFF"},{staffId:"another"},{storeId:"another"}])("requires an exact authenticated actor and store match: %j",async mismatch=>{
 m.module.mockResolvedValue("course");
 await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead({...verified,...mismatch});return requireStaffSession();})).rejects.toThrow("工作權限已停用");
 expect(m.staff).toHaveBeenCalledOnce();
});
