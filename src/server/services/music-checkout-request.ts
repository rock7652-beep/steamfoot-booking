import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type CheckoutRequest = { checks: Map<string, Promise<unknown>>; writeStores:WeakMap<object,Promise<string>>; timings: Record<string, number> };
const requests = new AsyncLocalStorage<CheckoutRequest>();

/** Only the dedicated checkout handler creates this scope. No cross-request cache. */
export function withMusicCheckoutRequest<T>(work: (timings: Record<string, number>) => Promise<T>) {
  const state: CheckoutRequest = { checks: new Map(), writeStores:new WeakMap(), timings: {} };
  return requests.run(state, () => work(state.timings));
}

/** Exact authenticated actor object, this checkout only. Permissions remain separate.
 * The callback retains route authorization, writable-store and subscription checks.
 */
export function musicCheckoutWriteStore(actor:object,resolve:()=>Promise<string>):Promise<string> {
  const state=requests.getStore();
  if(!state)return resolve();
  const existing=state.writeStores.get(actor);
  if(existing){state.timings["writeStore.reused"]=(state.timings["writeStore.reused"]??0)+1;return existing;}
  const result=measureMusicCheckout("writeStore.resolve",resolve);
  state.writeStores.set(actor,result);
  return result;
}

export async function measureMusicCheckout<T>(name: string, work: () => Promise<T>): Promise<T> {
  const state = requests.getStore();
  if (!state) return work();
  const start = performance.now();
  try { return await work(); }
  finally { state.timings[name] = (state.timings[name] ?? 0) + Math.round(performance.now() - start); }
}

/** Identical permission only; wallet/discount/booking checks remain independent. */
export function musicCheckoutPermission<T>(permission: string, work: () => Promise<T>): Promise<T> {
  const state = requests.getStore();
  if (!state) return work();
  const existing = state.checks.get(permission);
  if (existing) {
    state.timings["authorization.reused"] = (state.timings["authorization.reused"] ?? 0) + 1;
    return existing as Promise<T>;
  }
  const result = measureMusicCheckout(`authorization.${permission}`, work);
  state.checks.set(permission, result);
  // Rejections remain rejections for this request; never turn a denied check into success.
  return result;
}
