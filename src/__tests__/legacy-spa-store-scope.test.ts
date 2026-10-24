import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({many:vi.fn(),one:vi.fn(),header:vi.fn(),cookie:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{store:{findMany:m.many,findUnique:m.one}}}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:async()=>false}));
vi.mock("react",()=>({cache:<T>(fn:T)=>fn}));
vi.mock("next/headers",()=>({headers:async()=>({get:m.header}),cookies:async()=>({get:m.cookie})}));
import {getAccessibleStores,getAllActiveStoreIds,validateStoreAccess,getActiveStoreForRead} from "@/lib/store";
const data=[{id:"beauty",slug:"beauty",name:"Beauty",industryModule:"BEAUTY",isDefault:false,parentStoreId:null},{id:"old",slug:"old",name:"Old",industryModule:"SPA",isDefault:false,parentStoreId:null},{id:"steam",slug:"steam",name:"Steam",industryModule:"STEAMFOOT",isDefault:false,parentStoreId:null},{id:"sport",slug:"sport",name:"Sport",industryModule:"COURSE",isDefault:false,parentStoreId:null},{id:"music",slug:"music",name:"Music",industryModule:"COURSE",isDefault:false,parentStoreId:null}];
beforeEach(()=>{
 vi.resetAllMocks();
 m.many.mockImplementation(async({where}:{where:{id?:string;industryModule?:{not?:string;in?:string[]}}})=>data.filter(row=>(!where.id||where.id===row.id)&&(!where.industryModule?.not||row.industryModule!==where.industryModule.not)&&(!where.industryModule?.in||where.industryModule.in.includes(row.industryModule))));
});
it("excludes legacy SPA from HQ selectors and background-job enumeration",async()=>{
 expect((await getAccessibleStores({role:"ADMIN"})).map(s=>s.id)).toEqual(["beauty","steam","sport","music"]);
 expect(await getAllActiveStoreIds()).toEqual(["beauty","steam","sport","music"]);
 expect(m.many.mock.calls[1][0].where.industryModule).toEqual({not:"SPA"});
});
it.each(["read","write","switch"] as const)("refuses %s access even for the legacy store's own owner",async(mode)=>{
 await expect(validateStoreAccess({role:"OWNER",storeId:"old"},"old",mode)).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("refuses an HQ cookie pointing at the old SPA store",async()=>{
 m.cookie.mockImplementation((name:string)=>name==="active-store-id"?{value:"old"}:undefined);
 await expect(getActiveStoreForRead({role:"ADMIN"})).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("refuses direct scoped routes to legacy SPA before the own-store shortcut",async()=>{
 m.header.mockImplementation((name:string)=>name==="x-next-pathname"?"/s/old/admin/dashboard":name==="x-store-slug"?"old":null);
 m.one.mockResolvedValue({...data[0],operatingStatus:"ACTIVE"});
 await expect(getActiveStoreForRead({role:"OWNER",storeId:"old"})).rejects.toMatchObject({code:"FORBIDDEN"});
});
it.each(["beauty","steam","sport","music"])("retains the authorized %s store's own read access",async(id)=>{
 expect(await validateStoreAccess({role:"OWNER",storeId:id},id,"read")).toBe(id);
});
