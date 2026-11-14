/** Route-local bridge from the search toolbar to the existing customer drawer. */
export const CUSTOMER_DRAWER_OPEN_EVENT = "customer-drawer-open";
export type CustomerDrawerOpenRequest = { customerId: string; pathname: string };

export function requestCustomerDrawerOpen(customerId: string, pathname: string): boolean {
  return !window.dispatchEvent(new CustomEvent<CustomerDrawerOpenRequest>(CUSTOMER_DRAWER_OPEN_EVENT, {
    detail: { customerId, pathname }, cancelable: true,
  }));
}
