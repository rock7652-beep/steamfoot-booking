import {expect,it} from 'vitest';
import {beautyRosterPaymentSummary} from '@/lib/beauty/roster-payment-summary';
const payment={reduction:750,netPrice:0,collected:0,due:0,status:'免收款'};
it('shows only the collection state while the quote retains its original price and discount',()=>{
 const row={price:750,payment};expect(beautyRosterPaymentSummary(row)).toBe('免收款');expect(row).toEqual({price:750,payment:{reduction:750,netPrice:0,collected:0,due:0,status:'免收款'}});
 expect(beautyRosterPaymentSummary({price:750,payment:{...payment,reduction:0,netPrice:750,collected:250,due:500}})).toBe('待收 NT$ 500');
 expect(beautyRosterPaymentSummary({price:750,payment:{...payment,reduction:0,netPrice:750,collected:750}})).toBe('已收 NT$ 750');
 expect(beautyRosterPaymentSummary({price:750})).toBe('待核對 NT$ 750');
});
