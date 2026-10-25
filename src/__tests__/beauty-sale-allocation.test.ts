import {expect,it} from 'vitest';
import {beautySaleAllocation,beautyAllocationAfterRefund} from '@/lib/beauty/sale-allocation';
it('freezes store fixed fee and remainder, without treating unset costs as zero',()=>{expect(beautySaleAllocation(900,300)).toEqual({storeAmount:300,developerAmount:600,shortfall:0});expect(beautySaleAllocation(200,300)).toEqual({storeAmount:200,developerAmount:0,shortfall:100});expect(beautySaleAllocation(900,null)).toBeNull();});
it('reverses allocations cumulatively without rounding drift',()=>{expect(beautyAllocationAfterRefund(900,300,300)).toEqual({storeAmount:200,developerAmount:400});expect(beautyAllocationAfterRefund(900,300,900)).toEqual({storeAmount:0,developerAmount:0});});
