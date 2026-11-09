import {expect,it,vi} from 'vitest';
import {NextRequest,type NextResponse} from 'next/server';
vi.mock('@/lib/retired-store-boundary',()=>({retiredStoreBoundary:()=>null}));
// Preserve an independent session-renewal header, as the auth wrapper does.
vi.mock('@/lib/auth',()=>({auth:(handler:(req:NextRequest)=>NextResponse)=>(req:NextRequest)=>{
 const response=handler(req);response.headers.append('set-cookie','synthetic-session=renewed; Path=/; HttpOnly; SameSite=Lax');return response;
}}));
vi.mock('@/lib/permissions',()=>({isStaffRole:(role:string)=>['OWNER','ADMIN','STAFF','PARTNER'].includes(role)}));
import {proxy} from '@/proxy';
function run(path:string,cookie:string,options:{action?:boolean;method?:string;host?:string;role?:string;loggedIn?:boolean}={}){
 const host=options.host??'preview.example';
 const req=new NextRequest(`https://${host}${path}`,{method:options.method??'POST',headers:{host,cookie,'x-store-slug':'forged','x-next-pathname':'/forged',...(options.action===false?{}:{'next-action':'synthetic-action'})}});
 Object.assign(req,{auth:options.loggedIn===false?null:{user:{id:'user',role:options.role??'OWNER',storeId:'store',storeSlug:'current'}}});
 return (proxy as unknown as (request:NextRequest)=>NextResponse)(req);
}
it.each(['lubymusic','sports-live-flow','beauty-demo','steamfoot-demo'])('does not mutate matching context cookies on %s Actions and still forwards verified route context',slug=>{
 const path=`/s/${slug}/admin/dashboard/courses`,r=run(path,`store-slug=${slug}`);
 expect(r.headers.get('x-middleware-set-cookie')).toBeNull();
 expect(r.headers.get('x-middleware-request-x-store-slug')).toBe(slug);
 expect(r.headers.get('x-middleware-request-x-next-pathname')).toBe(path);
 expect(r.headers.get('x-middleware-request-next-action')).toBe('synthetic-action');
 expect(r.headers.get('set-cookie')).toContain('synthetic-session=renewed');
});
it.each(['','store-slug=other','store-slug=__hq__'])('establishes or changes the store on an Action: %s',cookie=>{
 const r=run('/s/current/admin/dashboard/courses',cookie);
 expect(r.cookies.get('store-slug')).toMatchObject({value:'current',path:'/',sameSite:'lax',maxAge:86400});
 expect(r.headers.get('x-middleware-request-x-store-slug')).toBe('current');
});
it.each([{method:'GET'},{method:'POST',action:false}])('retains ordinary navigation/form renewal: %o',options=>{
 const r=run('/s/current/admin/dashboard/courses','store-slug=current',options);
 expect(r.cookies.get('store-slug')).toMatchObject({value:'current',maxAge:86400});
});
it('retains HQ context, switching and document renewal',()=>{
 const path='/hq/dashboard/courses',same=run(path,'store-slug=__hq__',{role:'ADMIN'});
 expect(same.headers.get('x-middleware-set-cookie')).toBeNull();expect(same.headers.get('x-middleware-request-x-store-slug')).toBeNull();
 expect(run(path,'store-slug=current',{role:'ADMIN'}).cookies.get('store-slug')?.value).toBe('__hq__');
 expect(run(path,'store-slug=__hq__',{role:'ADMIN',method:'GET'}).cookies.get('store-slug')?.maxAge).toBe(86400);
});
it('handles custom-domain identity independently of the slug',()=>{
 const domain='e182e256-98ca-4c78-970b-d4b118066c51',path='/s/zhubei/admin/dashboard/courses',options={host:'steamfoot-zhubei.com'};
 const same=run(path,`store-slug=zhubei; domain-store-id=${domain}`,options);
 expect(same.headers.get('x-middleware-set-cookie')).toBeNull();
 const changed=run(path,'store-slug=zhubei; domain-store-id=old',options);
 expect(changed.cookies.get('store-slug')).toBeUndefined();expect(changed.cookies.get('domain-store-id')).toMatchObject({value:domain,httpOnly:true,maxAge:86400});
});
it('still rejects an unauthenticated Action before a store rewrite',()=>{
 const r=run('/s/current/admin/dashboard/courses','store-slug=current',{loggedIn:false});
 expect(r.headers.get('location')).toContain('/hq/login');expect(r.headers.get('x-middleware-rewrite')).toBeNull();
});
it.each(['current','other',''])('feeds the real Next request store without false modifications: previous=%s',async previous=>{
 const {createRequestStoreForAPI}=await import('next/dist/server/async-storage/request-store');
 const {getModifiedCookieValues}=await import('next/dist/server/web/spec-extension/adapters/request-cookies');
 const cookie=previous?`store-slug=${previous}`:'',response=run('/s/current/admin/dashboard/courses',cookie);
 const middleware=response.headers.get('x-middleware-set-cookie');
 const request={headers:{cookie,...(middleware?{'x-middleware-set-cookie':middleware}:{})}};
 const store=createRequestStoreForAPI(request as Parameters<typeof createRequestStoreForAPI>[0],new URL('https://preview.example/dashboard/courses'),undefined as unknown as Parameters<typeof createRequestStoreForAPI>[2],undefined,undefined);
 expect(getModifiedCookieValues(store.mutableCookies).map(item=>item.name)).toEqual(previous==='current'?[]:['store-slug']);
});
