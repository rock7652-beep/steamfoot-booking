import {expect,it} from 'vitest';
import {beautyReceiptAllocations,beautyServiceCollectionAllocation,beautySaleShare,sumBeautySaleShares} from '@/lib/beauty/receipt-allocation';
import {beautyAllocationSummary,beautySaleAllocation} from '@/lib/beauty/sale-allocation';
const sale=(id:string,amount:number)=>({id,kind:'SALE',amount,originalPaymentId:null,createdAt:'2026-10-01T01:00:00Z'});
const refund=(id:string,originalPaymentId:string,amount:number,date='2026-10-02T01:00:00Z')=>({id,kind:'REFUND',amount:-amount,originalPaymentId,createdAt:date});
it.each([
 [1000,300,0,300,700],[900,300,300,200,400],[750,150,375,75,300],
 [200,300,0,200,0],[1000,0,250,0,750],[900,300,900,0,0],[0,300,0,0,0],
])('reconciles received %i / fixed %i / refund %i to store %i / manager %i', (paid,cost,returned,store,manager)=>{
 const allocation=beautySaleAllocation(paid,cost)!;
 const rows=[sale('s',paid),...(returned?[refund('r','s',returned)]:[])];
 const ledger=beautyReceiptAllocations(rows,new Map([['s',allocation]]));
 const total=sumBeautySaleShares(rows.map(row=>({saleAllocation:beautySaleShare(row.amount,ledger.get(row.id),true)})));
 expect(total).toEqual({storeAmount:store,managerAmount:manager,unassignedAmount:0,unknownAmount:0});
 expect(store+manager).toBe(paid-returned);
});
it('uses cumulative rounding across separate refund dates and ends exactly at zero',()=>{
 const rows=[sale('s',3),refund('r1','s',1,'2026-10-02T01:00Z'),refund('r2','s',1,'2026-11-02T01:00Z'),refund('r3','s',1,'2026-12-02T01:00Z')];
 const ledger=beautyReceiptAllocations([...rows].reverse(),new Map([['s',{storeAmount:1}]]));
 expect(ledger.get('r1')).toEqual({storeAmount:0,developerAmount:-1});
 expect(ledger.get('r2')).toEqual({storeAmount:-1,developerAmount:0});
 expect(ledger.get('r3')).toEqual({storeAmount:0,developerAmount:-1});
 expect(rows.reduce((n,row)=>n+ledger.get(row.id)!.storeAmount,0)).toBe(0);
 expect(rows.reduce((n,row)=>n+ledger.get(row.id)!.developerAmount,0)).toBe(0);
});
it('does not collect the fixed fee twice and restores only reversed fixed fees after a refund',()=>{
 const rows=[sale('a',500),sale('b',500)];const frozen=new Map([['a',{storeAmount:300}],['b',{storeAmount:0}]]);
 expect(beautyServiceCollectionAllocation(500,300,[rows[0]],frozen)).toEqual({storeAmount:0,developerAmount:500,shortfall:0});
 expect(beautyServiceCollectionAllocation(500,300,[...rows,refund('r','a',500)],frozen)).toEqual({storeAmount:300,developerAmount:200,shortfall:0});
 expect(beautyServiceCollectionAllocation(500,300,[...rows,refund('r','b',500)],frozen)).toEqual({storeAmount:0,developerAmount:500,shortfall:0});
});
it('keeps missing cost and unassigned ownership separate rather than giving the remainder to the cashier',()=>{
 const rows=[sale('legacy',900),sale('known',900)];
 const ledger=beautyReceiptAllocations(rows,new Map([['known',{storeAmount:300}]]));
 expect(sumBeautySaleShares(rows.map(row=>({saleAllocation:beautySaleShare(row.amount,ledger.get(row.id),false)})))).toEqual({storeAmount:300,managerAmount:0,unassignedAmount:600,unknownAmount:900});
 expect(beautyServiceCollectionAllocation(100,300,[rows[0]],new Map())).toBeNull();
});
it.each([[-1,0],[100,101],[100,-1]])('does not project invalid frozen receipts %i / %i', (paid,storeAmount)=>{expect(beautyReceiptAllocations([sale('s',paid)],new Map([['s',{storeAmount}]] )).get('s')).toBeNull();});
it('does not project over-refunds or orphan refunds as valid distributions',()=>{
 const ledger=beautyReceiptAllocations([sale('s',100),refund('r','s',101),refund('orphan','missing',1)],new Map([['s',{storeAmount:30}]]));
 expect([...ledger.values()]).toEqual([null,null,null]);
});
it('uses the same net allocation text for operations and transaction details with explicit unknown states',()=>{
 const row={price:900,storeCostSnapshot:300,revenueStaffId:'manager',status:'CONFIRMED',refunds:[{amount:300}]};
 expect(beautyAllocationSummary(row)).toBe('店家 $200／所屬店長 $400');
 expect(beautyAllocationSummary({...row,revenueStaffId:null})).toBe('店家 $200／未歸屬 $400');
 expect(beautyAllocationSummary({...row,status:'VOIDED'})).toBe('已作廢');
 expect(beautyAllocationSummary({...row,storeCostSnapshot:null})).toContain('不回推');
 expect(beautyAllocationSummary({...row,refunds:[{amount:901}]})).toBe('分潤紀錄待核對');
});
