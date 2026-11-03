import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import {withReadRequestMemo} from "./read-request-memo";
import {withPermissionRequestSession} from "@/lib/permission-request-session";

// Only complete, read-only month requests opt in. The preceding sports sync /
// transactions never enter this scope. Grants and store policy still run live.
const month = new AsyncLocalStorage<boolean>();
export function withCalendarMonthRead<T>(read:()=>Promise<T>):Promise<T> {
  if(month.getStore())return read();
  return withReadRequestMemo(()=>withPermissionRequestSession(()=>month.run(true,read)));
}
/** Keep independent page/detail reads fresh, but do not discard the identity
 * already verified by this same read-only month request. No cross-request cache. */
export function withCalendarRosterRead<T>(read:()=>Promise<T>):Promise<T> {
  return month.getStore()?read():withReadRequestMemo(()=>withPermissionRequestSession(read));
}
