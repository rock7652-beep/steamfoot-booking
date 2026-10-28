import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const requestSessions = new AsyncLocalStorage<{ session?: Promise<unknown>; verified?: unknown }>();

/** Explicit server-only read scope; never a persistent or cross-request session cache. */
export function withPermissionRequestSession<T>(work: () => Promise<T>): Promise<T> {
  return requestSessions.run({}, work);
}

/** Identity only for one atomic checkout. Always starts fresh, including inside
 * a read scope; grants, store policy, membership and financial locks remain live.
 * Checkout must not change the authenticated identity or selected store.
 */
export function withCheckoutPermissionSession<T>(work: () => Promise<T>): Promise<T> {
  return requestSessions.run({}, work);
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
