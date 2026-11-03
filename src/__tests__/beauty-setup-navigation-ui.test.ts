// @vitest-environment jsdom
import {act,createElement as h,type ReactNode,type MouseEventHandler} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({path:'/s/beauty/admin/dashboard/beauty',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>m.path,useSearchParams:()=>new URLSearchParams(m.query),useRouter:()=>({replace:m.replace})}));
vi.mock('@/components/app-link',()=>({AppLink:({href,children,className,onClick}:{href:string;children?:ReactNode;className?:string;onClick?:MouseEventHandler<HTMLAnchorElement>})=>h('a',{href,className,onClick},children)}));
import {BeautySetupNavigation} from '@/components/beauty/setup-navigation';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let root:ReturnType<typeof createRoot>|undefined;
function mount(){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(h(BeautySetupNavigation)));return host;}
beforeEach(()=>{m.query='';m.path='/s/beauty/admin/dashboard/beauty';vi.clearAllMocks();});afterEach(()=>{act(()=>root?.unmount());document.body.replaceChildren();});
it('keeps next and previous steps inside the selected store and in the confirmed order',()=>{m.query='tab=服務項目&beautySetup=services';const host=mount();expect(host.textContent).toContain('4／8');const next=[...host.querySelectorAll('a')].find(a=>a.textContent?.includes('下一步'))!;const url=new URL(next.getAttribute('href')!,'https://local');expect(url.pathname).toBe('/s/beauty/admin/dashboard/beauty');expect(url.searchParams.get('tab')).toBe('技師管理');expect(url.searchParams.get('beautySetup')).toBe('technicians');});
it('can continue across the shared staff page without losing the store prefix',()=>{m.path='/s/beauty/admin/dashboard/staff';m.query='beautySetup=staff';const host=mount();expect(host.textContent).toContain('7／8');expect([...host.querySelectorAll('a')].every(a=>a.getAttribute('href')?.startsWith('/s/beauty/admin/dashboard/'))).toBe(true);});
it('ending the guide removes only its marker, preserving the current page and filters',()=>{m.query='tab=服務項目&filter=active&beautySetup=services';const host=mount();act(()=>host.querySelector('button')!.click());const url=new URL(m.replace.mock.calls[0][0],'https://local');expect(url.pathname).toBe(m.path);expect(url.searchParams.has('beautySetup')).toBe(false);expect(url.searchParams.get('filter')).toBe('active');});
it.each(['','beautySetup=SPA','setupFlow=course'])('does not appear for an absent or unrelated marker: %s',query=>{m.query=query;expect(mount().textContent).toBe('');});
