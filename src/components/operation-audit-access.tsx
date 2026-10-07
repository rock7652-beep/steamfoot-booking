"use client";

import { createContext, useContext, type ReactNode } from "react";

const OperationAuditAccess = createContext(false);

export function OperationAuditAccessProvider({ allowed, children }: { allowed: boolean; children?: ReactNode }) {
  return <OperationAuditAccess.Provider value={allowed}>{children}</OperationAuditAccess.Provider>;
}

export function useOperationAuditAccess() {
  return useContext(OperationAuditAccess);
}
