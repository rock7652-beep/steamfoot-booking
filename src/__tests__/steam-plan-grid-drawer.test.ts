// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/customer-panel-records',()=>({getCustomerPanelWalletSessions:m.read}));
vi.mock('@/app/(dashboard)/dashboard/customers/[id]/void-session-button',()=>({VoidSessionButton:()=>null}));
vi.mock('@/components/admin/wallet-session-correction-form',()=>({WalletSessionCorrectionForm:()=>null}));
import {CustomerPanelSessions} from '@/app/(dashboard)/dashboard/customers/_components/customer-panel-sessions';
it('loads dates on display and shows slots without opening management or the ledger',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 m.read.mockResolvedValue({success:true,data:Array.from({length:10},(_,i)=>({id:String(i),sessionNo:i+1,status:i===0?'COMPLETED':'AVAILABLE',completedAt:i===0?new Date('2026-11-03T02:00Z'):null,reservedAt:null,voidedAt:null,voidReason:null,booking:null}))});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(CustomerPanelSessions,{customerId:"customer",walletId:"wallet",totalSessions:10,remainingSessions:9})));expect(m.read).toHaveBeenCalledWith('customer','wallet');expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.querySelector('[data-lesson-slot]')?.closest('details')).toBeNull();expect(host.textContent).toContain('11/03');expect(host.querySelectorAll('details')).toHaveLength(1);}finally{await act(async()=>root.unmount());host.remove();}
});

it('uses prefetched grid data immediately without another request on drawer open',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.read.mockClear();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(CustomerPanelSessions,{customerId:'customer',walletId:'wallet',totalSessions:10,remainingSessions:10,initialProgress:{available:true,total:10,completed:[],voided:[]}})));expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(m.read).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});
