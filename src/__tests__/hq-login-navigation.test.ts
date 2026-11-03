import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),signIn:vi.fn(),slug:vi.fn(),clear:vi.fn(),cookie:vi.fn(),audit:vi.fn(),AuthError:class AuthError extends Error{}}));
vi.mock('@/lib/db',()=>({prisma:{user:{findUnique:m.find}}}));
vi.mock('@/lib/auth',()=>({signIn:m.signIn,signOut:vi.fn()}));
vi.mock('next-auth',()=>({AuthError:m.AuthError}));
vi.mock('next/headers',()=>({cookies:async()=>({set:m.cookie})}));
vi.mock('@/lib/store-resolver',()=>({getStoreSlugById:m.slug}));
vi.mock('@/server/auth/clear-store-context',()=>({clearStoreContextCookies:m.clear}));
vi.mock('@/server/services/staff-login-audit',()=>({recordStaffLogin:m.audit}));
import {hqLoginAction} from '@/server/actions/auth';
function form(){const d=new FormData();d.set('email','qa@example.invalid');d.set('password','synthetic-password');d.set('storeSlug','other-store');return d;}
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue({id:'owner',name:'合成店長',role:'OWNER',status:'ACTIVE',staff:{storeId:'own-store'},customer:null});m.slug.mockResolvedValue('own-store');m.signIn.mockResolvedValue('https://same-origin.invalid/s/own-store/admin/dashboard');});
it.each(['OWNER','MANAGER','STAFF','PARTNER'])('authenticates %s before returning its own store path',async role=>{
 m.find.mockResolvedValue({id:'staff',role,status:'ACTIVE',staff:{storeId:'own-store'}});
 expect(await hqLoginAction({error:null},form())).toEqual({error:null,redirectTo:'/s/own-store/admin/dashboard'});
 expect(m.signIn).toHaveBeenCalledExactlyOnceWith('credentials',{email:'qa@example.invalid',password:'synthetic-password',redirectTo:'/s/own-store/admin/dashboard',redirect:false});
});
it('preserves the ADMIN destination and clears stale store context',async()=>{
 m.find.mockResolvedValue({id:'admin',role:'ADMIN',status:'ACTIVE'});
 expect(await hqLoginAction({error:null},form())).toEqual({error:null,redirectTo:'/hq/dashboard'});expect(m.clear).toHaveBeenCalledOnce();
});
it('never returns a destination on incorrect credentials',async()=>{
 m.signIn.mockRejectedValueOnce(new m.AuthError('wrong password'));
 expect(await hqLoginAction({error:null},form())).toEqual({error:'密碼錯誤，請重新輸入'});
});
it('rejects a suspended account before authentication',async()=>{
 m.find.mockResolvedValue({id:'owner',role:'OWNER',status:'SUSPENDED'});
 expect(await hqLoginAction({error:null},form())).toEqual({error:'此帳號已停用，請聯絡管理員'});expect(m.signIn).not.toHaveBeenCalled();
});
it('does not convert an unexpected authentication failure into a successful navigation',async()=>{
 m.signIn.mockRejectedValueOnce(new Error('unexpected'));
 await expect(hqLoginAction({error:null},form())).rejects.toThrow('unexpected');
});
it('keeps missing credentials out of the authentication pipeline',async()=>{
 expect(await hqLoginAction({error:null},new FormData())).toEqual({error:'請輸入 Email 和密碼'});expect(m.find).not.toHaveBeenCalled();expect(m.signIn).not.toHaveBeenCalled();
});
