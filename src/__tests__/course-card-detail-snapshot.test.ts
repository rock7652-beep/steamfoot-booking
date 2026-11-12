// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/course-browse',()=>({browseCourseCards:vi.fn()}));
import {useCardDetail} from '@/app/(dashboard)/dashboard/courses/use-card-detail';
import type {CourseCardView} from '@/app/(dashboard)/dashboard/courses/member-workspace';
it('uses the exact first-opening snapshot then re-reads after reopening or retry',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const initial={id:'card',name:'ready'} as CourseCardView;
 const read=vi.fn().mockResolvedValue({success:true,rows:[{...initial,name:'fresh'}]});
 let current!:ReturnType<typeof useCardDetail>;
 function Probe({opening}:{opening:number}){current=useCardDetail(true,'card',opening,read,false,initial);return h('p',null,current.data?.name??'loading');}
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(h(Probe,{opening:0})));
  expect(host.textContent).toBe('ready');expect(read).not.toHaveBeenCalled();
  await act(async()=>root.render(h(Probe,{opening:1})));
  expect(host.textContent).toBe('fresh');expect(read).toHaveBeenCalledOnce();
  await act(async()=>current.retry());expect(read).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
