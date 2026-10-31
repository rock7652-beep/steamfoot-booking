import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type VerifiedStaffRead = Readonly<{userId:string;role:string;staffId:string;storeId:string;industryModule:string}>;
const scope = new AsyncLocalStorage<{entries:Map<string, Promise<unknown>>;staff?:VerifiedStaffRead}>();
/** Opt-in for a single read-only HTTP request; never wrap writes or persist results. */
export function withReadRequestMemo<T>(read: () => Promise<T>): Promise<T> {
  return scope.run({entries:new Map()}, read);
}
export function memoizeReadRequest<T>(key: string, read: () => Promise<T>): Promise<T> {
  const entries = scope.getStore()?.entries;
  if (!entries) return read();
  const existing = entries.get(key);
  if (existing) return existing as Promise<T>;
  const result = Promise.resolve().then(read);
  entries.set(key, result);
  return result;
}

/** Auth callback only, AFTER the current database security stamp is verified.
 * Scalars from that same live read, never a JWT/client claim or a saved grant.
 * No scope exists in actions/transactions; they retain independent checks. */
export function rememberVerifiedStaffRead(staff:VerifiedStaffRead):void{
  const request=scope.getStore();
  if(request)request.staff=Object.freeze({...staff});
}
export function verifiedStaffRead():VerifiedStaffRead|undefined{return scope.getStore()?.staff;}
