// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/work-orders',()=>({loadWorkOrders:m.read,saveWorkOrderAction:vi.fn(),collectWorkOrderAction:vi.fn(),changeWorkOrderStatusAction:vi.fn()}));
vi.mock('@/server/actions/customer',()=>({createCustomer:vi.fn()}));
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
vi.mock('@/components/customer-instant-search',()=>({CustomerInstantSearch:()=>null}));
vi.mock('@/components/operation-history-button',()=>({OperationHistoryButton:()=>null}));
vi.mock('@/components/admin/store-member-connection-panel',()=>({StoreMemberConnectionPanel:()=>null}));
vi.mock('@/components/admin/work-order-notification-result',()=>({WorkOrderNotificationResult:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/work-orders/settlement-panel',()=>({WorkOrderSettlementPanel:()=>null}));
import {WorkOrderWorkspace} from '@/app/(dashboard)/dashboard/work-orders/workspace';
import type {WorkOrderData} from '@/server/services/work-orders';
const data=(count=0)=>({orders:[],count,page:1,products:[],store:{id:'fixture'},canWrite:false} as unknown as WorkOrderData);
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();m.read.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(WorkOrderWorkspace,{initial:data()})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function change(value:string){await act(async()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function tick(){await act(async()=>vi.advanceTimersByTime(350));}
it('discards an old response as soon as the user types a new intent, even before its debounce fires',async()=>{
 let finish!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({success:true,data:data(7)});
 await change('舊字');await tick();expect(m.read).toHaveBeenCalledTimes(1);await change('新字');await act(async()=>finish({success:true,data:data(99)}));expect(host.textContent).not.toContain('共 99 筆');await tick();expect(m.read).toHaveBeenLastCalledWith({query:'新字',page:1,status:'all',payment:'all'});expect(host.textContent).toContain('共 7 筆');
});
it('coalesces query and status, and clearing cancels the old keyword',async()=>{
 m.read.mockResolvedValue({success:true,data:data()});await change('姓名');await act(async()=>{const select=host.querySelector('select')!;select.value='READY';select.dispatchEvent(new Event('change',{bubbles:true}));});await tick();expect(m.read).toHaveBeenCalledTimes(1);expect(m.read).toHaveBeenLastCalledWith({query:'姓名',page:1,status:'READY',payment:'all'});await change('舊姓名');await change('');await tick();expect(m.read).toHaveBeenCalledTimes(2);expect(m.read.mock.lastCall![0].query).toBe('');
});
it('does not search unfinished composition or submit on the IME confirmation',async()=>{m.read.mockResolvedValue({success:true,data:data()});const input=host.querySelector('input')!;await act(async()=>input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await change('注音');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await tick();expect(m.read).not.toHaveBeenCalled();await act(async()=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await tick();expect(m.read).toHaveBeenCalledTimes(1);});
it('keeps existing results and exposes retry after a read failure',async()=>{m.read.mockResolvedValue({success:false,error:'連線失敗'});await change('姓名');await tick();expect(host.querySelector('[role=alert]')!.textContent).toContain('連線失敗');expect(host.textContent).toContain('共 0 筆');expect(host.querySelector('input')!.value).toBe('姓名');});
