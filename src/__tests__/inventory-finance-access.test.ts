import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),feature:vi.fn(),first:vi.fn(),session:vi.fn(),list:vi.fn(),count:vi.fn(),group:vi.fn(),snapshot:vi.fn()}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.session}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:async()=>null,userForViewContext:(u:unknown)=>u,storeIdForViewContext:(id:unknown)=>id}));
vi.mock("@/lib/manager-visibility",()=>({getManagerReadFilter:(_r:unknown,_s:unknown,_f:unknown,id:unknown)=>({storeId:id})}));
vi.mock("@/lib/db",()=>({prisma:{cashbookEntry:{findFirst:m.first,findMany:m.list,count:m.count,groupBy:m.group},reportSnapshot:{findUnique:m.snapshot}}}));
import {canReadInventoryFinance,requireInventoryFinanceAccess,inventoryCashbookReadFilter,inventoryPurchaseCashbookWhere} from "@/server/inventory-finance-access";
import {listCashbookEntries,getDailySummary,getMonthlySummary} from "@/server/queries/cashbook";
import {getReportSnapshot,getReportSnapshotWithMeta} from "@/server/queries/report-snapshot";
const employee={role:"OWNER" as const,staffId:"employee",storeId:"staging-store"};
beforeEach(()=>{vi.resetAllMocks();m.permission.mockResolvedValue(false);m.feature.mockResolvedValue(true);m.first.mockResolvedValue(null);m.session.mockResolvedValue(employee);m.list.mockResolvedValue([]);m.count.mockResolvedValue(0);m.group.mockResolvedValue([]);});
it("denies full finance even before the first purchase in an inventory store",async()=>{expect(await canReadInventoryFinance("staging-store",employee)).toBe(false);await expect(requireInventoryFinanceAccess("staging-store",employee)).rejects.toMatchObject({code:"FORBIDDEN"});expect(m.first).not.toHaveBeenCalled();});
it("honors an explicit cost grant and keeps complete finance available",async()=>{m.permission.mockResolvedValue(true);expect(await canReadInventoryFinance("staging-store",employee)).toBe(true);expect(await inventoryCashbookReadFilter(employee)).toEqual({});expect(m.feature).not.toHaveBeenCalled();});
it("protects historical purchases when inventory is disabled",async()=>{m.feature.mockResolvedValue(false);m.first.mockResolvedValue({id:"inventory:old:goods"});expect(await canReadInventoryFinance("staging-store",employee)).toBe(false);expect(m.first).toHaveBeenCalledWith({where:{storeId:"staging-store",AND:[inventoryPurchaseCashbookWhere]},select:{id:true}});});
it("preserves ordinary finance in stores without inventory or historic purchases",async()=>{m.feature.mockResolvedValue(false);expect(await canReadInventoryFinance("ordinary-store",employee)).toBe(true);});
it("does not query unscoped historic finance without a store",async()=>{expect(await canReadInventoryFinance(null,employee)).toBe(false);expect(m.first).not.toHaveBeenCalled();});
it("filters purchase records before both pagination and count, preserving other filters",async()=>{await listCashbookEntries({activeStoreId:"staging-store",keyword:"零售",page:2,pageSize:5});const where=m.list.mock.calls[0][0].where;expect(where.storeId).toBe("staging-store");expect(where.AND).toContainEqual(await inventoryCashbookReadFilter(employee));expect(where.AND).toHaveLength(2);expect(m.list.mock.calls[0][0]).toMatchObject({skip:5,take:5});expect(m.count).toHaveBeenCalledWith({where});});
it("rejects daily/monthly aggregates before reading amounts rather than returning partial balances",async()=>{await expect(getDailySummary("2026-10-05","staging-store")).rejects.toMatchObject({code:"FORBIDDEN"});await expect(getMonthlySummary("2026-10","staging-store")).rejects.toMatchObject({code:"FORBIDDEN"});expect(m.list).not.toHaveBeenCalled();expect(m.group).not.toHaveBeenCalled();});
it("blocks cached report snapshots too",async()=>{await expect(getReportSnapshot("staging-store","2026-10","summary")).rejects.toMatchObject({code:"FORBIDDEN"});await expect(getReportSnapshotWithMeta("staging-store","2026-10","summary")).rejects.toMatchObject({code:"FORBIDDEN"});expect(m.snapshot).not.toHaveBeenCalled();});
it("authorized summaries keep real recorded totals intact",async()=>{m.permission.mockResolvedValue(true);m.group.mockResolvedValue([{type:"INCOME",_sum:{amount:1120},_count:{id:1}},{type:"EXPENSE",_sum:{amount:400},_count:{id:1}}]);expect(await getMonthlySummary("2026-10","staging-store")).toMatchObject({income:1120,expense:400,net:720});expect(m.group.mock.calls[0][0].where).not.toHaveProperty('NOT');});

it("keeps nullable categories and inventory sale receipts readable",async()=>{
 const filter=await inventoryCashbookReadFilter(employee);
 expect(filter).toEqual({AND:[{OR:[{type:{not:"EXPENSE"}},{id:{not:{startsWith:"inventory:"}}}]},{OR:[{category:null},{category:{not:"進銷存進貨"}}]}]});
});
