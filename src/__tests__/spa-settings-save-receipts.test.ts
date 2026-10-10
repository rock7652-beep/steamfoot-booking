import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({transaction:vi.fn(),permission:vi.fn(),store:vi.fn(),module:vi.fn(),locationFind:vi.fn(),locationCreate:vi.fn(),locationUpdate:vi.fn(),serviceFind:vi.fn(),serviceCreate:vi.fn(),serviceUpdate:vi.fn(),packageFind:vi.fn(),packageCreate:vi.fn(),packageUpdate:vi.fn(),links:vi.fn(),people:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store,getActiveStoreForRead:m.store}));
vi.mock("@/lib/industry-module-server",()=>({requireSpaStore:m.module}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:vi.fn(),count:async()=>0,findMany:m.people},storeModuleInstallation:{findUnique:async()=>({status:"ACTIVE"})}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:m.transaction}}));
import {saveSpaLocation} from "@/server/actions/spa-resources";
import {saveSpaServiceDetails} from "@/server/actions/spa-service-staff";
import {saveSpaPackage} from "@/server/actions/spa-commerce";
import {spaLocationRevision,spaServiceRevision} from "@/lib/spa-settings-save";
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
const location={name:"床",isActive:true,treatmentIds:[]};
const service={baseName:"護理",variantLabel:"",price:100,serviceMinutes:60,bufferMinutes:0,isActive:true,publicVisible:false,staffIds:[],locationIds:[]};
const pkg={name:"方案",treatmentId:"S",price:100,uses:10,validityDays:180,isActive:true,publicVisible:false};
beforeEach(()=>{
 vi.resetAllMocks();m.permission.mockResolvedValue({id:"user",role:"ADMIN"});m.store.mockResolvedValue("store");m.people.mockResolvedValue([]);m.links.mockResolvedValue([]);
 m.locationFind.mockResolvedValue(null);m.serviceFind.mockResolvedValue(null);m.packageFind.mockResolvedValue(null);
 const create=async ({data}:{data:Record<string,unknown>})=>({...data,updatedAt:new Date("2026-10-10T00:00:00Z")});m.locationCreate.mockImplementation(create);m.serviceCreate.mockImplementation(create);m.packageCreate.mockImplementation(create);
 m.transaction.mockImplementation(async work=>work({$executeRaw:vi.fn(),spaTreatment:{count:async()=>0,findFirst:m.serviceFind,create:m.serviceCreate,update:m.serviceUpdate},spaServiceLocation:{count:async()=>0,findFirst:m.locationFind,create:m.locationCreate,update:m.locationUpdate},spaTreatmentServiceLocation:{deleteMany:vi.fn(),createMany:vi.fn()},spaSkill:{findUnique:async()=>null,upsert:vi.fn()},spaTreatmentSkill:{deleteMany:vi.fn(),create:vi.fn()},spaStaffSkill:{findMany:m.links,deleteMany:vi.fn(),createMany:vi.fn()},spaPackage:{findFirst:m.packageFind,create:m.packageCreate,update:m.packageUpdate}}));
});
it("returns committed locations and confirms the same-key retry without inserting twice",async()=>{
 const first=await saveSpaLocation({...location,receipt});expect(first.success).toBe(true);if(!first.success)throw new Error("save failed");
 expect(first.data).toMatchObject({id:expect.stringMatching(/^location_/),name:"床",revision:spaLocationRevision(location)});
 m.locationFind.mockResolvedValue({...first.data,storeId:"store",treatments:[]});
 expect(await saveSpaLocation({...location,receipt})).toEqual(first);expect(m.locationCreate).toHaveBeenCalledTimes(1);
 expect((await saveSpaLocation({...location,name:"另一床",receipt})).success).toBe(false);
});
it("returns committed services and rejects changed content on a same-key retry",async()=>{
 const first=await saveSpaServiceDetails({...service,receipt});expect(first.success).toBe(true);if(!first.success||!first.data)throw new Error("save failed");
 expect(first.data).toMatchObject({name:"護理",baseName:"護理",price:100,revision:spaServiceRevision(service)});
 m.serviceFind.mockResolvedValue({...first.data,storeId:"store",name:first.data.baseName,skills:[],serviceLocations:[]});
 expect(await saveSpaServiceDetails({...service,receipt})).toEqual(first);expect(m.serviceCreate).toHaveBeenCalledTimes(1);
 expect((await saveSpaServiceDetails({...service,price:200,receipt})).success).toBe(false);
});
it("returns committed packages and keeps a retry idempotent",async()=>{
 m.serviceFind.mockResolvedValue({id:"S"});const first=await saveSpaPackage({...pkg,receipt});expect(first.success).toBe(true);if(!first.success||!first.data)throw new Error("save failed");
 expect(first.data).toMatchObject({price:100,updatedAt:"2026-10-10T00:00:00.000Z"});
 m.packageFind.mockResolvedValue({...first.data,storeId:"store",updatedAt:new Date(first.data.updatedAt)});
 expect(await saveSpaPackage({...pkg,receipt})).toEqual(first);expect(m.packageCreate).toHaveBeenCalledTimes(1);
 expect((await saveSpaPackage({...pkg,uses:20,receipt})).success).toBe(false);
});
it("rejects stale edits and changed stores before writing",async()=>{
 m.locationFind.mockResolvedValue({id:"L",storeId:"store",name:"新名稱",isActive:true,treatments:[]});
 expect((await saveSpaLocation({...location,id:"L",receipt:{...receipt,expectedRevision:spaLocationRevision(location)}})).success).toBe(false);expect(m.locationUpdate).not.toHaveBeenCalled();
 m.serviceFind.mockResolvedValue({...service,id:"S",name:service.baseName,skills:[],serviceLocations:[],price:200});
 expect((await saveSpaServiceDetails({...service,id:"S",receipt:{...receipt,expectedRevision:spaServiceRevision(service)}})).success).toBe(false);expect(m.serviceUpdate).not.toHaveBeenCalled();
 m.packageFind.mockResolvedValue({...pkg,id:"P",updatedAt:new Date("2026-10-10T00:00:00Z"),uses:20});
 expect((await saveSpaPackage({...pkg,id:"P",expectedUpdatedAt:"2026-10-09T00:00:00.000Z",receipt})).success).toBe(false);expect(m.packageUpdate).not.toHaveBeenCalled();
 m.transaction.mockClear();const wrong={...receipt,expectedStoreId:"other"};
 expect((await saveSpaLocation({...location,receipt:wrong})).success).toBe(false);
 expect((await saveSpaServiceDetails({...service,receipt:wrong})).success).toBe(false);
 expect((await saveSpaPackage({...pkg,receipt:wrong})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("does not turn a committed save into failure when cache marking fails",async()=>{
 m.revalidate.mockImplementation(()=>{throw new Error("cache failed");});
 expect(await saveSpaLocation({...location,receipt})).toMatchObject({success:true,syncWarning:true,data:{name:"床"}});
});
