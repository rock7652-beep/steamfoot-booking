// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {CustomerPrimaryContent} from '@/components/admin/customer-primary-content';
it('mounts fresh preloaded content immediately and ignores a late previous customer response',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div'),root=createRoot(host);
 let first!:()=>void,second!:()=>void;
 const reader={get:(id:string)=>id==='ready',read:vi.fn((id:string)=>id==='ready'?Promise.resolve():new Promise<void>(resolve=>{if(id==='first')first=resolve;else second=resolve;}))};
 const render=(id:string)=>act(async()=>root.render(React.createElement(CustomerPrimaryContent,{customerId:id,reader},React.createElement('p',null,'完整資料 '+id))));
 try{
  await render('ready');expect(host.textContent).toBe('完整資料 ready');
  await render('first');expect(host.textContent).toBe('讀取顧客資料中…');await render('second');
  await act(async()=>first());expect(host.textContent).not.toContain('完整資料');await act(async()=>second());expect(host.textContent).toBe('完整資料 second');
 }finally{await act(async()=>root.unmount());}
});
it('shows a retryable error without mounting consumers that would start another loading chain',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div'),root=createRoot(host),mounted=vi.fn();
 const reader={get:()=>false,read:vi.fn<()=>Promise<void>>().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(undefined)};
 function Child(){mounted();return React.createElement('p',null,'日期格已備齊');}
 try{
  await act(async()=>root.render(React.createElement(CustomerPrimaryContent,{customerId:'a',reader},React.createElement(Child))));expect(host.textContent).toContain('讀取失敗');expect(mounted).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toBe('日期格已備齊');expect(reader.read).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
