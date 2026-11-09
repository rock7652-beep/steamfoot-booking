// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),read:vi.fn(),prepare:vi.fn(),commit:vi.fn(),cancel:vi.fn(),ack:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock('@/components/admin/modal-panel',()=>({ModalPanel:({children}:{children:React.ReactNode})=>h('div',{role:'dialog'},children)}));
vi.mock('@/server/actions/beauty-online-confirm-intent',()=>({listBeautyOnlineConfirm:m.list,readBeautyOnlineConfirm:m.read,prepareBeautyOnlineConfirm:m.prepare,commitBeautyOnlineConfirm:m.commit,cancelBeautyOnlineConfirm:m.cancel,acknowledgeBeautyOnlineConfirm:m.ack}));
import {BeautyOnlineConfirmProvider,useBeautyOnlineConfirm} from '@/components/beauty/online-confirm-recovery';
const key='11111111-1111-4111-8111-111111111111';
const committed={orderId:'order',requestKey:key,status:'COMMITTED',purchaseId:'card',customerName:'測試會員',planName:'測試方案',amount:800,canCommit:true};
let host:HTMLDivElement,root:Root;
function Entry(){const recovery=useBeautyOnlineConfirm();return h('button',{disabled:recovery?.disabled,onClick:()=>recovery?.open('new-order')},'訂單核帳');}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks();m.list.mockResolvedValue({success:true,data:[committed]});m.ack.mockResolvedValue({success:true,data:{...committed,status:'ACKNOWLEDGED'}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('keeps the committed result reachable after the pending order disappeared and requires acknowledgement',async()=>{
 await act(async()=>{root.render(h(BeautyOnlineConfirmProvider,{storeId:'store',userId:'manager',children:h(Entry)}));});
 expect(host.textContent).toContain('測試會員 · 測試方案');expect(host.textContent).toContain('核帳請求已完成');
 const start=[...host.querySelectorAll('button')].find(x=>x.textContent==='訂單核帳');expect(start?.disabled).toBe(true);
 m.list.mockResolvedValue({success:true,data:[]});
 const ack=[...host.querySelectorAll('button')].find(x=>x.textContent==='確認已核帳');expect(ack).toBeTruthy();
 await act(async()=>{ack!.click();});
 expect(m.ack).toHaveBeenCalledWith({expectedStoreId:'store',orderId:'order',requestKey:key});expect(m.refresh).toHaveBeenCalledOnce();expect(host.textContent).not.toContain('核帳請求已完成');
});
