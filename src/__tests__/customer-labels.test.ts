import {beforeEach,describe,expect,it,vi} from "vitest";
import {labelColor} from "@/lib/customer-labels";
const m=vi.hoisted(()=>({permission:vi.fn(),writable:vi.fn(),readStore:vi.fn(),validateStore:vi.fn(),writeStore:vi.fn(),feature:vi.fn(),requireFeature:vi.fn(),setting:vi.fn(),customers:vi.fn(),labels:vi.fn(),categories:vi.fn(),assignments:vi.fn(),customer:vi.fn(),label:vi.fn(),category:vi.fn(),upsert:vi.fn(),remove:vi.fn(),audit:vi.fn(),lock:vi.fn(),settingWrite:vi.fn(),labelUpdate:vi.fn(),metadataSetting:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission,requireWritablePermission:m.writable,checkPermission:async()=>true}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.readStore,validateStoreAccess:m.validateStore,resolveWriteStoreId:m.writeStore}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature,requireStoreFeature:m.requireFeature}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:()=>({storeId:"store"})}));
vi.mock("@/lib/db",()=>{const db={customerLabelSetting:{findUnique:m.setting,findUniqueOrThrow:m.metadataSetting,upsert:m.settingWrite,update:m.settingWrite},customerLabelCategory:{findMany:m.categories,findFirst:m.category},customerLabel:{findMany:m.labels,findFirst:m.label,updateMany:m.labelUpdate},customerLabelAssignment:{findMany:m.assignments,upsert:m.upsert,deleteMany:m.remove},customer:{findMany:m.customers,findFirst:m.customer},auditLog:{create:m.audit},$queryRaw:m.lock};return{prisma:{...db,$transaction:async(fn:(tx:typeof db)=>unknown)=>fn(db)}};});
import {loadCustomerLabels,setCustomerLabel,manageCustomerLabels} from "@/server/actions/customer-labels";
beforeEach(()=>{vi.resetAllMocks();const user={id:"actor",role:"OWNER",storeId:"store",staffId:"staff"};m.permission.mockResolvedValue(user);m.writable.mockResolvedValue(user);m.readStore.mockResolvedValue("store");m.writeStore.mockResolvedValue("store");m.feature.mockResolvedValue(true);m.setting.mockResolvedValue({enabled:true});m.categories.mockResolvedValue([]);m.labels.mockResolvedValue([]);m.customers.mockResolvedValue([{id:"visible"}]);m.assignments.mockResolvedValue([]);m.customer.mockResolvedValue({id:"visible"});m.label.mockResolvedValue({id:"label",categoryId:"category",active:true});m.category.mockResolvedValue({active:true});});
describe("private shared customer labels",()=>{
 it("does not query label tables for an unavailable feature",async()=>{m.feature.mockResolvedValue(false);expect((await loadCustomerLabels(["visible"])).available).toBe(false);expect(m.setting).not.toHaveBeenCalled();});
 it("loads only authorized visible customers and store-scoped assignments",async()=>{await loadCustomerLabels(["visible","foreign"]);expect(m.assignments).toHaveBeenCalledWith({where:{storeId:"store",customerId:{in:["visible"]}}});});
 it("hides assignments while disabled without deleting them",async()=>{m.setting.mockResolvedValue({enabled:false});expect((await loadCustomerLabels(["visible"])).enabled).toBe(false);expect(m.assignments).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();});
 it("rejects writes after permission denial",async()=>{m.writable.mockRejectedValue(new Error("denied"));expect((await setCustomerLabel({customerId:"visible",labelId:"label",selected:true})).success).toBe(false);expect(m.upsert).not.toHaveBeenCalled();});
 it("rejects foreign customers before changing labels",async()=>{m.customer.mockResolvedValue(null);expect((await setCustomerLabel({customerId:"foreign",labelId:"label",selected:true})).success).toBe(false);expect(m.upsert).not.toHaveBeenCalled();});
 it("rejects disabled setting and inactive tags",async()=>{m.setting.mockResolvedValue({enabled:false});expect((await setCustomerLabel({customerId:"visible",labelId:"label",selected:true})).success).toBe(false);m.setting.mockResolvedValue({enabled:true});m.label.mockResolvedValue({id:"label",categoryId:"category",active:false});expect((await setCustomerLabel({customerId:"visible",labelId:"label",selected:true})).success).toBe(false);expect(m.upsert).not.toHaveBeenCalled();});
 it("uses idempotent add and scoped remove while keeping inactive historical tags removable",async()=>{expect((await setCustomerLabel({customerId:"visible",labelId:"label",selected:true})).success).toBe(true);expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{storeId_customerId_labelId:{storeId:"store",customerId:"visible",labelId:"label"}}}));m.label.mockResolvedValue({id:"label",categoryId:"category",active:false});expect((await setCustomerLabel({customerId:"visible",labelId:"label",selected:false})).success).toBe(true);expect(m.remove).toHaveBeenCalledWith({where:{storeId:"store",customerId:"visible",labelId:"label"}});expect(m.audit).toHaveBeenCalledTimes(2);});
 it("assigns palette by immutable number, independent of category order and name",()=>{const before=labelColor(2);const category={number:2,name:"new",position:0};expect(labelColor(category.number)).toBe(before);expect(labelColor(1)).not.toBe(before);expect(labelColor(9)).toBe(labelColor(1));});
});

it("returns committed store metadata without refreshing the dashboard layout",async()=>{
 m.metadataSetting.mockResolvedValue({enabled:true});m.categories.mockResolvedValue([{id:"cat",name:"分類",number:1,position:0,active:true}]);m.labels.mockResolvedValue([]);
 const result=await manageCustomerLabels({action:"enable",enabled:true});
 expect(result).toEqual({success:true,metadata:{enabled:true,categories:[{id:"cat",name:"分類",number:1,position:0,active:true}],labels:[]}});
 expect(m.metadataSetting).toHaveBeenCalledWith({where:{storeId:"store"},select:{enabled:true}});
 expect(m.categories).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"store"}}));
 expect(m.lock).toHaveBeenCalledTimes(1);expect(m.audit).toHaveBeenCalledTimes(1);expect(m.revalidate).not.toHaveBeenCalled();
});

it("persists only a complete same-store same-category label permutation",async()=>{
 m.metadataSetting.mockResolvedValue({enabled:true});m.labels.mockResolvedValue([{id:"a"},{id:"b"}]);m.category.mockResolvedValue({id:"cat"});
 expect((await manageCustomerLabels({action:"label-order",categoryId:"cat",ids:["b","a"]})).success).toBe(true);
 expect(m.labelUpdate.mock.calls).toEqual([[{where:{storeId:"store",categoryId:"cat",id:"b"},data:{position:0}}],[{where:{storeId:"store",categoryId:"cat",id:"a"},data:{position:1}}]]);
 m.labelUpdate.mockClear();
 for(const ids of [["a","a"],["foreign","a"],["a"]])expect((await manageCustomerLabels({action:"label-order",categoryId:"cat",ids})).success).toBe(false);
 m.category.mockResolvedValue(null);expect((await manageCustomerLabels({action:"label-order",categoryId:"foreign",ids:["a","b"]})).success).toBe(false);
 expect(m.labelUpdate).not.toHaveBeenCalled();
});

it("uses validated explicit roster scope instead of a stale active store",async()=>{m.validateStore.mockResolvedValue("other");await loadCustomerLabels([],"other");expect(m.validateStore).toHaveBeenCalledWith(expect.anything(),"other","read");expect(m.categories).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"other"}}));expect(m.readStore).not.toHaveBeenCalled();});
