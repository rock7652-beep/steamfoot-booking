import type { PurchaseIntent, PurchaseIntentTransport } from './purchase-intent-coordinator';

export type MemberPurchaseSnapshot = { expectedName: string; expectedPrice: number; expectedSessions: number; expectedRevision: number };
export type MemberPurchaseInput = MemberPurchaseSnapshot & { customerId: string; planId: string; lastFour: string; requestKey: string };
type Result<T> = { success: true; data: T } | { success: false; error?: string };
type State = PurchaseIntent & { status: 'PREPARED' | 'COMMITTED' | 'CANCELLED' };
type ScopedKey = { expectedStoreId: string; requestKey?: string };
export type MemberPurchasePort = {
  prepare: (input: Required<ScopedKey> & MemberPurchaseSnapshot & { planId: string; lastFour: string }) => Promise<Result<State>>;
  read: (input: ScopedKey) => Promise<Result<State | null>>;
  cancel: (input: Required<ScopedKey>) => Promise<Result<State>>;
  acknowledge: (input: Required<ScopedKey> & { purchaseId: string }) => Promise<Result<State>>;
};

/** Member identity is resolved by the server; client customerId only scopes
 * the local coordinator. Form and bank details are never placed in storage. */
export function memberPurchaseRecoveryTransport(storeId: string, port: MemberPurchasePort): PurchaseIntentTransport<MemberPurchaseInput> {
  const scope = (requestKey?: string): ScopedKey => ({ expectedStoreId: storeId, ...(requestKey ? { requestKey } : {}) });
  return {
    prepare: (input, requestKey) => port.prepare({ ...scope(requestKey), requestKey, planId: input.planId, lastFour: input.lastFour, expectedName: input.expectedName, expectedPrice: input.expectedPrice, expectedSessions: input.expectedSessions, expectedRevision: input.expectedRevision }),
    get: (_customerId, requestKey) => port.read(scope(requestKey)),
    getPending: () => port.read(scope()),
    cancel: (_customerId, requestKey) => port.cancel({ expectedStoreId: storeId, requestKey }),
    acknowledge: async (_customerId, requestKey) => {
      const found = await port.read(scope(requestKey));
      if (!found.success) return found;
      if (!found.data || found.data.status !== 'COMMITTED' || found.data.requestKey !== requestKey || !found.data.purchaseId) return { success: false, error: '申請狀態尚未確認' };
      const acknowledged = await port.acknowledge({ expectedStoreId: storeId, requestKey, purchaseId: found.data.purchaseId });
      if (!acknowledged.success) return acknowledged;
      if (acknowledged.data.status !== 'COMMITTED' || acknowledged.data.requestKey !== requestKey || acknowledged.data.purchaseId !== found.data.purchaseId) return { success: false, error: '申請狀態尚未確認' };
      return acknowledged;
    },
  };
}
