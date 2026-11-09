"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CustomerStoreOption } from "./central-member-store-switcher";

const CustomerMembershipContext = createContext<CustomerStoreOption[]>([]);

/** Reuse the layout's verified memberships; never fetch or infer them in the browser. */
export function CustomerMembershipProvider({ stores, children }: { stores: CustomerStoreOption[]; children?: ReactNode }) {
  return <CustomerMembershipContext.Provider value={stores}>{children}</CustomerMembershipContext.Provider>;
}

export function useCustomerMembershipStores() {
  return useContext(CustomerMembershipContext);
}
