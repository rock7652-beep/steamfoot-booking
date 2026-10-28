import type { PurchaseIntent, PurchaseIntentTransport } from './purchase-intent-coordinator';

type BeautyState = 'PREPARED' | 'COMMITTED' | 'ACKNOWLEDGED' | 'CANCELLED';
type BeautyIntent = { status: BeautyState; requestKey: string; purchaseId: string | null };
type Result<T> = { success: true; data: T } | { success: false; error?: string };
type Input = Record<string, unknown> & { customerId: string; requestKey: string };
type ScopedKey = { customerId: string; expectedStoreId: string; requestKey?: string };
type Port = {
  prepare: (input: Input) => Promise<Result<BeautyIntent>>;
  read: (input: ScopedKey) => Promise<Result<BeautyIntent | null>>;
  cancel: (input: Required<ScopedKey>) => Promise<Result<BeautyIntent>>;
  acknowledge: (input: Required<ScopedKey> & { purchaseId: string }) => Promise<Result<BeautyIntent>>;
};

/** This same normalization must be used for both registration and actual checkout. */
export function beautyPlanCheckoutInput<T extends Record<string, unknown>>(input: T, storeId: string, rosterSessionId?: string) {
  return { ...input, expectedStoreCost: 0, expectedStoreId: storeId, beautyRosterSessionId: rosterSessionId };
}

function normalize(intent: BeautyIntent): PurchaseIntent {
  return { ...intent, status: intent.status === 'ACKNOWLEDGED' ? 'COMMITTED' : intent.status };
}
function mapResult(result: Result<BeautyIntent>): Result<PurchaseIntent> {
  return result.success ? { success: true, data: normalize(result.data) } : result;
}
function mapOptional(result: Result<BeautyIntent | null>): Result<PurchaseIntent | null> {
  return result.success ? { success: true, data: result.data ? normalize(result.data) : null } : result;
}

/** The adapter never stores or logs submitted payment details. */
export function beautyPlanRecoveryTransport(storeId: string, rosterSessionId: string | undefined, port: Port): PurchaseIntentTransport<Input> {
  const scope = (customerId: string, requestKey?: string): ScopedKey => ({customerId, expectedStoreId: storeId, ...(requestKey ? {requestKey} : {})});
  return {
    prepare: async (input, requestKey) => mapResult(await port.prepare(beautyPlanCheckoutInput({...input,requestKey},storeId,rosterSessionId))),
    get: async (customerId, requestKey) => mapOptional(await port.read(scope(customerId,requestKey))),
    getPending: async customerId => mapOptional(await port.read(scope(customerId))),
    cancel: async (customerId, requestKey) => mapResult(await port.cancel({customerId,expectedStoreId:storeId,requestKey})),
    acknowledge: async (customerId, requestKey) => {
      const found = await port.read(scope(customerId,requestKey));
      if (!found.success) return found;
      if (!found.data || found.data.requestKey !== requestKey || !found.data.purchaseId || !['COMMITTED','ACKNOWLEDGED'].includes(found.data.status)) {
        return {success:false,error:'購買結果尚未確認'};
      }
      const result = await port.acknowledge({customerId,expectedStoreId:storeId,requestKey,purchaseId:found.data.purchaseId});
      if (!result.success) return result;
      if (result.data.requestKey !== requestKey || result.data.purchaseId !== found.data.purchaseId || result.data.status !== 'ACKNOWLEDGED') {
        return {success:false,error:'購買結果尚未確認'};
      }
      return {success:true,data:normalize(result.data)};
    },
  };
}
