import {expect,it} from 'vitest';
import {purchaseOrder,sumItemBalances} from '@/lib/item-entitlement';
it('先買先扣：不按到期時間、卡建立順序或商品名稱排序',()=>{
 const a={id:'a1',createdAt:new Date('2026-10-20'),expiresAt:new Date('2027-12-31')};
 const b={id:'a2',createdAt:new Date('2026-01-01'),expiresAt:new Date('2026-12-31')};
 const cards=[b,a];
 expect(purchaseOrder(cards,[{cardId:'a1',createdAt:new Date('2026-01-01')},{cardId:'a2',createdAt:new Date('2026-02-01')}]).map(c=>c.id)).toEqual(['a1','a2']);
 expect(cards[0]).toBe(b);
});
it('同時購買以固定識別碼排序；來源不明只回退可追溯卡建立時間',()=>{
 const date=new Date('2026-01-01');
 expect(purchaseOrder([{id:'b',createdAt:date},{id:'a',createdAt:date}],[]).map(c=>c.id)).toEqual(['a','b']);
});
it('本期剩餘累計A1+A2，共卡不重複，點數與堂數分開',()=>{
 const row={cost:1,unit:'SESSION',planName:'A'};
 const a={...row,id:'a1',remaining:2,available:1};
 expect(sumItemBalances([a,{...row,id:'a2',remaining:10,available:10},a,{...row,id:'points',remaining:100,available:90,unit:'POINT',cost:20}])).toEqual([
 {remaining:12,available:11,cost:1,unit:'SESSION',planName:'同項目方案合計'},
 {remaining:100,available:90,cost:20,unit:'POINT',planName:'同項目方案合計'}]);
});
