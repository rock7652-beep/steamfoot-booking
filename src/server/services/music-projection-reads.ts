import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";

const scopes = new AsyncLocalStorage<WeakMap<object, Map<string, Promise<unknown>>>>();
/** Opened only after purchase commit, for its read-only projections; never spans requests/writes. */
export function withMusicProjectionReads<T>(work:()=>Promise<T>):Promise<T> {
  return scopes.run(new WeakMap(),work);
}
/** Each caller still authorizes independently. Client identity and full query scope isolate reads. */
export function musicProjectionRead<T>(client:object,key:string,work:()=>Promise<T>):Promise<T> {
  const scope=scopes.getStore();
  if(!scope)return work();
  let reads=scope.get(client);
  if(!reads){reads=new Map();scope.set(client,reads);}
  const existing=reads.get(key);
  if(existing)return existing as Promise<T>;
  const result=Promise.resolve().then(work);
  reads.set(key,result);
  return result;
}
