import {expect,it} from 'vitest';
import {beautyRosterPaymentSummary,beautyRosterCanUsePlan} from '@/lib/beauty/roster-payment-summary';
const payment={reduction:750,netPrice:0,collected:0,due:0,status:'免收款'};
it('shows only the collection state while the quote retains its original price and discount',()=>{
 const row={price:750,payment};expect(beautyRosterPaymentSummary(row)).toBe('免收款');expect(row).toEqual({price:750,payment:{reduction:750,netPrice:0,collected:0,due:0,status:'免收款'}});
 expect(beautyRosterPaymentSummary({price:750,payment:{...payment,reduction:0,netPrice:750,collected:250,due:500}})).toBe('待收 NT$ 500');
 expect(beautyRosterPaymentSummary({price:750,payment:{...payment,reduction:0,netPrice:750,collected:750}})).toBe('已收 NT$ 750');
 expect(beautyRosterPaymentSummary({price:750})).toBe('待核對 NT$ 750');
});

it('shows plan completion only for an unpaid matching reserved single service',()=>{
 const row={status:'RESERVED',bookingKind:'SINGLE',sportsBalance:{available:10},service:{payment:{reduction:0,netPrice:1100,collected:0,due:1100,status:'待收款'}}};
 expect(beautyRosterCanUsePlan(row)).toBe(true);
 for(const changed of [{status:'ATTENDED'},{bookingKind:'TRIAL'},{sportsBalance:{available:0}},{service:{payment:{...row.service.payment,collected:100}}},{service:undefined}])expect(beautyRosterCanUsePlan({...row,...changed})).toBe(false);
});
