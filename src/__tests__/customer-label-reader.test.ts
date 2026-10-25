import {afterEach,expect,it,vi} from 'vitest';
import {readCustomerLabels} from '@/lib/customer-label-reader';
afterEach(()=>vi.unstubAllGlobals());
it('reads independently with same-origin authorization and no cache',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({storeId:'store',enabled:true,assignments:{customer:['tag']}})});vi.stubGlobal('fetch',fetch);expect(await readCustomerLabels(['customer'],'store')).toMatchObject({assignments:{customer:['tag']}});expect(fetch).toHaveBeenCalledWith('/api/customer-labels/read',expect.objectContaining({method:'POST',credentials:'same-origin',cache:'no-store',body:JSON.stringify({ids:['customer'],storeId:'store'})}));});
it.each([{storeId:'other',enabled:true,assignments:{}},{error:'denied'}])('does not display mismatched or failed results',async result=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>result}));await expect(readCustomerLabels(['customer'],'store')).rejects.toThrow();});
