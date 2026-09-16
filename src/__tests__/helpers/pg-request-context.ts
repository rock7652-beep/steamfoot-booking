/** HTTP boundary for disposable PG integration tests; no authorization/DB mocking. */
let activeStoreId = "";
export function setPgRequestStore(storeId: string) { activeStoreId = storeId; }
export async function headers() { return new Headers(); }
export async function cookies() {
  return { get: (name: string) => name === "active-store-id" && activeStoreId
    ? { value: activeStoreId } : undefined };
}
