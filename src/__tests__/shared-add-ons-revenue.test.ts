import {it,expect,vi} from 'vitest';
import {readCashbookRevenue,cashbookRevenueWhere} from '@/server/queries/cashbook-revenue';
it('counts addon income once and subtracts only its generated refund without changing inventory refund totals',async()=>{
 const groupBy=vi.fn().mockResolvedValue([{type:'INCOME',category:'附加項目',_sum:{amount:80}},{type:'EXPENSE',category:'附加項目退款',_sum:{amount:30}}]);
 const result=await readCashbookRevenue({cashbookEntry:{groupBy}} as never,{storeId:'s'});
 expect(result).toMatchObject({otherIncome:80,inventoryRefund:0,inventoryReversal:0,cashbookRefund:30});
 expect(cashbookRevenueWhere.OR).toContainEqual({type:'EXPENSE',id:{startsWith:'addon:'},category:'附加項目退款'});
});
