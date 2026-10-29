// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),customer:vi.fn(),card:vi.fn(),permission:vi.fn(),enabled:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.manager}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:m.enabled}));
vi.mock('@/server/services/music-lesson-periods',()=>({fixedMusicPeriodsEnabled:m.enabled}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({})}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{coursePointCard:{findFirst:m.card}}}));
vi.mock('@/lib/music-finance-sync',()=>({isMusicPreviewPage:()=>true}));
import {GET} from '@/app/(dashboard)/dashboard/courses/music-purchase-revision/route';
import {useMusicPurchaseRevision} from '@/lib/use-music-purchase-revision';
const actor={storeId:'store-a',user:{role:'OWNER',staffId:'staff-a',id:'owner'}};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue(actor);m.enabled.mockReturnValue(true);m.customer.mockResolvedValue({id:'student'});m.permission.mockResolvedValue(true);m.card.mockResolvedValue({id:'new-card'});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('checks current store, permission and visible customer before returning the latest revision',async()=>{
 const response=await GET(new Request('https://example.test/dashboard/courses/music-purchase-revision?customerId=student'));
 expect(await response.json()).toEqual({success:true,revision:'new-card'});expect(response.headers.get('cache-control')).toContain('no-store');
 expect(m.manager).toHaveBeenCalledWith('customer.read');expect(m.permission.mock.calls.map(x=>x[2]).sort()).toEqual(['booking.read','wallet.read']);
 expect(m.card.mock.calls[0][0].where).toMatchObject({storeId:'store-a',members:{some:{storeId:'store-a',customerId:'student'}}});
});
it('denies hidden customers and missing grants before reading cards',async()=>{
 m.customer.mockResolvedValue(null);expect((await GET(new Request('https://example.test/?customerId=other'))).status).toBe(403);expect(m.card).not.toHaveBeenCalled();
 m.customer.mockResolvedValue({id:'student'});m.permission.mockResolvedValue(false);expect((await GET(new Request('https://example.test/?customerId=student'))).status).toBe(403);expect(m.card).not.toHaveBeenCalled();
});
it('refreshes a visible learner only when the authorized revision changes',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();const changed=vi.fn();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,revision:'new-card'})});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);function Harness(){useMusicPurchaseRevision('student','old-card',changed);return null;}
 try{await act(async()=>root.render(createElement(Harness)));expect(fetcher).not.toHaveBeenCalled();await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(fetcher).toHaveBeenCalledOnce();expect(changed).toHaveBeenCalledOnce();await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(fetcher).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());}
});
it('does not issue overlapping requests and stops polling when the view unmounts',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();let finish!:(value:unknown)=>void;
 const fetcher=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);function Harness(){useMusicPurchaseRevision('student','old-card',vi.fn());return null;}
 try{await act(async()=>root.render(createElement(Harness)));await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(fetcher).toHaveBeenCalledOnce();await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(fetcher).toHaveBeenCalledOnce();await act(async()=>root.unmount());await act(async()=>finish({ok:true,json:async()=>({success:true,revision:'new-card'})}));await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});expect(fetcher).toHaveBeenCalledOnce();}finally{vi.useRealTimers();}
});
