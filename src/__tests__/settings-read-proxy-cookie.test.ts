import {it,expect,vi} from 'vitest';
import {NextRequest,type NextResponse} from 'next/server';
vi.mock('@/lib/auth',()=>({auth:(fn:unknown)=>fn}));
vi.mock('@/lib/permissions',()=>({isStaffRole:(role:string)=>['OWNER','ADMIN','STAFF','MANAGER','PARTNER'].includes(role)}));
import {proxy} from '@/proxy';
function run(path:string,method:string,cookie:string,action=true,role='OWNER'){
 const req=new NextRequest('https://preview.example'+path,{method,headers:{cookie,'x-store-slug':'forged',...(action?{'next-action':'reader'}:{})}});
 Object.assign(req,{auth:{user:{id:'owner',role,storeId:'music',storeSlug:'music',staffId:'staff'}}});
 return (proxy as unknown as (r:NextRequest)=>NextResponse)(req);
}
it('does not mark same-store local settings action cookies changed, while forwarding verified scope',()=>{
 const r=run('/s/music/admin/dashboard/courses?view=settings','POST','store-slug=music');expect(r.cookies.get('store-slug')).toBeUndefined();expect(r.headers.get('x-middleware-set-cookie')).toBeNull();expect(r.headers.get('x-middleware-request-x-store-slug')).toBe('music');expect(r.headers.get('x-middleware-request-next-action')).toBe('reader');
});
it('still writes actual scope changes and renews page/navigation cookies',()=>{
 for(const [method,cookie,action] of [['POST','store-slug=old',true],['GET','store-slug=music',true],['POST','store-slug=music',false]] as const){const r=run('/s/music/admin/dashboard/courses?view=settings',method,cookie,action);expect(r.cookies.get('store-slug')?.value).toBe('music');expect(r.cookies.get('store-slug')?.maxAge).toBe(86400)}
 expect(run('/s/music/admin/dashboard/courses?view=calendar','POST','store-slug=music').cookies.get('store-slug')?.value).toBe('music');
});
it('keeps HQ settings context without unnecessary cookie writes',()=>{const r=run('/hq/dashboard/courses?view=settings','POST','store-slug=__hq__',true,'ADMIN');expect(r.cookies.get('store-slug')).toBeUndefined();expect(r.headers.get('x-middleware-request-x-store-slug')).toBeNull();expect(r.headers.get('x-middleware-rewrite')).toBe('https://preview.example/dashboard/courses?view=settings')});
it('does not turn a forged HQ action into access for an Owner',()=>{const r=run('/hq/dashboard/courses?view=settings','POST','store-slug=__hq__');expect(r.headers.get('x-middleware-rewrite')).toBeNull();expect(r.headers.get('location')).toBeTruthy()});
