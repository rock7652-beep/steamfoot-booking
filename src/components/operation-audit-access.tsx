"use client";

import { createContext, useContext, type ReactNode } from "react";

const OperationAuditAccess = createContext({ allowed: false, hq: false });

export function OperationAuditAccessProvider({ allowed, hq = false, children }: { allowed: boolean; hq?: boolean; children?: ReactNode }) {
  return <OperationAuditAccess.Provider value={{ allowed, hq }}>{children}</OperationAuditAccess.Provider>;
}

export function useOperationAuditAccess() {
  return useContext(OperationAuditAccess).allowed;
}

export function useHqOperationAuditAccess() {
  return useContext(OperationAuditAccess).hq;
}
