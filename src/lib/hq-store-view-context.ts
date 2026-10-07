/**
 * Server-verified HQ store-view scope, separate from the authenticated actor.
 *
 * Register only after the requested concrete store has been authorized. Object
 * identity keeps concurrent sessions for the same account isolated and prevents
 * client-supplied/serialized fields from becoming authorization evidence.
 */
const contexts = new WeakMap<object, Readonly<{ storeId: string }>>();

export function registerHqStoreViewContext<T extends object>(user: T, storeId: string): T {
  if (!storeId || storeId === "__all__") {
    throw new Error("HQ store view requires an authorized concrete store");
  }
  contexts.set(user, Object.freeze({ storeId }));
  return user;
}

export function getHqStoreViewContext(user: object): Readonly<{ storeId: string }> | undefined {
  return contexts.get(user);
}

/** Capability role only. Never use this value to replace the audit actor role. */
export function getEffectiveActorRole<T extends { role: string }>(user: T): T["role"] | "OWNER" {
  return user.role === "ADMIN" && contexts.has(user) ? "OWNER" : user.role;
}
