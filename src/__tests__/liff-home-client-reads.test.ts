// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({init:vi.fn(),token:vi.fn(),exchange:vi.fn(),access:vi.fn(),summary:vi.fn()}));
vi.mock('@/lib/liff/client',()=>({initLiff:m.init,getIDToken:m.token,isInLineClient:()=>true}));
vi.mock('@/lib/liff/session-refresh',()=>({refreshLiffSession:m.exchange}));
vi.mock('@/server/actions/liff-member-home',()=>({fetchLiffHomeAccess:m.access,fetchLiffHomeSummary:m.summary}));
vi.mock('@/server/actions/auth',()=>({logoutAction:vi.fn()}));
vi.mock('@/components/member-portal-header',()=>({MemberPortalHeader:({store,caption}: {store:React.ReactNode;caption:React.ReactNode})=>React.createElement('header',null,store,caption)}));
vi.mock('@/components/image-announcements/carousel',()=>({StoreImageAnnouncements:()=>React.createElement('section',{'data-announcements':true})}));
vi.mock('@/app/(liff)/liff/liff-store-switcher',()=>({LiffStoreSwitcher:()=>null}));
vi.mock('@/app/(liff)/liff/liff-bottom-nav',()=>({LiffBottomNav:()=>null}));
vi.mock('@/app/(liff)/liff/liff-store-share-card',()=>({LiffStoreShareCard:()=>null}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=>React.createElement('a',{href},children)}));
import {LiffShell} from '@/app/(liff)/liff/liff-shell';
import {STEAMFOOT_INDUSTRY_MODULE} from '@/lib/industry-modules';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);m.init.mockResolvedValue({});m.token.mockReturnValue('isolated-test-token');m.exchange.mockResolvedValue({status:'session_created',displayName:'測試會員'});m.access.mockResolvedValue({memberContext:{status:'signed_in',displayName:'測試會員',stores:[]},workAccess:{status:'no_access'}});host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
async function render(){await act(async()=>root.render(React.createElement(LiffShell,{storeSlug:'isolated',storeName:'隔離店',liffId:'isolated-liff',contactUrl:'',healthAssessmentEnabled:false,terminology:STEAMFOOT_INDUSTRY_MODULE.customer,memberDataSource:'steamfoot'})))}
it('renders announcements while the single summary request is pending',async()=>{
 m.summary.mockReturnValue(new Promise(()=>{}));await render();
 expect(m.exchange).toHaveBeenCalledTimes(1);expect(m.access).toHaveBeenCalledTimes(1);expect(m.summary).toHaveBeenCalledTimes(1);
 expect(m.summary).toHaveBeenCalledWith(false);expect(host.querySelector('[data-announcements]')).not.toBeNull();
});
it('does not start authenticated reads if LINE exchange fails',async()=>{
 m.exchange.mockResolvedValue({status:'expired'});await render();expect(m.access).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
it('does not start access or summary reads before session verification completes',async()=>{
 m.exchange.mockReturnValue(new Promise(()=>{}));await render();expect(m.access).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
