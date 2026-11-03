// Shared process-local state; HTTP routes export only supported Next.js handlers.
export const auditRateState=new Map<string,number>();
export function resetMessengerAuditRateLimitForTests(){auditRateState.clear();}
export const graph_diagnosticRateState=new Map<string,number>();
export function resetMessengerGraphDiagnosticRateLimitForTests(){graph_diagnosticRateState.clear();}
export const repairRateState=new Map<string,number>();
export function resetMessengerRepairRateLimitForTests(){repairRateState.clear();}
export const token_fingerprintRateState=new Map<string,number>();
export function resetMessengerTokenFingerprintRateLimitForTests(){token_fingerprintRateState.clear();}
