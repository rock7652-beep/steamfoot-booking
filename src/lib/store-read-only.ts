/** UI follows the authorized concrete read target, even without a view cookie.
 * This does not grant access; server queries/actions still authorize the store. */
export function isReadOnlyStoreTarget(
  user: { role: string; storeId?: string | null },
  targetStoreId: string | null | undefined,
) {
  return user.role !== "ADMIN" && !!user.storeId && !!targetStoreId && user.storeId !== targetStoreId;
}
