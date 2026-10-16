import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const requestSessions = new AsyncLocalStorage<{ session?: Promise<unknown> }>();

/** Explicit server-only read scope; never a persistent or cross-request session cache. */
export function withPermissionRequestSession<T>(work: () => Promise<T>): Promise<T> {
  return requestSessions.run({}, work);
}

export function permissionRequestSession<T>(authenticate: () => Promise<T>): Promise<T> {
  const state = requestSessions.getStore();
  if (!state) return authenticate();
  if (!state.session) state.session = authenticate();
  return state.session as Promise<T>;
}
