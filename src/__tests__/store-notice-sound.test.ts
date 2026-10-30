// @vitest-environment jsdom
import {act,createElement,StrictMode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {StoreNoticeBell} from "@/components/admin/store-notice-bell";
let root:Root,host:HTMLDivElement,count:number,latestAt:string|null;
const beep=vi.fn(),resume=vi.fn(),close=vi.fn();
class TestAudioContext {
 state='suspended';currentTime=0;destination={};
 constructor(){contexts.push(this);}
 resume(){resume();this.state='running';return Promise.resolve();}
 close(){close();this.state='closed';return Promise.resolve();}
 createOscillator(){return {connect:vi.fn(),frequency:{value:0},start:beep,stop:vi.fn()};}
 createGain(){return {connect:vi.fn(),gain:{value:0}};}
}
let contexts:TestAudioContext[];
const load=vi.fn(async({storeId}:{storeId:string})=>({success:true as const,storeId,enabled:true,items:[],count,latestAt,canHandle:false,more:false}));
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();localStorage.clear();count=1;latestAt=null;contexts=[];
 vi.stubGlobal('AudioContext',TestAudioContext);host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(namespace:'course'|'steamfoot',storeId='s',strict=false){
 const element=createElement(StoreNoticeBell,{storeId,namespace,initialEnabled:true,loadNotices:load,markNotice:vi.fn()});
 await act(async()=>root.render(strict?createElement(StrictMode,null,element):element));
}
async function focusWith(next:number){count=next;await act(async()=>window.dispatchEvent(new Event('focus')));}
async function gesture(type='pointerdown'){await act(async()=>document.dispatchEvent(new Event(type,{bubbles:true})));}
async function open(){await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());return document.querySelector<HTMLInputElement>('[aria-label="此裝置提示音"]')!;}
it.each(['course','steamfoot'] as const)('%s defaults on and unlocks from the work page without opening the bell',async namespace=>{
 await mount(namespace);expect(contexts).toHaveLength(0);expect(beep).not.toHaveBeenCalled();
 await gesture();expect(resume).toHaveBeenCalledTimes(1);expect(document.querySelector('[role="dialog"]')).toBeNull();
 await focusWith(2);expect(beep).toHaveBeenCalledTimes(1);
 await focusWith(2);await focusWith(1);expect(beep).toHaveBeenCalledTimes(1);
 const sound=await open();expect(sound.checked).toBe(true);
 await act(async()=>sound.click());expect(localStorage.getItem(`${namespace}-notice-sound:s`)).toBe('off');
 await focusWith(3);expect(beep).toHaveBeenCalledTimes(1);
 await act(async()=>sound.click());expect(localStorage.getItem(`${namespace}-notice-sound:s`)).toBe('on');
 await focusWith(4);expect(beep).toHaveBeenCalledTimes(2);
});
it.each(['course','steamfoot'] as const)('%s preserves an existing off selection and scopes it to the store/module',async namespace=>{
 localStorage.setItem(`${namespace}-notice-sound:s`,'off');await mount(namespace);
 await gesture();await focusWith(2);expect(contexts).toHaveLength(0);expect((await open()).checked).toBe(false);
 await act(async()=>root.unmount());root=createRoot(host);await mount(namespace,'other');expect((await open()).checked).toBe(true);
});
it.each(['keydown','touchend'])('unlocks on %s but never sounds for the initial snapshot',async type=>{
 await mount('steamfoot');await gesture(type);expect(resume).toHaveBeenCalledTimes(1);expect(beep).not.toHaveBeenCalled();
 await focusWith(2);expect(beep).toHaveBeenCalledTimes(1);
});
it('does not attempt audio until a gesture and safely tolerates unsupported audio/storage',async()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('storage blocked');});vi.stubGlobal('AudioContext',undefined);
 await mount('steamfoot');await focusWith(2);await gesture();expect((await open()).checked).toBe(true);expect(beep).not.toHaveBeenCalled();expect(document.querySelector('[role="alert"]')).toBeNull();
});
it('retries an autoplay rejection on the next gesture without unhandled errors',async()=>{
 vi.spyOn(TestAudioContext.prototype,'resume').mockImplementationOnce(()=>Promise.reject(Error('autoplay')));
 await mount('steamfoot');await gesture();await focusWith(2);expect(beep).not.toHaveBeenCalled();
 await gesture();await focusWith(3);expect(beep).toHaveBeenCalledTimes(1);
});
it('cleans up audio/listeners and works after StrictMode effect replay',async()=>{
 await mount('steamfoot','s',true);await gesture();await focusWith(2);expect(beep).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());expect(close).toHaveBeenCalledTimes(1);await gesture();expect(contexts).toHaveLength(1);root=createRoot(host);
});
it('sounds when a new pending notice replaces a handled one without changing the count',async()=>{
 latestAt='2026-10-30T01:00:00Z';await mount('steamfoot');await gesture();
 latestAt='2026-10-30T01:01:00Z';await focusWith(1);expect(beep).toHaveBeenCalledTimes(1);
 await focusWith(1);expect(beep).toHaveBeenCalledTimes(1);
});
