// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/music-customer-attention',()=>({loadMusicCustomerAttention:m.load}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh}),usePathname:()=>'/s/lubymusic/admin/dashboard/courses',useSearchParams:()=>new URLSearchParams('view=customers')}));
vi.mock('@/lib/music-finance-sync',async original=>({...await original<typeof import('@/lib/music-finance-sync')>(),isMusicPreviewPage:()=>true}));
import {PanelReadProvider,usePanelReader} from '@/components/operations/panel-read-cache';
import {MusicCustomerAttention} from '@/app/(dashboard)/dashboard/courses/music-customer-attention';
import {MUSIC_FINANCE_SIGNAL} from '@/lib/music-finance-sync';
let root:Root,host:HTMLDivElement;
const amount=(outstanding:number)=>({success:true,data:{outstanding,pending:0}});
const unrelated=vi.fn(async(id:string)=>({success:true,id}));
function OtherReader(){const reader=usePanelReader('unrelated-card',unrelated,'',15000);return createElement('button',{onClick:()=>void reader.read('card')},'read card');}
function Tree({visible=true,customerId='customer'}:{visible?:boolean;customerId?:string}){return createElement(PanelReadProvider,null,createElement(OtherReader),visible?createElement(MusicCustomerAttention,{customerId,revision:0,onRecords:()=>{}}):null);}
const receipt=()=>window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail:'receipt:'+crypto.randomUUID()}));
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('clears a mounted collection reminder after a receipt without refreshing the page or unrelated cards',async()=>{
 m.load.mockResolvedValueOnce(amount(800)).mockResolvedValueOnce(amount(0));
 await act(async()=>root.render(createElement(Tree)));
 expect(host.textContent).toContain('待收 NT$ 800');
 await act(async()=>host.querySelector('button')!.click());
 await act(async()=>receipt());
 expect(host.textContent).not.toContain('待收');expect(m.load).toHaveBeenCalledTimes(2);expect(m.refresh).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('button')!.click());expect(unrelated).toHaveBeenCalledTimes(1);
});
it('invalidates the retained reminder when payment occurs while the overview is unmounted',async()=>{
 m.load.mockResolvedValueOnce(amount(800)).mockResolvedValueOnce(amount(0));
 await act(async()=>root.render(createElement(Tree)));
 await act(async()=>root.render(createElement(Tree,{visible:false})));
 await act(async()=>receipt());
 await act(async()=>root.render(createElement(Tree)));
 expect(host.textContent).not.toContain('待收');expect(m.load).toHaveBeenCalledTimes(2);expect(m.refresh).not.toHaveBeenCalled();
});
it('ignores a late pre-receipt amount after the refreshed result has arrived',async()=>{
 let finish!:(value:ReturnType<typeof amount>)=>void;
 m.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(amount(0));
 await act(async()=>root.render(createElement(Tree)));
 await act(async()=>receipt());
 await act(async()=>finish(amount(800)));
 expect(host.textContent).not.toContain('待收');expect(m.load).toHaveBeenCalledTimes(2);
});
