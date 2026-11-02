// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),mutate:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard/beauty',useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/admin/settings-panel-context',()=>({useSettingsPanelGuard:vi.fn()}));
vi.mock('@/server/actions/beauty-shared-goods',()=>({readBeautySharedGoods:m.read,mutateBeautySharedGoods:m.mutate}));
import {BeautySharedGoodsPanel} from '@/components/beauty/shared-goods-panel';
it('opens the Beauty cart directly and guards closing unsaved quantities',async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host),close=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);m.read.mockResolvedValue({success:true,data:{catalogRevision:1,groups:[{id:'g',title:'飲品',kind:'SHARED_GOODS',required:false,multiple:true,options:[{id:'tea',name:'茶',price:80,duration:0,active:true}]}],order:null,receipts:[],collected:0,editable:true,canSelect:true}});const button=(name:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
 try{await act(async()=>root.render(createElement(BeautySharedGoodsPanel,{storeId:'s',appointmentId:'a',canEdit:true,canCollect:true,canRefund:true,onBusy:vi.fn(),onClose:close})));expect(m.read).toHaveBeenCalledWith({storeId:'s',bookingId:'a',participantId:'a'});await act(async()=>button('調整品項').click());await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button('關閉').click());expect(confirm).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(host.querySelector('output')?.textContent).toBe('1');await act(async()=>button('取消').click());await act(async()=>button('關閉').click());expect(close).toHaveBeenCalledOnce();}finally{confirm.mockRestore();await act(async()=>root.unmount());host.remove();}
});
