// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {OperationScope} from '@/components/operations/operation-scope';
import {CourseCustomerDraftForm,type Person} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import {CourseStaffPermissionFields,CourseStaffBasicFields} from '@/app/(dashboard)/dashboard/courses/staff-editor-fields';
const m=vi.hoisted(()=>({course:vi.fn(),save:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:m.course}));vi.mock('@/server/actions/sports-staging',()=>({saveSportsFee:m.course}));vi.mock('next/navigation',()=>({usePathname:()=>'/s/test/admin/dashboard/beauty',useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const person:Person={id:'c',updatedAt:'2026-10-22T00:00:00.000Z',name:'原姓名',phone:'0900000000',email:'a@example.invalid',gender:'female',birthday:'1990-03-04',serviceNote:'注意事項',address:'地址',notes:'備註',emergencyContactName:'家人',emergencyContactPhone:'0900000001'};
async function form(canEdit=true){await act(async()=>root.render(React.createElement(OperationScope,{scope:'test-beauty-customer'},React.createElement(CourseCustomerDraftForm,{person,hidden:false,canEdit,canCreate:false,save:m.save,draftScope:'beauty-customer:A',onPending:()=>{},onSaved:()=>{}}))));}
it('uses the actual customer form with the Beauty writer, preserves rejected inputs and forwards the authoritative version',async()=>{
 m.save.mockResolvedValue({success:false,error:'已被其他人更新'});await form();const name=host.querySelector<HTMLInputElement>('[name="name"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'新姓名');name.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({id:'c',name:'新姓名',expectedUpdatedAt:person.updatedAt,email:person.email,birthday:person.birthday,address:person.address,emergencyContactName:person.emergencyContactName}));expect(m.course).not.toHaveBeenCalled();expect(name.value).toBe('新姓名');expect(host.textContent).toContain('已被其他人更新');
});
it('blocks submission in readonly mode rather than only hiding its button',async()=>{await form(false);await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(m.save).not.toHaveBeenCalled();});
it('keeps immutable and out-of-scope permission grants when applying shared bulk actions',async()=>{
 const onChange=vi.fn();await act(async()=>root.render(React.createElement(CourseStaffPermissionFields,{groups:[{label:'店務',codes:[{code:'customer.read',label:'讀取'},{code:'staff.manage',label:'管理'}]}],permissions:['staff.manage','private.existing'],editableCodes:['customer.read'],onChange})));
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click());await click('全部清除');expect(onChange).toHaveBeenLastCalledWith(['staff.manage','private.existing']);await click('全部開啟');expect(onChange).toHaveBeenLastCalledWith(['staff.manage','private.existing','customer.read']);expect(host.querySelector<HTMLInputElement>('[value="staff.manage"]')!.disabled).toBe(true);
});
it('submits existing original name/status field names for technicians without adding contact details',async()=>{await act(async()=>root.render(React.createElement('form',null,React.createElement(CourseStaffBasicFields,{name:'技師',active:false,showPhone:false}))));const f=new FormData(host.querySelector('form')!);expect(f.get('name')).toBe('技師');expect(f.get('active')).toBe('no');expect(f.has('phone')).toBe(false);});
