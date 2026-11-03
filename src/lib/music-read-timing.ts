import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
type State={values:Record<string,number>;prefix:string};
const scope=new AsyncLocalStorage<State>();
/** Diagnostics only; no credentials, values or authorization decisions are cached. */
export function withMusicReadTiming<T>(values:Record<string,number>,work:()=>T):T {
 return scope.run({values,prefix:""},work);
}
export function musicReadTimingScope<T>(prefix:string,work:()=>T):T {
 const state=scope.getStore();
 return state?scope.run({...state,prefix:state.prefix+prefix+"."},work):work();
}
export async function measureMusicRead<T>(name:string,work:()=>Promise<T>):Promise<T> {
 const state=scope.getStore();if(!state)return work();
 const key=state.prefix+name,start=performance.now();
 try{return await work();}finally{
  state.values[key]=(state.values[key]??0)+Math.round(performance.now()-start);
  state.values[key+".count"]=(state.values[key+".count"]??0)+1;
 }
}
