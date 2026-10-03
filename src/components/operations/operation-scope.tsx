"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";
import { createOperationState } from "@/lib/operation-state";

import { ReturnPosition } from "./return-position";

const Context = createContext<ReturnType<typeof createOperationState> | null>(null);
/** The server keys this boundary by account, store, module and permissions. */
export function OperationScope({ scope, children }: { scope: string; children?: ReactNode }) {
  const [store] = useState(() => createOperationState(scope));
  return <Context.Provider value={store}><ReturnPosition scope={scope}>{children}</ReturnPosition></Context.Provider>;
}
export function useRetainedState<T>(key: string, initialValue: T, valid: (value: unknown) => value is T) {
  const shared = useContext(Context);
  const [fallback] = useState(() => createOperationState(null));
  const store = shared ?? fallback;
  const [initial] = useState(initialValue);
  const subscribe = useCallback((listener: () => void) => store.subscribe(key, valid, listener), [store, key, valid]);
  const snapshot = useCallback(() => store.get(key, initial), [store, key, initial]);
  const serverSnapshot = useCallback(() => initial, [initial]);
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const set = useCallback((next: SetStateAction<T>) => {
    store.set(key, typeof next === "function" ? (next as (previous: T) => T)(store.get(key, initial)) : next);
  }, [store, key, initial]);
  return [value, set] as const;
}
export const retainedString = (value: unknown): value is string => typeof value === "string" && value.length <= 1000;
export const retainedPage = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100000;
