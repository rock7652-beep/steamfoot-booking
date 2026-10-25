import {expect,it} from 'vitest';
import {beautySaleAllocation,beautyAllocationAfterRefund} from '@/lib/beauty/sale-allocation';
it('freezes store fixed fee and remainder, without treating unset costs as zero',()=>{expect(beautySaleAllocation(900,300)).toEqual({storeAmount:300,developerAmount:600,shortfall:0});expect(beautySaleAllocation(200,300)).toEqual({storeAmount:200,developerAmount:0,shortfall:100});expect(beautySaleAllocation(900,null)).toBeNull();});
it('reverses allocations cumulatively without rounding drift',()=>{expect(beautyAllocationAfterRefund(900,300,300)).toEqual({storeAmount:200,developerAmount:400});expect(beautyAllocationAfterRefund(900,300,900)).toEqual({storeAmount:0,developerAmount:0});});

it('selects the trial override only for trial service and reverses its frozen allocation on refund',async()=>{
 const {beautyServiceStoreCost}=await import('@/lib/beauty/sale-allocation');
 expect(beautyServiceStoreCost({storeCost:300,trialStoreCost:150},false)).toBe(300);
 expect(beautyServiceStoreCost({storeCost:300,trialStoreCost:150},true)).toBe(150);
 expect(beautyServiceStoreCost({storeCost:300,trialStoreCost:null},true)).toBe(300);
 expect(beautyServiceStoreCost({storeCost:300,trialStoreCost:0},true)).toBe(0);
 expect(beautyServiceStoreCost({storeCost:null,trialStoreCost:150},true)).toBe(150);
 expect(beautyServiceStoreCost(undefined,true)).toBeNull();
 const cost=beautyServiceStoreCost({storeCost:300,trialStoreCost:150},true)!;
 expect(beautySaleAllocation(750,cost)).toEqual({storeAmount:150,developerAmount:600,shortfall:0});
 expect(beautyAllocationAfterRefund(750,cost,375)).toEqual({storeAmount:75,developerAmount:300});
 expect(beautyAllocationAfterRefund(750,cost,750)).toEqual({storeAmount:0,developerAmount:0});
});
