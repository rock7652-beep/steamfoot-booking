/**
 * Canonical predicate for Customer rows that may participate in identity
 * resolution. A partially-written merge state is treated as inactive too:
 * both merge fields must be null before a Customer can be trusted.
 */
export const ACTIVE_CUSTOMER_FILTER = {
  mergedIntoCustomerId: null,
  mergedAt: null,
} as const;

export type CustomerMergeState = {
  mergedIntoCustomerId: string | null;
  mergedAt: Date | null;
};

export function isActiveCustomer<T extends CustomerMergeState>(
  customer: T | null | undefined,
): boolean {
  return !!customer &&
    customer.mergedIntoCustomerId === null &&
    customer.mergedAt === null;
}
