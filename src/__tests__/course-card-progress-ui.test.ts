// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-card-progress',()=>({loadCourseCardProgress:m.read}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/hq/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
import {CourseCardProgress} from '@/app/(dashboard)/dashboard/courses/card-progress';
const result={success:true,data:{available:true,total:10,shared:true,completed:[{id:'b1',date:'2026-11-03T08:30:00Z',customerName:'甲',courseName:'舞蹈'},{id:'b2',date:'2026-11-10T08:30:00Z',customerName:'乙',courseName:'舞蹈'}]}};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});});
it('共用方案顯示十格兩日期，其餘留白，日期可查看實際使用人',async()=>{
 m.read.mockResolvedValue(result);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(h(CourseCardProgress,{cardId:'card',customerId:'student',storeId:'store'})));
  expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.querySelectorAll('[data-completed="true"]')).toHaveLength(2);
  for(const blank of host.querySelectorAll('[data-completed="false"]'))expect(blank.textContent).toBe('');
  expect(host.textContent).toContain('整份方案');
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="第 2 堂，2026-11-10，乙"]')!.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain('2026-11-10 · 乙 · 舞蹈');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('讀取失敗不展示空白格，原視窗可重試',async()=>{
 m.read.mockResolvedValueOnce({success:false,error:'讀取失敗'}).mockResolvedValueOnce(result);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(h(CourseCardProgress,{cardId:'card',customerId:'student',storeId:'store'})));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(0);
  await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('快速切換課卡不閃出舊進度，舊回應不能覆蓋新卡',async()=>{
 let resolveOld!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;})).mockResolvedValueOnce({...result,data:{...result.data,total:5,completed:[]}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(h(CourseCardProgress,{cardId:'old',customerId:'student',storeId:'store'})));
  await act(async()=>root.render(h(CourseCardProgress,{cardId:'new',customerId:'student',storeId:'store'})));
  await act(async()=>resolveOld(result));expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(5);expect(host.querySelectorAll('[data-completed="true"]')).toHaveLength(0);
 }finally{await act(async()=>root.unmount());host.remove();}
});
