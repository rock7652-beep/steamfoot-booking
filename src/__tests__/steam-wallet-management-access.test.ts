import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({permission:vi.fn(),read:vi.fn(),store:vi.fn(),module:vi.fn(),transaction:vi.fn(),wallet:vi.fn(),customer:vi.fn(),core:vi.fn(),query:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requireWritablePermission:m.permission,requirePermission:m.read}));
vi.mock('@/lib/store',()=>({resolveWriteStoreId:m.store}));
vi.mock('@/lib/industry-module-server',()=>({requireSteamfootStore:m.module}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({})}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction}}));
vi.mock('@/server/services/steam-wallet-management',()=>({closeSteamWallet:m.core}));
import {closeSteamPlan} from '@/server/actions/steam-wallet-management';
const input={expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001',cardId:'wallet',operation:'close',expectedRemaining:3,expectedExpiresAt:null,reason:'顧客確認'};
beforeEach(()=>{vi.resetAllMocks();m.permission.mockResolvedValue({id:'manager',role:'OWNER',staffId:'staff',name:'Synthetic'});m.store.mockResolvedValue('store');m.query.mockResolvedValue([{id:'store'}]);m.wallet.mockResolvedValue({customerId:'customer'});m.customer.mockResolvedValue({id:'customer'});m.core.mockResolvedValue({id:'wallet',remaining:0,expiresAt:null,closed:true});m.transaction.mockImplementation(async work=>work({$queryRaw:m.query,customerPlanWallet:{findFirst:m.wallet},customer:{findFirst:m.customer}}));});
it('requires adjustment/read permissions, module and customer ownership under the transaction',async()=>{
 expect(await closeSteamPlan(input)).toMatchObject({success:true});expect(m.permission).toHaveBeenCalledWith('wallet.adjust');expect(m.read.mock.calls.map(c=>c[0])).toEqual(['customer.read','wallet.read']);expect(m.module).toHaveBeenCalledWith('store');expect(m.core).toHaveBeenCalledOnce();
});
it.each(['permission','module','store','paused','customer'])('rejects %s without closing anything',async kind=>{
 if(kind==='permission')m.permission.mockRejectedValue(Error('denied'));
 if(kind==='module')m.module.mockRejectedValue(Error('wrong module'));
 if(kind==='store')m.store.mockResolvedValue('other');
 if(kind==='paused')m.query.mockResolvedValue([]);
 if(kind==='customer')m.customer.mockResolvedValue(null);
 expect(await closeSteamPlan(input)).toMatchObject({success:false});expect(m.core).not.toHaveBeenCalled();
});
