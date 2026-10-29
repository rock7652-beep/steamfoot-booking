import {beforeEach,expect,it,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {AppError} from '@/lib/errors';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({transactions:vi.fn(),cash:vi.fn(),finance:vi.fn(),permission:vi.fn(),feature:vi.fn(),view:vi.fn(),module:vi.fn()}));
const user={id:'owner',role:'OWNER',staffId:'staff',storeId:'store'};
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:async()=>({id:'store'})},transaction:{groupBy:async()=>[]},cashbookEntry:{groupBy:async()=>[]},spaceFeeRecord:{findMany:async()=>[]},booking:{groupBy:async()=>[]},staff:{findMany:async()=>[]},$transaction:async(work:(tx:unknown)=>unknown)=>work({transaction:{findMany:m.transactions},cashbookEntry:{findMany:m.cash},store:{findUniqueOrThrow:async()=>({name:'測試店'})}})}}));
vi.mock('@/lib/auth',()=>({auth:async()=>({user:{id:'owner',role:'OWNER',staffId:'staff',storeId:'store'}})}));
vi.mock('@/lib/usage-gate',()=>({checkReportLimit:()=>({allowed:true})}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>({id:'owner',role:'OWNER',staffId:'staff',storeId:'store'})}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'store'})})}));
vi.mock('@/lib/store',()=>({resolveActiveStoreId:async()=> 'store'}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/data-export-gate',()=>({requireDataExportFeature:async()=>null}));
vi.mock('@/lib/manager-visibility',()=>({getManagerReadFilter:(_r:unknown,_s:unknown,_f:unknown,storeId:string)=>({storeId}),getStoreFilter:()=>({storeId:'store'})}));
vi.mock('@/lib/industry-module-server',()=>({requireSteamfootStore:async()=>{},getStoreIndustryModule:m.module}));
vi.mock('@/server/inventory-finance-access',()=>({requireInventoryFinanceAccess:m.finance,canReadInventoryFinance:async()=>true}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:m.view,storeIdForViewContext:(s:string)=>s,userForViewContext:(u:unknown)=>u}));
import {getSteamfootRevenueReport} from '@/server/queries/steamfoot-revenue-report';
import {GET as staffApi} from '@/app/api/reports/coach-revenue/route';
import {GET as api} from '@/app/api/reports/store-revenue/route';
import {GET as monthlyCsv} from '@/app/api/export/store-monthly/route';
import {GET as excel} from '@/app/api/reports/export/route';
const filters={startDate:'2026-10-01',endDate:'2026-10-29',storeFilter:{storeId:'store'}};
const payment=(id:string,type:string,amount:number)=>({id,transactionType:type,amount,planType:'PACKAGE',planNameSnapshot:'十次方案',customerId:'customer',customer:{name:'私人姓名',phone:'0900000000'},revenueStaffId:'staff',revenueStaff:{displayName:'店長',user:{role:'OWNER'}},soldByStaff:{displayName:'店長'},paymentMethod:'CASH',paymentSplits:[],createdAt:new Date('2026-10-01T02:00:00Z'),transactionDate:new Date('2026-09-01T00:00:00Z'),isFirstPurchase:false,note:'私人備註'});
const cash=(id:string,category:string,type:string,amount:number)=>({id,category,type,amount,entryDate:new Date('2026-10-29T00:00:00Z'),createdAt:new Date('2026-10-29T02:00:00Z'),customerId:'customer',customer:{name:'私人姓名',phone:'0900000000'},staffId:'staff',staff:{displayName:'店長',user:{role:'OWNER'}},createdBy:{name:'店長'},paymentMethod:'OTHER',note:'私人備註'});
beforeEach(()=>{
 vi.resetAllMocks();m.permission.mockResolvedValue(true);m.feature.mockResolvedValue(true);m.view.mockResolvedValue(null);m.module.mockResolvedValue('steamfoot');
 m.transactions.mockResolvedValue([payment('sale','PACKAGE_PURCHASE',1000),payment('refund','REFUND',-100)]);
 m.cash.mockResolvedValue([cash('inventory:first:goods','零售-商品銷售','INCOME',500),cash('inventory:replacement:goods','零售-商品銷售','INCOME',500),cash('inventory:change:correction:goods','零售-商品銷售','EXPENSE',500),cash('inventory:return:refund','銷貨退款','EXPENSE',200),cash('manual:one','其他收入','INCOME',50)]);
});
it('nets original receipts, replacements, corrections and later refunds once',async()=>{
 const report=await getSteamfootRevenueReport('store',filters,{customers:true,reader:user as never});
 expect(report.kpi).toMatchObject({totalRevenue:2050,refundAmount:800,netRevenue:1250});expect(report.data.reduce((n,r)=>n+r.netAmount,0)).toBe(1250);
 expect(report.classification).toEqual({trial:0,single:0,plan:1000,supplement:0,retail:1000,other:50});
 expect(report.data.find(r=>r.id==='sale')?.transactionDate).toBe('2026-10-01');
 expect(report.data.find(r=>r.receiptKind==='CORRECTION')).toMatchObject({netAmount:-500,receiptSource:'INVENTORY'});
 expect(m.transactions.mock.calls[0][0].where.createdAt.lte).toEqual(new Date('2026-10-29T15:59:59.999Z'));
 expect(m.cash.mock.calls[0][0].where.entryDate).toEqual({gte:new Date('2026-10-01T00:00:00Z'),lte:new Date('2026-10-29T00:00:00Z')});
});
it('redacts customer identities and notes while retaining financial source IDs',async()=>{
 const report=await getSteamfootRevenueReport('store',filters,{customers:false,reader:user as never});
 expect(JSON.stringify(report)).not.toContain('私人');expect(report.data.every(r=>r.customerId===null&&r.note===null)).toBe(true);expect(report.data.find(r=>r.sourceId==='inventory:return:refund')).toBeDefined();
});
it('filters mixed payments by the matching split rather than the full sale',async()=>{
 m.transactions.mockResolvedValue([{...payment('mixed','PACKAGE_PURCHASE',1000),paymentSplits:[{paymentMethod:'CASH',amount:300},{paymentMethod:'TRANSFER',amount:700}]}]);m.cash.mockResolvedValue([]);
 expect((await getSteamfootRevenueReport('store',{...filters,paymentMethod:'TRANSFER'},{customers:false,reader:user as never})).kpi.netRevenue).toBe(700);
});
it('returns the same net through the selected-store report API',async()=>{
 const response=await api(new NextRequest('https://local/api/reports/store-revenue?startDate=2026-10-01&endDate=2026-10-29&level=all'));
 expect(response.status).toBe(200);const body=await response.json();expect(body.kpi.netRevenue).toBe(1250);expect(body.details.data.reduce((n:number,r:{netAmount:number})=>n+r.netAmount,0)).toBe(1250);
});
it('exports an actual workbook whose summary, classification and source details reconcile',async()=>{
 const response=await excel(new NextRequest('https://local/api/reports/export?startDate=2026-10-01&endDate=2026-10-29&reportType=store&level=all'));
 expect(response.status).toBe(200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
 expect(workbook.worksheets.map(s=>s.name)).toEqual(['收入總表','收入分類','收退款明細']);
 expect(workbook.getWorksheet('收入總表')!.getRow(2).getCell(4).value).toBe(1250);
 const classification=workbook.getWorksheet('收入分類')!;expect(classification.getRow(classification.rowCount).getCell(2).value).toBe(1250);
 let sum=0;workbook.getWorksheet('收退款明細')!.eachRow((row,n)=>{if(n>1)sum+=Number(row.getCell(9).value);});expect(sum).toBe(1250);
 expect(JSON.stringify(workbook.getWorksheet('收退款明細')!.getSheetValues())).toContain('收款更正沖回');
});
it('blocks export without permission and in HQ view mode',async()=>{
 m.permission.mockResolvedValue(false);expect((await excel(new NextRequest('https://local/api/reports/export?startDate=2026-10-01&endDate=2026-10-29'))).status).toBe(403);
 m.permission.mockResolvedValue(true);m.view.mockResolvedValue({isViewMode:true});expect((await excel(new NextRequest('https://local/api/reports/export?startDate=2026-10-01&endDate=2026-10-29'))).status).toBe(403);expect(m.transactions).not.toHaveBeenCalled();
});

it('adds the same store receipt net and retail classification to the monthly CSV',async()=>{
 const response=await monthlyCsv(new NextRequest('https://local/api/export/store-monthly?month=2026-10'));
 expect(response.status).toBe(200);const csv=await response.text();expect(csv).toContain('淨收款,1250');expect(csv).toContain('零售收入,1000');expect(csv).toContain('退款／沖回,800');
});

it('keeps staff summaries and their workbook on the same source receipts',async()=>{
 const response=await staffApi(new NextRequest('https://local/api/reports/coach-revenue?startDate=2026-10-01&endDate=2026-10-29&level=all'));expect(response.status).toBe(200);const body=await response.json();expect(body.kpi.netRevenue).toBe(1250);expect(body.summary.reduce((n:number,r:{netRevenue:number})=>n+r.netRevenue,0)).toBe(1250);
 const exported=await excel(new NextRequest('https://local/api/reports/export?startDate=2026-10-01&endDate=2026-10-29&reportType=coach&level=all'));expect(exported.status).toBe(200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()) as never);expect(workbook.worksheets[0].getRow(2).getCell(6).value).toBe(1250);
});

it('keeps a later inventory refund in its own period without pulling in the old receipt',async()=>{
 m.transactions.mockResolvedValue([]);m.cash.mockResolvedValue([cash('inventory:return:refund','銷貨退款','EXPENSE',200)]);
 const report=await getSteamfootRevenueReport('store',filters,{customers:false,reader:user as never});expect(report.kpi).toMatchObject({totalRevenue:0,refundAmount:200,netRevenue:-200});expect(report.data).toHaveLength(1);
});
it('returns a permission error instead of an empty or partial financial report',async()=>{
 m.finance.mockRejectedValue(new AppError('FORBIDDEN','無完整財務檢視權限'));
 expect((await api(new NextRequest('https://local/api/reports/store-revenue?startDate=2026-10-01&endDate=2026-10-29'))).status).toBe(403);
 expect((await excel(new NextRequest('https://local/api/reports/export?startDate=2026-10-01&endDate=2026-10-29'))).status).toBe(403);expect(m.transactions).not.toHaveBeenCalled();
});
