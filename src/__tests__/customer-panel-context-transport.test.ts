import {afterEach,expect,it,vi} from 'vitest';
import {readCustomerContext} from '@/components/admin/use-customer-panel-context-reader';
afterEach(()=>vi.unstubAllGlobals());
it('restores action Date fields for the existing drawer while preserving progress and summary strings',async()=>{
 const date='2027-02-01T00:00:00.000Z';
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{customer:{id:'customer',createdAt:date,planWallets:[{expiryDate:date,startDate:date,usageProgress:{completed:[{date}]}}],recentConsumption:[{date,sortAt:date}]},initialSummary:{health:{measuredAt:date}}}})});
 vi.stubGlobal('window',{location:{pathname:'/s/store/admin/dashboard/bookings'}});vi.stubGlobal('fetch',fetcher);
 const result=await readCustomerContext('customer');
 expect(fetcher).toHaveBeenCalledWith('/s/store/admin/dashboard/customers/panel-read?customerId=customer',{credentials:'same-origin',cache:'no-store'});
 expect(result).toMatchObject({success:true});
 if(result.success){expect(result.data.customer.planWallets[0].expiryDate).toBeInstanceOf(Date);expect(result.data.customer.createdAt).toBeInstanceOf(Date);expect(result.data.initialSummary?.health?.measuredAt).toBe(date);}
});
