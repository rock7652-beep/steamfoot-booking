// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard/courses',useSearchParams:()=>new URLSearchParams()}));
import {MySubscriptionReferralCode} from '@/components/subscription-referrals/my-code';
let root:Root,host:HTMLDivElement;
const create=vi.fn(),copy=vi.fn();
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});copy.mockResolvedValue(undefined);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(code:string|null='SB-ABCDEFGH',extra={}){await act(async()=>root.render(createElement(MySubscriptionReferralCode,{inline:true,initialCode:code,createAction:create,expectedStoreId:'store-a',...extra})));}
async function click(text:string){await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text)!.click());}
it('displays and copies the original code and link without navigation or creation',async()=>{
 const url=window.location.href;await render();expect(host.textContent).toContain('SB-ABCDEFGH');expect(host.querySelector('a')).toBeNull();
 await click('複製推薦碼');expect(copy).toHaveBeenLastCalledWith('SB-ABCDEFGH');await click('複製連結');expect(copy).toHaveBeenLastCalledWith('https://www.steamfoot.com/apply?ref=SB-ABCDEFGH');
 expect(create).not.toHaveBeenCalled();expect(window.location.href).toBe(url);
});
it('requires an explicit creation and pins it to the displayed store',async()=>{
 await render(null);expect(create).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('input[name="expectedStoreId"]')?.value).toBe('store-a');expect(host.textContent).toContain('取得推薦碼');
});
it('shows failure or read-only state without offering an unintended creation',async()=>{
 await render(null,{unavailable:'暫時無法讀取推薦碼'});expect(host.textContent).toContain('暫時無法讀取推薦碼');expect(host.querySelector('form')).toBeNull();
 await render(null,{canCreate:false});expect(host.querySelector('form')).toBeNull();expect(create).not.toHaveBeenCalled();
});
it('retains a manually copyable code if clipboard permission is denied',async()=>{
 copy.mockRejectedValue(new Error('clipboard denied'));await render();await click('複製推薦碼');expect(host.textContent).toContain('SB-ABCDEFGH');expect(host.textContent).toContain('手動複製');
});

it('creates only after explicit submit and displays the returned code without navigation',async()=>{
 create.mockResolvedValue({success:true,message:'推薦碼已建立',code:'SB-ABCDEFGH'});const url=window.location.href;
 await render(null);expect(create).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(create).toHaveBeenCalledOnce();expect(create.mock.calls[0][1].get('expectedStoreId')).toBe('store-a');expect(host.textContent).toContain('SB-ABCDEFGH');expect(host.querySelector('a')).toBeNull();expect(window.location.href).toBe(url);
});
