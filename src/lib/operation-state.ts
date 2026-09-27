/** Short-lived, tab-local UI state. Never contains an executable action/request. */
export const OPERATION_STATE_PREFIX = "steamfoot-ui:v1:";
const MAX_AGE = 8 * 60 * 60 * 1000;
export function operationStateKey(scope: string, key: string) {
  return `${OPERATION_STATE_PREFIX}${JSON.stringify([scope, key])}`;
}
export function readOperationState<T>(storage: Pick<Storage, "getItem" | "removeItem">, key: string, valid: (value: unknown) => value is T, now = Date.now()): T | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const entry = JSON.parse(raw);
    if (!Number.isFinite(entry.at) || now - entry.at > MAX_AGE || entry.at > now || !valid(entry.value)) {
      storage.removeItem(key); return;
    }
    return entry.value;
  } catch { return; }
}
export function clearOperationState(storage: Storage) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(OPERATION_STATE_PREFIX)) storage.removeItem(key);
    }
  } catch { /* Storage can be disabled on managed devices. */ }
}
export function createOperationState(scope: string | null) {
  const values = new Map<string, unknown>();
  const hydrated = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get<T>(key: string, initial: T): T { return values.has(key) ? values.get(key) as T : initial; },
    subscribe<T>(key: string, valid: (value: unknown) => value is T, listener: () => void) {
      if (!hydrated.has(key)) {
        hydrated.add(key);
        if (scope) {
          try {
            const value = readOperationState(sessionStorage, operationStateKey(scope, key), valid);
            if (value !== undefined) values.set(key, value);
          } catch { /* Keep in-memory editing usable. */ }
        }
      }
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener); listeners.set(key, set);
      return () => { set.delete(listener); };
    },
    set<T>(key: string, value: T) {
      values.set(key, value);
      if (scope) {
        try { sessionStorage.setItem(operationStateKey(scope, key), JSON.stringify({ at: Date.now(), value })); }
        catch { /* Still retain state until this dashboard unmounts. */ }
      }
      listeners.get(key)?.forEach(listener => listener());
    },
  };
}
