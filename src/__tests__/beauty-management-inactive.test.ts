// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('@/server/actions/course-availability',()=>({getCourseStaffAvailability:vi.fn()}));
vi.mock('@/server/actions/course-browse',()=>({searchCourseCustomers:vi.fn(),loadCourseCustomerSearchIndex:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>'/dashboard/beauty',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/server/actions/course-staff',()=>({readCourseStaffTeaching:vi.fn()}));
vi.mock('@/lib/course-work-permission-client',()=>({saveCourseOwnIncomeAccess:vi.fn()}));
vi.mock('@/components/admin/course-batch-selection',()=>({CourseBatchBar:()=>null}));
vi.mock('@/server/actions/course-batch',()=>({applyCourseBatchStatus:vi.fn(),courseStatusImpact:vi.fn()}));
vi.mock('@/components/admin/course-display-order',()=>({useCourseDisplayOrder:()=>({compare:()=>0,rowProps:()=>({}),handle:()=>null})}));
import {CourseStaffWorkspace} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import {nativeBeautyStaff} from '@/lib/beauty/native-staff';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('the original controller keeps Beauty disabled technicians collapsed, searchable and reachable without changing records',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const base={id:'on',revision:1,name:'啟用技師',gender:'FEMALE',active:true,serviceIds:[],rates:{}};
 const staff=[nativeBeautyStaff(base),nativeBeautyStaff({...base,id:'off',name:'停用測試技師',active:false})];
 const name=(value:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===value);
 const toggle=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('停用人員（'))!;
 const input=(value:string)=>{const el=host.querySelector<HTMLInputElement>('input[aria-label="搜尋人員"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
 try{
  await act(async()=>root.render(h(CourseStaffWorkspace,{staff,maxStaff:null,templates:[],customers:[],canManage:false,permissionGroups:[],accountKind:'coach',sportsNative:true})));
  expect(name('啟用技師')).toBeTruthy();expect(name('停用測試技師')).toBeUndefined();expect(toggle().getAttribute('aria-expanded')).toBe('false');
  await act(async()=>toggle().click());expect(name('停用測試技師')).toBeTruthy();await act(async()=>name('停用測試技師')!.click());expect(document.querySelector('[role="dialog"]')!.textContent).toContain('停用測試技師');
  const close=[...document.querySelectorAll('button')].find(b=>b.textContent==='關閉')!;await act(async()=>close.click());await act(async()=>toggle().click());expect(name('停用測試技師')).toBeUndefined();
  await act(async()=>input('停用測試'));expect(name('停用測試技師')).toBeTruthy();expect((toggle() as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>input(''));expect(name('停用測試技師')).toBeUndefined();
  const status=host.querySelector<HTMLSelectElement>('select[aria-label="人員狀態"]')!;await act(async()=>{status.value='inactive';status.dispatchEvent(new Event('change',{bubbles:true}));});expect(name('停用測試技師')).toBeTruthy();expect(name('啟用技師')).toBeUndefined();expect(staff[1].active).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();}
});
