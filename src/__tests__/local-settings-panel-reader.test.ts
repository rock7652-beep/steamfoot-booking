// @vitest-environment jsdom
import {act,createElement as el,StrictMode,lazy} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LocalPanelContent} from '@/components/settings/local-panel-content';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove()});
it('uses server supplied content without another request',async()=>{
 const read=vi.fn();await act(async()=>root.render(el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',initialKey:JSON.stringify(['a','hours','']),initialContent:el('p',null,'已載入'),read})));
 expect(host.textContent).toBe('已載入');expect(read).not.toHaveBeenCalled();
});
it('deduplicates concurrent reads and never applies a late reply to another panel',async()=>{
 let done!:(value:never)=>void;const read=vi.fn((storeId:string,panel:string,query:string)=>panel==='hours'?new Promise<never>(resolve=>done=resolve):Promise.resolve({storeId,panel,query,content:el('p',null,'提醒')}));
 const render=(panel:string)=>el(PanelReadProvider,null,el(LocalPanelContent,{storeId:'a',panel,query:'',read}));
 await act(async()=>root.render(render('hours')));expect(host.textContent).toContain('正在讀取');
 await act(async()=>root.render(render('reminders')));expect(host.textContent).toBe('提醒');
 await act(async()=>done({storeId:'a',panel:'hours',query:'',content:el('p',null,'舊營業設定')} as never));expect(host.textContent).toBe('提醒');
});
it('rejects a mismatched store receipt and retries in the same block',async()=>{
 const read=vi.fn().mockResolvedValueOnce({storeId:'b',panel:'hours',query:'',content:el('p',null,'其他店')}).mockResolvedValueOnce({storeId:'a',panel:'hours',query:'',content:el('p',null,'正確店')});
 await act(async()=>root.render(el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',read})));expect(host.textContent).not.toContain('其他店');expect(host.textContent).toContain('讀取失敗');
 await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toBe('正確店');expect(read).toHaveBeenCalledTimes(2);
});

it('shares one in-flight request during StrictMode replay',async()=>{
 let done!:(value:never)=>void;const read=vi.fn(()=>new Promise<never>(resolve=>done=resolve));
 await act(async()=>root.render(el(StrictMode,null,el(PanelReadProvider,null,el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',read})))));
 expect(read).toHaveBeenCalledOnce();await act(async()=>done({storeId:'a',panel:'hours',query:'',content:el('p',null,'單次讀取')} as never));expect(host.textContent).toBe('單次讀取');
});

it('keeps delayed component chunks inside the panel instead of suspending its host',async()=>{
 let done!:(value:{default:()=>ReturnType<typeof el>})=>void;
 const Delayed=lazy(()=>new Promise<{default:()=>ReturnType<typeof el>}>(resolve=>{done=resolve}));
 const read=vi.fn().mockResolvedValue({storeId:'a',panel:'hours',query:'',content:el(Delayed)});
 await act(async()=>root.render(el('main',null,el('nav',null,'原設定分類'),el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',read}))));
 expect(host.querySelector('nav')?.textContent).toBe('原設定分類');expect(host.querySelector('[role=status]')?.textContent).toContain('正在讀取');
 await act(async()=>done({default:()=>el('p',null,'完整設定內容')}));expect(host.textContent).toContain('完整設定內容');expect(host.querySelector('nav')?.textContent).toBe('原設定分類');
});

it('does not replace an initialized editor when background RSC props change',async()=>{
 const key=JSON.stringify(['a','hours','']);const read=vi.fn();
 await act(async()=>root.render(el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',initialKey:key,initialContent:el('input',{defaultValue:'原值','aria-label':'草稿'}),read})));
 const input=host.querySelector('input')!;input.value='未儲存內容';
 await act(async()=>root.render(el(LocalPanelContent,{storeId:'a',panel:'hours',query:'',initialKey:key,initialContent:el('input',{defaultValue:'背景新值','aria-label':'草稿'}),read})));
 expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('未儲存內容');expect(read).not.toHaveBeenCalled();
});
