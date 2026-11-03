// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {BeautyWorkRecords} from '@/components/beauty/portal-details';
import type {BeautyPortalData} from '@/server/beauty/queries';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:Array<{root:ReturnType<typeof createRoot>;host:HTMLDivElement}>=[];
afterEach(()=>{for(const{root,host}of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.unstubAllGlobals();});
it('settles pending records after one GET and does not reread or flash on ordinary rerenders',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{items:[],hasMore:false}})});vi.stubGlobal('fetch',fetcher);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});const props={scope:'store/user/live',month:'2026-10',pending:true,search:'',onMonth:vi.fn(),onPending:vi.fn(),onSearch:vi.fn(),data:{store:{slug:'test'},locations:[],grants:[]}as unknown as BeautyPortalData,now:Date.now(),disabled:false,onChange:vi.fn(),onMove:vi.fn()};
 await act(async()=>root.render(h(BeautyWorkRecords,props)));expect(host.textContent).toContain('沒有符合條件的紀錄');expect(host.textContent).not.toContain('讀取中');
 for(let n=0;n<12;n++)await act(async()=>root.render(h(BeautyWorkRecords,{...props,now:props.now+n*1000})));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain('/api/beauty/portal-details?');expect(host.textContent).not.toContain('讀取中');
});
it('shows a failed read once and retries only when requested',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({success:false,error:'讀取失敗'})}).mockResolvedValue({ok:true,json:async()=>({success:true,data:{items:[],hasMore:false}})});vi.stubGlobal('fetch',fetcher);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});const props={scope:'store/user/live',month:'2026-10',pending:true,search:'',onMonth:vi.fn(),onPending:vi.fn(),onSearch:vi.fn(),data:{store:{slug:'test'},locations:[],grants:[]}as unknown as BeautyPortalData,now:Date.now(),disabled:false,onChange:vi.fn(),onMove:vi.fn()};await act(async()=>root.render(h(BeautyWorkRecords,props)));expect(host.textContent).toContain('讀取失敗');expect(fetcher).toHaveBeenCalledTimes(1);await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='重試')!.click());expect(host.textContent).toContain('沒有符合條件的紀錄');expect(fetcher).toHaveBeenCalledTimes(2);
});
