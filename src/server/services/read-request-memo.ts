import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>();
/** Opt-in for a single read-only HTTP request; never wrap writes or persist results. */
export function withReadRequestMemo<T>(read: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), read);
}
export function memoizeReadRequest<T>(key: string, read: () => Promise<T>): Promise<T> {
  const entries = scope.getStore();
  if (!entries) return read();
  const existing = entries.get(key);
  if (existing) return existing as Promise<T>;
  const result = Promise.resolve().then(read);
  entries.set(key, result);
  return result;
}
