import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({path:vi.fn(),tag:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:m.path,updateTag:m.tag,revalidateTag:vi.fn()}));
import {revalidateStoreFeatureEntitlements} from '@/lib/revalidation';
it('invalidates store and HQ layouts after a feature override, including the sidebar',()=>{
 revalidateStoreFeatureEntitlements();
 expect(m.tag).toHaveBeenCalled();
 expect(m.path).toHaveBeenCalledWith('/dashboard','layout');
 expect(m.path).toHaveBeenCalledWith('/hq/dashboard','layout');
});
