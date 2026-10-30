import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),access:vi.fn(),wallet:vi.fn(),current:vi.fn(),transaction:vi.fn(),query:vi.fn(),direct:vi.fn(),reserved:vi.fn(),update:vi.fn(),audit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requireWritablePermission:m.permission}));
vi.mock('@/lib/manager-visibility',()=>({assertStoreAccess:m.access}));
vi.mock('@/lib/db',()=>({prisma:{customerPlanWallet:{findUnique:m.wallet},$transaction:m.transaction}}));
import {editWalletExpiry} from '@/server/actions/wallet-expiry';
const wallet={id:'wallet',storeId:'store',customerId:'customer',status:'ACTIVE',expiryDate:new Date('2028-04-22T00:00:00Z')};
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-29T01:00Z"));vi.resetAllMocks();m.permission.mockResolvedValue({id:'owner'});m.wallet.mockResolvedValue({...wallet});m.current.mockResolvedValue({...wallet});m.direct.mockResolvedValue(0);m.reserved.mockResolvedValue(0);m.transaction.mockImplementation(async work=>work({$queryRaw:m.query,customerPlanWallet:{findUnique:m.current,update:m.update},booking:{count:m.direct},walletSession:{count:m.reserved},auditLog:{create:m.audit}}));});
afterEach(()=>vi.useRealTimers());
it.each(['2028-02-01','2028-08-01'])('supports shortening/extension to %s with a reason and no balance or payment changes',async newExpiryDate=>{
 expect(await editWalletExpiry({walletId:'wallet',newExpiryDate,reason:'已確認期限'})).toMatchObject({success:true});expect(m.update).toHaveBeenCalledWith({where:{id:'wallet'},data:{expiryDate:new Date(newExpiryDate+'T00:00:00Z'),status:'ACTIVE'}});expect(m.audit).toHaveBeenCalledOnce();expect(m.permission).toHaveBeenCalledWith('wallet.adjust');
});
it.each(['closed','changed-date','primary-booking','split-wallet-booking'])('blocks %s before writing',async kind=>{
 if(kind==='closed')m.current.mockResolvedValue({...wallet,status:'CANCELLED'});
 if(kind==='changed-date')m.current.mockResolvedValue({...wallet,expiryDate:new Date('2028-03-01')});
 if(kind==='primary-booking')m.direct.mockResolvedValue(1);
 if(kind==='split-wallet-booking')m.reserved.mockResolvedValue(1);
 expect(await editWalletExpiry({walletId:'wallet',newExpiryDate:'2028-02-01',reason:'已確認期限'})).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
