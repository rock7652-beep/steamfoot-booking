// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {FetchLiffConsumptionResult} from '@/server/actions/liff-consumption';
const m=vi.hoisted(()=>({init:vi.fn(),refresh:vi.fn(),wallets:vi.fn(),consumption:vi.fn(),router:{replace:vi.fn()}}));
vi.mock('next/navigation',()=>({useRouter:()=>m.router}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:React.ReactNode})=>h('a',{href},children)}));
vi.mock('@/lib/liff/client',()=>({initLiff:m.init,isInLineClient:()=>true,getIDToken:()=> 'isolated-token'}));
vi.mock('@/lib/liff/session-refresh',()=>({refreshLiffSession:m.refresh}));
vi.mock('@/server/actions/liff-my-wallets',()=>({fetchLiffWallets:m.wallets}));
vi.mock('@/server/actions/liff-consumption',()=>({fetchLiffConsumption:m.consumption}));
import {WalletsList} from '@/app/(liff)/liff/wallets/wallets-list';
const initialWallets={status:'ok' as const,active:[],expired:[],history:[],makeupCredits:[]};
let root:Root,host:HTMLDivElement,finish:(value:FetchLiffConsumptionResult)=>void;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);m.init.mockResolvedValue(undefined);m.refresh.mockResolvedValue({status:'session_created'});m.wallets.mockResolvedValue(initialWallets);m.consumption.mockReturnValue(new Promise<FetchLiffConsumptionResult>(resolve=>{finish=resolve;}));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function open(){await act(async()=>root.render(h(WalletsList,{initialWallets,storeSlug:'isolated',storeName:'隔離店',liffId:'isolated',contactUrl:'',dataSource:'steamfoot'})));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='消費紀錄')!.click());}
it('shows unread consumption as loading alongside preloaded wallets, then displays the authorized result',async()=>{
 await open();expect(host.querySelector('[role=status]')?.textContent).toContain('讀取消費紀錄');expect(host.textContent).not.toContain('目前還沒有消費紀錄');
 await act(async()=>finish({status:'ok',rows:[{id:'purchase',date:'2026-11-01T02:00:00Z',item:'十堂方案',amount:5000,paymentMethod:'轉帳',status:'已收款'}]}));
 expect(host.querySelector('[role=status]')).toBeNull();expect(host.textContent).toContain('十堂方案');expect(host.textContent).toContain('5,000');expect(host.textContent).not.toContain('目前還沒有消費紀錄');
});
it('only displays the empty state after a successful empty authorized read',async()=>{
 await open();expect(host.textContent).not.toContain('目前還沒有消費紀錄');await act(async()=>finish({status:'ok',rows:[]}));expect(host.textContent).toContain('目前還沒有消費紀錄');
});
it('does not turn a failed consumption read into a successful empty result',async()=>{
 await open();await act(async()=>finish({status:'service_unavailable'}));expect(host.textContent).not.toContain('目前還沒有消費紀錄');expect(host.querySelector('[role=tablist]')).toBeNull();
});
