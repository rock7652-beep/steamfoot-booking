// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {useCalendarMonthPreload,useIdleReadPreload} from '@/components/admin/use-calendar-month-preload';
import {createClientReadCache} from '@/lib/client-read-cache';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();});
function Harness(props:Parameters<typeof useCalendarMonthPreload>[0]){useCalendarMonthPreload(props);return null;}
const render=async(props:Parameters<typeof useCalendarMonthPreload>[0])=>{await act(async()=>root.render(React.createElement(Harness,props)));};
const tick=async(ms:number)=>{await act(async()=>vi.advanceTimersByTimeAsync(ms));};
it('starts both directions after the first render and covers two months each way with at most two reads',async()=>{
 const finish:Array<()=>void>=[];
 const reader={read:vi.fn(()=>new Promise<void>(resolve=>finish.push(resolve))),get:()=>undefined};
 await render({enabled:true,date:'2026-12-27',blocked:false,reader});expect(reader.read).not.toHaveBeenCalled();
 await tick(250);expect(reader.read.mock.calls).toEqual([['2026-11-01'],['2027-01-01']]);
 await act(async()=>finish[0]());await tick(1);expect(reader.read.mock.calls.at(-1)).toEqual(['2026-10-01']);
 await act(async()=>finish[1]());await tick(1);expect(reader.read.mock.calls.at(-1)).toEqual(['2027-02-01']);
 await act(async()=>{finish.slice(2).forEach(resolve=>resolve());});
});
it('pauses for an open editor, hidden tab, offline state and focused input',async()=>{
 const reader={read:vi.fn(async()=>null),get:()=>undefined};
 await render({enabled:true,date:'2026-11-04',blocked:true,reader});await tick(5000);expect(reader.read).not.toHaveBeenCalled();
 await render({enabled:true,date:'2026-11-04',blocked:false,reader});
 vi.mocked(Object.getOwnPropertyDescriptor(document,'hidden')!.get!).mockReturnValue(true);await tick(1500);expect(reader.read).not.toHaveBeenCalled();
 vi.mocked(Object.getOwnPropertyDescriptor(document,'hidden')!.get!).mockReturnValue(false);
 const input=document.createElement('input');host.append(input);input.focus();await tick(1500);expect(reader.read).not.toHaveBeenCalled();input.blur();
 vi.mocked(Object.getOwnPropertyDescriptor(navigator,'onLine')!.get!).mockReturnValue(false);await tick(1500);expect(reader.read).not.toHaveBeenCalled();
 vi.mocked(Object.getOwnPropertyDescriptor(navigator,'onLine')!.get!).mockReturnValue(true);await tick(1500);expect(reader.read).toHaveBeenCalledTimes(4);
});
it('deduplicates navigation during prefetch and rejects late writes after invalidation',async()=>{
 const resolves=new Map<string,(value:string)=>void>();
 const fetcher=vi.fn((key:string)=>new Promise<string>(resolve=>resolves.set(key,resolve)));
 const cache=createClientReadCache(fetcher,{ttlMs:15000,maxEntries:5});
 const reader={read:cache.load,get:cache.get,snapshot:cache.snapshot};
 await render({enabled:true,date:'2026-11-01',blocked:false,reader});await tick(250);
 const click=reader.read('2026-10-01');expect(fetcher).toHaveBeenCalledTimes(2);cache.clear();resolves.get('2026-10-01')!('old');await click;expect(reader.snapshot('2026-10-01')).toBeUndefined();
});
it('cancels remaining targets and caps outstanding reads across rapid month changes',async()=>{
 const finish:Array<()=>void>=[];
 const reader={read:vi.fn(()=>new Promise<void>(resolve=>finish.push(resolve))),get:()=>undefined};
 await render({enabled:true,date:'2026-11-01',blocked:false,reader});await tick(250);
 await render({enabled:true,date:'2027-03-01',blocked:false,reader});await tick(1000);expect(reader.read).toHaveBeenCalledTimes(2);
 await act(async()=>{finish[0]();finish[1]();});await tick(250);
 expect(reader.read.mock.calls.slice(2)).toEqual([['2027-02-01'],['2027-04-01']]);
 await render({enabled:false,date:'2027-03-01',blocked:false,reader});await act(async()=>{finish.slice(2).forEach(resolve=>resolve());});await tick(1000);expect(reader.read).toHaveBeenCalledTimes(4);
});
it('does not repeatedly fetch expired display snapshots while navigation still revalidates them',async()=>{
 const fetcher=vi.fn(async(key:string)=>key);
 const cache=createClientReadCache(fetcher,{ttlMs:100,maxEntries:5});
 for(const month of ['2026-09','2026-10','2026-12','2027-01'])cache.seed(month+'-01','snapshot');
 await tick(120000);
 const reader={read:cache.load,get:cache.get,snapshot:cache.snapshot};
 await render({enabled:true,date:'2026-11-01',blocked:false,reader});await tick(500);expect(fetcher).not.toHaveBeenCalled();
 await cache.load('2026-10-01',{revalidate:true});expect(fetcher).toHaveBeenCalledOnce();
});

it('preloads settled search results while the search field retains focus, but still pauses for editing',async()=>{
 function SearchHarness({blocked=false}:{blocked?:boolean}){useIdleReadPreload({enabled:true,keys:['student'],blocked,reader,allowFocusedInput:true});return null;}
 const reader={read:vi.fn(async()=>null),get:()=>undefined},input=document.createElement('input');document.body.append(input);input.focus();
 try{await act(async()=>root.render(React.createElement(SearchHarness,{blocked:true})));await tick(2000);expect(reader.read).not.toHaveBeenCalled();
 await act(async()=>root.render(React.createElement(SearchHarness,{})));await tick(1500);expect(reader.read).toHaveBeenCalledExactlyOnceWith('student');}
 finally{input.remove();}
});
