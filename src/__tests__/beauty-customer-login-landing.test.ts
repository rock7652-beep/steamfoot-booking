import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({signIn:vi.fn(),module:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/auth',()=>({signIn:mocks.signIn}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:mocks.module}));
vi.mock('next-auth',()=>({AuthError:class AuthError extends Error{}}));
vi.mock('next/headers',()=>({cookies:vi.fn(async()=>({get:vi.fn()}))}));
vi.mock('@/server/services/referral-events',()=>({createRegisterEvent:vi.fn()}));
vi.mock('@/server/services/referral-binding',()=>({bindReferralToCustomer:vi.fn()}));
import {customerLoginAction} from '@/server/actions/customer-auth';
beforeEach(()=>{vi.clearAllMocks();mocks.signIn.mockRejectedValue(new Error('NEXT_REDIRECT'));});
it.each([['beauty','beauty'],['course','book'],['steamfoot','book']])('uses the authoritative %s module landing without changing credential verification',async(module,landing)=>{
 mocks.module.mockResolvedValue(module);
 const form=new FormData();form.set('phone','0900001375');form.set('password','synthetic');form.set('storeId','store');form.set('storeSlug','beauty-qa');
 await expect(customerLoginAction({error:null},form)).rejects.toThrow('NEXT_REDIRECT');
 expect(mocks.module).toHaveBeenCalledWith('store');
 expect(mocks.signIn).toHaveBeenCalledWith('customer-phone',{phone:'0900001375',password:'synthetic',storeId:'store',redirectTo:`/s/beauty-qa/${landing}`});
});
it.each([['beauty','beauty-book','beauty?view=book'],['beauty','https://example.invalid','beauty'],['course','beauty-book','book']])('accepts only the fixed Beauty booking intent (%s, %s)',async(module,next,landing)=>{
 mocks.module.mockResolvedValue(module);const form=new FormData();form.set('phone','0900001375');form.set('password','synthetic');form.set('storeId','store');form.set('storeSlug','beauty-qa');form.set('next',next);await expect(customerLoginAction({error:null},form)).rejects.toThrow('NEXT_REDIRECT');expect(mocks.signIn.mock.calls[0][1].redirectTo).toBe(`/s/beauty-qa/${landing}`);
});
