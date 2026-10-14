// @vitest-environment jsdom
import {act,createElement as el} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({props:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/a/admin/dashboard/courses'}));
vi.mock('next/link',()=>({default:(props:unknown)=>{m.props(props);return null},useLinkStatus:()=>({pending:false})}));
import {AppLink} from '@/components/app-link';
import {SettingsPanelContext} from '@/components/admin/settings-panel-context';
it('does not prefetch full RSC routes for local settings content',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');const root=createRoot(host);
 try{await act(async()=>root.render(el(SettingsPanelContext.Provider,{value:{local:true,navigate:vi.fn(),report:vi.fn()}},el(AppLink,{href:'/s/a/admin/dashboard/courses?view=settings&panel=referral',children:'推薦'}))));expect(m.props.mock.calls.at(-1)?.[0].prefetch).toBe(false);
 await act(async()=>root.render(el(AppLink,{href:'/s/a/admin/dashboard/customers/a/edit',prefetch:true,children:'編輯'})));expect(m.props.mock.calls.at(-1)?.[0].prefetch).toBe(true);}finally{await act(async()=>root.unmount())}
});
