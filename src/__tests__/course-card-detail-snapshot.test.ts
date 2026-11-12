// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/course-browse',()=>({browseCourseCards:vi.fn()}));
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {useCourseCardDetailReader} from '@/components/admin/use-course-card-detail-reader';
import {useCardDetail} from '@/app/(dashboard)/dashboard/courses/use-card-detail';
import type {CourseCardView} from '@/app/(dashboard)/dashboard/courses/member-workspace';
it('uses the exact first-opening snapshot then re-reads after reopening or retry',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const initial={id:'card',name:'ready'} as CourseCardView;
 const read=vi.fn().mockResolvedValue({success:true,rows:[{...initial,name:'fresh'}]});
 function Probe({opening}:{opening:number}){const current=useCardDetail(true,'card',opening,read,false,initial);return h('button',{onClick:current.retry},current.data?.name??'loading');}
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(h(Probe,{opening:0})));
  expect(host.textContent).toBe('ready');expect(read).not.toHaveBeenCalled();
  await act(async()=>root.render(h(Probe,{opening:1})));
  expect(host.textContent).toBe('fresh');expect(read).toHaveBeenCalledOnce();
  await act(async()=>host.querySelector('button')!.click());expect(read).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});

it('opens a prepared native detail immediately and invalidates it on a financial revision',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const card={id:'prepared',name:'完整方案'} as CourseCardView;
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,rows:[card],hasMore:false})});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 function Detail({revision}:{revision:number}){const detail=useCardDetail(true,'prepared',1,undefined,false,undefined,{storeId:'store',revision});return h('p',null,detail.loading?'讀取中':detail.data?.name);}
 function App({open=false,revision=0}:{open?:boolean;revision?:number}){const reader=useCourseCardDetailReader(undefined,'store',revision);return h('main',null,h('button',{onClick:()=>reader.read({cardId:'prepared',dataScope:undefined})},'預讀'),open?h(Detail,{revision}):null);}
 try{
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{}))));
  await act(async()=>host.querySelector('button')!.click());expect(fetcher).toHaveBeenCalledOnce();
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true}))));expect(host.textContent).toContain('完整方案');expect(host.textContent).not.toContain('讀取中');expect(fetcher).toHaveBeenCalledOnce();
  const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now+15001);
  let finish!:(value:unknown)=>void;fetcher.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:false}))));
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true}))));
  expect(host.textContent).toContain('完整方案');expect(host.textContent).not.toContain('讀取中');expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async()=>finish({ok:true,json:async()=>({success:true,rows:[card],hasMore:false})}));clock.mockRestore();
  await act(async()=>root.render(h(PanelReadProvider,null,h(App,{open:true,revision:1}))));expect(fetcher).toHaveBeenCalledTimes(3);
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
