// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {CourseAgreementDownload} from '@/components/course-agreements/download';
let container:HTMLDivElement,root:Root;
const fetcher=vi.fn(),objectUrl=vi.fn();
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('fetch',fetcher);fetcher.mockReset();objectUrl.mockReset();objectUrl.mockReturnValue('blob:synthetic');
 Object.defineProperty(URL,'createObjectURL',{value:objectUrl,writable:true,configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),writable:true,configurable:true});
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('aborts an old download when the record or store URL changes',async()=>{
 let signal:AbortSignal|undefined;
 fetcher.mockImplementation((_href:string,init:RequestInit)=>new Promise((_resolve,reject)=>{signal=init.signal as AbortSignal;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));}));
 await act(async()=>root.render(createElement(CourseAgreementDownload,{href:'/api/course-agreements/records/a/pdf?storeId=a'})));
 await act(async()=>container.querySelector('button')!.click());
 await act(async()=>root.render(createElement(CourseAgreementDownload,{href:'/api/course-agreements/records/b/pdf?storeId=b'})));
 expect(signal?.aborted).toBe(true);expect(objectUrl).not.toHaveBeenCalled();expect(container.querySelector('button')!.disabled).toBe(false);expect(container.querySelector('[role="alert"]')).toBeNull();
});
it('keeps permission errors in place and can retry the same PDF',async()=>{
 fetcher.mockResolvedValueOnce({ok:false,json:async()=>({error:'沒有匯出權限'})});
 await act(async()=>root.render(createElement(CourseAgreementDownload,{href:'/api/course-agreements/records/a/pdf?storeId=a'})));await act(async()=>container.querySelector('button')!.click());
 expect(container.querySelector('[role="alert"]')?.textContent).toBe('沒有匯出權限');expect(objectUrl).not.toHaveBeenCalled();
 fetcher.mockResolvedValueOnce({ok:true,headers:new Headers({'content-type':'application/pdf','content-disposition':'attachment; filename="signed.pdf"'}),blob:async()=>new Blob(['%PDF-1.7'],{type:'application/pdf'})});
 await act(async()=>container.querySelector('button')!.click());expect(objectUrl).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/course-agreements/records/a/pdf?storeId=a','/api/course-agreements/records/a/pdf?storeId=a']);expect(container.querySelector('[role="alert"]')).toBeNull();
});
