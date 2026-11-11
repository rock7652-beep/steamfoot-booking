import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),wallets:vi.fn()}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/server/actions/liff-my-wallets',()=>({fetchLiffWallets:m.wallets}));
vi.mock('@/lib/store-resolver',()=>({resolveStoreSlugForLiff:async()=> 'store-a',resolveStorePresentation:async()=>({id:'a',slug:'store-a',name:'A',contactUrl:''}),resolveCentralMemberLiffId:async()=> 'liff'}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:async()=> 'steamfoot'}));
vi.mock('@/app/(liff)/liff/wallets/wallets-list',()=>({WalletsList:()=>null}));
import Page from '@/app/(liff)/liff/wallets/page';
beforeEach(()=>{vi.clearAllMocks();m.wallets.mockResolvedValue({status:'ok',active:[],expired:[],history:[],makeupCredits:[]});});
it.each([null,{role:'STAFF',storeId:'a',storeSlug:'store-a'},{role:'CUSTOMER',storeId:'b',storeSlug:'store-a'},{role:'CUSTOMER',storeId:'a',storeSlug:'other'}])('does not preload a wallet for a missing or different member/store scope (%j)',async user=>{
 m.user.mockResolvedValue(user);const page=await Page();expect(m.wallets).not.toHaveBeenCalled();expect(page.props.initialWallets).toBeUndefined();
});
it('uses only the canonical authorized reader for matching current customer and store',async()=>{
 m.user.mockResolvedValue({role:'CUSTOMER',storeId:'a',storeSlug:'store-a'});const page=await Page();expect(m.wallets).toHaveBeenCalledWith();expect(page.props.initialWallets.status).toBe('ok');
});
it('does not render an authorization or service failure as an empty successful wallet',async()=>{
 m.user.mockResolvedValue({role:'CUSTOMER',storeId:'a',storeSlug:'store-a'});m.wallets.mockResolvedValue({status:'no_customer'});const page=await Page();expect(page.props.initialWallets).toBeUndefined();
});
