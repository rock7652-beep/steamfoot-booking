// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {useCalendarMonthPreload} from '@/components/admin/use-calendar-month-preload';
import {createClientReadCache} from '@/lib/client-read-cache';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();});
function Harness(props:Parameters<typeof useCalendarMonthPreload>[0]){useCalendarMonthPreload(props);return null;}
const render=async(props:Parameters<typeof useCalendarMonthPreload>[0])=>{await act(async()=>root.render(React.createElement(Harness,props)));};
const tick=async(ms:number)=>{await act(async()=>vi.advanceTimersByTimeAsync(ms));};
it('renders first, then sequentially preloads adjacent full months including year rollover',async()=>{
 const reader={read:vi.fn(async()=>({success:true})),get:()=>undefined};
 await render({enabled:true,date:'2026-12-27',blocked:false,reader});expect(reader.read).not.toHaveBeenCalled();
 await tick(1500);expect(reader.read.mock.calls).toEqual([['2026-11-01']]);
 await tick(500);expect(reader.read.mock.calls).toEqual([['2026-11-01'],['2027-01-01']]);
});
it('pauses for an open editor, hidden tab, offline state and focused input',async()=>{
 const reader={read:vi.fn(async()=>null),get:()=>undefined};
 await render({enabled:true,date:'2026-11-04',blocked:true,reader});await tick(5000);expect(reader.read).not.toHaveBeenCalled();
 await render({enabled:true,date:'2026-11-04',blocked:false,reader});
 vi.mocked(Object.getOwnPropertyDescriptor(document,'hidden')!.get!).mockReturnValue(true);await tick(1500);expect(reader.read).not.toHaveBeenCalled();
 vi.mocked(Object.getOwnPropertyDescriptor(document,'hidden')!.get!).mockReturnValue(false);
 const input=document.createElement('input');host.append(input);input.focus();await tick(1500);expect(reader.read).not.toHaveBeenCalled();input.blur();
 vi.mocked(Object.getOwnPropertyDescriptor(navigator,'onLine')!.get!).mockReturnValue(false);await tick(1500);expect(reader.read).not.toHaveBeenCalled();
 vi.mocked(Object.getOwnPropertyDescriptor(navigator,'onLine')!.get!).mockReturnValue(true);await tick(1500);expect(reader.read).toHaveBeenCalledOnce();
});
it('deduplicates a click during prefetch, retries failures and rejects late cache writes after invalidation',async()=>{
 let resolve!:(value:string)=>void;
 const fetcher=vi.fn(()=>new Promise<string>(r=>{resolve=r;}));
 const cache=createClientReadCache(fetcher,{ttlMs:15000,maxEntries:5});
 const reader={read:cache.load,get:cache.get};
 await render({enabled:true,date:'2026-11-01',blocked:false,reader});await tick(1500);
 const click=reader.read('2026-10-01');expect(fetcher).toHaveBeenCalledOnce();cache.clear();resolve('old');await click;expect(reader.get('2026-10-01')).toBeUndefined();
 fetcher.mockRejectedValueOnce(new Error('offline'));
 await expect(reader.read('2026-10-01')).rejects.toThrow('offline');
 fetcher.mockResolvedValueOnce('new');expect(await reader.read('2026-10-01')).toBe('new');
});
it('cancels remaining neighbors on rapid month or store changes and does not cache failed payloads',async()=>{
 let finish!:(value:unknown)=>void;
 const reader={read:vi.fn(()=>new Promise(r=>{finish=r;})),get:()=>undefined};
 await render({enabled:true,date:'2026-11-01',blocked:false,reader});await tick(1500);
 const next={read:vi.fn(async()=>null),get:()=>undefined};
 await render({enabled:true,date:'2026-12-01',blocked:false,reader:next});finish(null);await tick(500);expect(reader.read).toHaveBeenCalledOnce();
 await tick(1000);expect(next.read).toHaveBeenCalledWith('2026-11-01');
});
