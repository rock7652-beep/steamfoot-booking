import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {withPermissionRequestSession,withCheckoutPermissionSession} from '@/lib/permission-request-session';

type Scope={checks:Map<string,Promise<unknown>>;stores:WeakMap<object,Map<boolean,Promise<string>>>};
const scopes=new AsyncLocalStorage<Scope>();
const fresh=()=>({checks:new Map<string,Promise<unknown>>(),stores:new WeakMap<object,Map<boolean,Promise<string>>>()});
/** Server-only, one request. A checkout always authenticates afresh. */
export function withBeautyReadScope<T>(work:()=>Promise<T>):Promise<T>{
 return scopes.getStore()?work():scopes.run(fresh(),()=>withPermissionRequestSession(work));
}
export function withBeautyCheckoutScope<T>(work:()=>Promise<T>):Promise<T>{
 return scopes.run(fresh(),()=>withCheckoutPermissionSession(work));
}
export function beautyRequestCheck<T>(key:string,work:()=>Promise<T>):Promise<T>{
 const state=scopes.getStore();if(!state)return work();
 const existing=state.checks.get(key);if(existing)return existing as Promise<T>;
 const promise=Promise.resolve().then(work);state.checks.set(key,promise);return promise;
}
/** Exact authenticated actor object; a read cannot satisfy writable-store checks. */
export function beautyRequestStore(actor:object,write:boolean,work:()=>Promise<string>):Promise<string>{
 const state=scopes.getStore();if(!state)return work();
 let modes=state.stores.get(actor);if(!modes){modes=new Map();state.stores.set(actor,modes);}
 const existing=modes.get(write);if(existing)return existing;
 const promise=Promise.resolve().then(work);modes.set(write,promise);return promise;
}
