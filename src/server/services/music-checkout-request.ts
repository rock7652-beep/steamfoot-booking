import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type CheckoutRequest = { checks: Map<string, Promise<unknown>>; modules: Map<string,Promise<void>>; timings: Record<string, number> };
const requests = new AsyncLocalStorage<CheckoutRequest>();

/** Only the dedicated checkout handler creates this scope. No cross-request cache. */
export function withMusicCheckoutRequest<T>(work: (timings: Record<string, number>) => Promise<T>) {
  const state: CheckoutRequest = { checks: new Map(), modules:new Map(), timings: {} };
  return requests.run(state, () => work(state.timings));
}

/** Same authoritative module check, once per exact store in this checkout only. */
export function musicCheckoutModule(storeId:string,check:()=>Promise<void>):Promise<void> {
  const state=requests.getStore();
  if(!state)return check();
  const previous=state.modules.get(storeId);
  if(previous){state.timings["module.reused"]=(state.timings["module.reused"]??0)+1;return previous;}
  const result=Promise.resolve().then(check);
  state.modules.set(storeId,result);
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
