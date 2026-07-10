import { AppError } from "@/lib/errors";

export const STORE_CONSISTENCY_ERROR_CODE = "STORE_CONSISTENCY_MISMATCH";

type StoreScoped = { storeId: string | null };

function consistencyMessage(entityName: string): string {
  return `${STORE_CONSISTENCY_ERROR_CODE}: ${entityName} 店別不一致，請重新整理後再試`;
}

export function assertSameStore(
  entityName: string,
  actualStoreId: string | null | undefined,
  expectedStoreId: string | null | undefined,
): void {
  if (!actualStoreId || !expectedStoreId || actualStoreId !== expectedStoreId) {
    throw new AppError("VALIDATION", consistencyMessage(entityName));
  }
}

export function assertCustomerInOperationStore(
  customer: StoreScoped,
  operationStoreId: string,
): void {
  assertSameStore("Customer", customer.storeId, operationStoreId);
}

export function assertStaffInCustomerStore(
  staff: StoreScoped,
  customerStoreId: string,
): void {
  assertSameStore("Staff", staff.storeId, customerStoreId);
}
