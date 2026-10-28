import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const requestSessions = new AsyncLocalStorage<{ session?: Promise<unknown>; verified?: unknown;reuseFeatures?:boolean;features?:Map<string,Promise<unknown>> }>();

/** Explicit server-only read scope; never a persistent or cross-request session cache. */
export function withPermissionRequestSession<T>(work: () => Promise<T>): Promise<T> {
  return requestSessions.run({}, work);
}

/** Identity only for one atomic checkout. Always starts fresh, including inside
 * a read scope; grants, store policy, membership and financial locks remain live.
 * Checkout must not change the authenticated identity or selected store.
 */
export function withCheckoutPermissionSession<T>(work: () => Promise<T>): Promise<T> {
  return requestSessions.run({reuseFeatures:true}, work);
}

/** Identical feature policy only inside an authenticated atomic checkout.
 * Permission grants remain independent; rejected policies stay rejected. */
export function permissionRequestFeature<T>(storeId:string,feature:string,work:()=>Promise<T>):Promise<T>{
 const state=requestSessions.getStore();if(!state?.reuseFeatures||!state.verified)return work();
 const key=JSON.stringify([storeId,feature]);state.features??=new Map();
 const existing=state.features.get(key);if(existing)return existing as Promise<T>;
 const promise=Promise.resolve().then(work);state.features.set(key,promise);return promise;
}

export function permissionRequestSession<T>(authenticate: () => Promise<T>): Promise<T> {
  const state = requestSessions.getStore();
  if (!state) return authenticate();
  if (!state.session) state.session = authenticate().then(user=>{state.verified=user;return user;});
  return state.session as Promise<T>;
}

/** Only a successfully completed current-request authentication; never waits on itself. */
export function verifiedPermissionRequestSession(): unknown {
 return requestSessions.getStore()?.verified;
}
