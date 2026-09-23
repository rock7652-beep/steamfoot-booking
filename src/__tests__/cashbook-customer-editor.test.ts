// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ create: vi.fn(async () => ({success:true})), update: vi.fn(async () => ({success:true})), search: vi.fn(async () => [{id:'c1',name:'測試顧客',phone:'0900000000'}]) }));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
vi.mock('@/components/admin/right-sheet',()=>({RightSheet:({children}:any)=>React.createElement('div',null,children)}));
vi.mock('@/components/desktop',()=>({FormSection:({children}:any)=>React.createElement('section',null,children),FormGrid:({children}:any)=>React.createElement('div',null,children)}));
vi.mock('@/server/actions/cashbook',()=>({createCashbookEntry:m.create,updateCashbookEntry:m.update}));
vi.mock('@/server/actions/quick-cashbook',()=>({searchQuickCashbookCustomers:m.search}));
import { CashbookEditor } from '@/app/(dashboard)/dashboard/cashbook/cashbook-editor';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
afterEach(async()=>{await act(async()=>root.unmount());host.replaceChildren();root=createRoot(host);vi.clearAllMocks();});
const props={storeId:'store',today:'2026-09-23',closedDates:[],staffOptions:[],canAssignStaff:false};
it('keeps the linked customer when an existing retail entry is edited',async()=>{
 await act(async()=>root.render(React.createElement(CashbookEditor,{...props,entry:{id:'e',entryDate:'2026-09-23',type:'INCOME',category:'零售-其他商品',amount:'200',paymentMethod:'CASH',note:'',staffId:null,customer:{id:'c1',name:'測試顧客'}}})));
 await act(async()=>host.querySelector('button')!.click());
 expect(host.textContent).toContain('已關聯 測試顧客');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.update).toHaveBeenCalledWith('e',expect.objectContaining({customerId:'c1',category:'零售-其他商品'}));
});
it('searches and selects a customer in the full income editor',async()=>{
 await act(async()=>root.render(React.createElement(CashbookEditor,props)));
 await act(async()=>host.querySelector('button')!.click());
 const input=host.querySelector('#quick-cashbook-customer') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'測試');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{await new Promise(r=>setTimeout(r,150));});
 const option=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('0900000000'))!;
 expect(option).toBeTruthy();await act(async()=>option.click());
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({customerId:'c1'}));
});

it('saves a custom retail product instead of a fixed steamfoot category',async()=>{
 await act(async()=>root.render(React.createElement(CashbookEditor,{...props,entry:{id:'e',entryDate:'2026-09-23',type:'INCOME',category:'零售-其他商品',amount:'100',paymentMethod:'CASH',note:'',staffId:null,customer:{id:'c1',name:'測試顧客'}}})));
 await act(async()=>host.querySelector('button')!.click());
 const input=host.querySelector('[aria-label="商品名稱"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'三寶');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.update).toHaveBeenCalledWith('e',expect.objectContaining({customerId:'c1',category:'零售-三寶',amount:100}));
});
