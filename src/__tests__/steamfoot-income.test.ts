import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),active:vi.fn(),view:vi.fn(),module:vi.fn(),finance:vi.fn(),transactions:vi.fn(),cash:vi.fn(),transaction:vi.fn(),visibility:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.active}));
vi.mock('@/lib/industry-module-server',()=>({requireSteamfootStore:m.module}));
vi.mock('@/server/inventory-finance-access',()=>({requireInventoryFinanceAccess:m.finance}));
vi.mock('@/lib/manager-visibility',()=>({getManagerReadFilter:m.visibility}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:m.view,storeIdForViewContext:(active:string,view:{storeId:string}|null)=>view?.storeId??active,userForViewContext:(u:unknown)=>u}));
import {readSteamfootIncome} from '@/server/queries/steamfoot-income';
beforeEach(()=>{
 vi.resetAllMocks();m.permission.mockResolvedValue({role:'OWNER',staffId:'staff',storeId:'store'});m.active.mockResolvedValue('store');m.view.mockResolvedValue(null);m.visibility.mockImplementation((_role,_staff,field,storeId)=>({storeId,[field]:'staff'}));
 m.transaction.mockImplementation(work=>work({transaction:{groupBy:m.transactions},cashbookEntry:{groupBy:m.cash}}));
 m.transactions.mockResolvedValue([{transactionType:'PACKAGE_PURCHASE',_sum:{amount:90000}},{transactionType:'TRIAL_PURCHASE',_sum:{amount:15000}},{transactionType:'SINGLE_PURCHASE',_sum:{amount:7000}},{transactionType:'REFUND',_sum:{amount:-8000}}]);m.cash.mockResolvedValue([{type:'INCOME',category:'零售-測試商品甲',_sum:{amount:20000}},{type:'INCOME',category:'零售-測試商品乙',_sum:{amount:20000}},{type:'INCOME',category:'其他測試收入',_sum:{amount:500}}]);
});
it('reconciles system receipts, independent refunds and cashbook income to the ledger',async()=>{
 expect(await readSteamfootIncome('store','2026-10-01','2026-10-29')).toEqual({trial:15000,single:7000,plan:90000,other:0,retail:40000,otherIncome:500,manual:40500,gross:152500,systemRefund:8000,inventoryRefund:0,inventoryReversal:0,refund:8000,net:144500});
 expect(m.transactions.mock.calls[0][0].where).toMatchObject({storeId:'store',revenueStaffId:'staff',status:'SUCCESS',createdAt:{gte:new Date('2026-09-30T16:00:00Z'),lte:new Date('2026-10-29T15:59:59.999Z')}});
 expect(m.transactions.mock.calls[0][0].where.transactionType.in).toEqual(['TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE','SUPPLEMENT','REFUND']);
 expect(m.cash.mock.calls[0][0].where.AND[0]).toMatchObject({storeId:'store',staffId:'staff'});
 expect(m.cash.mock.calls[0][0].where.AND[0].entryDate).toEqual({gte:new Date('2026-10-01T00:00:00Z'),lte:new Date('2026-10-29T00:00:00Z')});
});
it('includes a full single day and a refund even when the original sale is outside the range',async()=>{
 m.transactions.mockResolvedValue([{transactionType:'REFUND',_sum:{amount:-400}}]);m.cash.mockResolvedValue([]);
 expect(await readSteamfootIncome('store','2026-10-29','2026-10-29')).toMatchObject({gross:0,refund:400,net:-400});
 expect(m.transactions.mock.calls[0][0].where.createdAt).toEqual({gte:new Date('2026-10-28T16:00:00Z'),lte:new Date('2026-10-29T15:59:59.999Z')});
});
it.each([['2026-02-30','2026-03-01'],['2026-10-29','2026-10-01']])('rejects invalid ranges before reading money: %s to %s',async(from,to)=>{
 await expect(readSteamfootIncome('store',from,to)).rejects.toThrow();expect(m.transaction).not.toHaveBeenCalled();
});
it('does not let an HQ store view read another store',async()=>{
 m.view.mockResolvedValue({storeId:'selected'});await expect(readSteamfootIncome('store','2026-10-01','2026-10-29')).rejects.toThrow('店家已切換');expect(m.transaction).not.toHaveBeenCalled();
});
it('checks report, module and inventory-cost access before reading money',async()=>{
 m.finance.mockRejectedValue(new Error('denied'));await expect(readSteamfootIncome('store','2026-10-01','2026-10-29')).rejects.toThrow('denied');expect(m.permission).toHaveBeenCalledWith('report.read');expect(m.module).toHaveBeenCalledWith('store');expect(m.transaction).not.toHaveBeenCalled();
});

it('counts inventory goods once as retail and freight or uncategorized income as other',async()=>{
 m.transactions.mockResolvedValue([]);m.cash.mockResolvedValue([{type:'INCOME',category:'零售-商品銷售',_sum:{amount:1000}},{type:'INCOME',category:'運費收入',_sum:{amount:100}},{type:'INCOME',category:null,_sum:{amount:50}},{type:'INCOME',category:'其他收入：零售-活動',_sum:{amount:20}}]);
 expect(await readSteamfootIncome('store','2026-10-01','2026-10-29')).toMatchObject({retail:1000,otherIncome:170,manual:1170,gross:1170,net:1170});
});

it('nets inventory refunds and method-replacement reversals without including ordinary expenses',async()=>{
 m.transactions.mockResolvedValue([]);m.cash.mockResolvedValue([{type:'INCOME',category:'零售-商品銷售',_sum:{amount:2000}},{type:'EXPENSE',category:'零售-商品銷售',_sum:{amount:1000}},{type:'EXPENSE',category:'銷貨退款',_sum:{amount:200}}]);
 expect(await readSteamfootIncome('store','2026-10-01','2026-10-29')).toMatchObject({gross:2000,inventoryRefund:200,inventoryReversal:1000,refund:1200,net:800});
});
