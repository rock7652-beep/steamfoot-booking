// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {useBeautyCustomerRevision} from '@/components/beauty/use-customer-sync';
let host:HTMLDivElement,root:Root;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
function Probe({blocked}:{blocked:boolean}){const revision=useBeautyCustomerRevision(blocked);return h('output',null,String(revision));}
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=(blocked:boolean)=>act(async()=>root.render(h(Probe,{blocked})));
const changed=()=>act(()=>window.dispatchEvent(new Event('customer-search-invalidated')));
it('coalesces confirmed profile changes while editing and refreshes once after return',async()=>{await render(true);changed();changed();expect(host.textContent).toBe('0');await render(false);expect(host.textContent).toBe('1');await render(false);expect(host.textContent).toBe('1');});
it('refreshes a visible list without resetting its host or waiting for polling',async()=>{await render(false);changed();expect(host.textContent).toBe('1');changed();expect(host.textContent).toBe('2');});
