import {expect,it,vi} from 'vitest';
import {NextRequest,type NextResponse} from 'next/server';
vi.mock('@/lib/auth',()=>({auth:(handler:unknown)=>handler}));
vi.mock('@/lib/permissions',()=>({isStaffRole:(role:string)=>['OWNER','MANAGER','STAFF','ADMIN'].includes(role)}));
vi.mock('@/lib/retired-store-boundary',()=>({retiredStoreBoundary:()=>null}));
import {proxy} from '@/proxy';
function request(path:string,method='GET',signedIn=true){
 const req=new NextRequest('https://example.test'+path,{method});
 Object.assign(req,{auth:signedIn?{user:{role:'OWNER',storeId:'parent',storeSlug:'parent'}}:null});
 return (proxy as unknown as (req:NextRequest)=>NextResponse)(req);
}
it('redirects the old GET entry before rendering and retains the selected child store',()=>{
 const response=request('/s/child/admin/dashboard/cashbook?month=2026-09&q=fees');
 expect(response.status).toBe(307);const location=new URL(response.headers.get('location')!);
 expect(location.pathname).toBe('/s/child/admin/dashboard/revenue');expect(location.searchParams.get('area')).toBe('cashbook');expect(location.searchParams.get('month')).toBe('2026-09');expect(location.searchParams.get('q')).toBe('fees');
});
it('keeps Server Action POST requests on their original route',()=>{
 const response=request('/s/child/admin/dashboard/cashbook','POST');
 expect(response.headers.get('location')).toBeNull();expect(response.headers.get('x-middleware-rewrite')).toContain('/dashboard/cashbook');
});
it('preserves the HQ namespace and requires sign-in at the destination',()=>{
 const response=request('/hq/dashboard/reconciliation?runId=run','GET',false);
 const location=new URL(response.headers.get('location')!);expect(location.pathname).toBe('/hq/dashboard/revenue');expect(location.searchParams.get('checks')).toBe('1');expect(location.searchParams.get('runId')).toBe('run');
 expect(request(location.pathname+location.search,'GET',false).headers.get('location')).toBe('https://example.test/hq/login');
});
