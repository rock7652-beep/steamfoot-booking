// Kept outside route.ts: Next route modules only support HTTP/config exports.
export const lastAuditByActorAndStore = new Map<string, number>();

export function resetMessengerAuditRateLimitForTests(): void {
  lastAuditByActorAndStore.clear();
}

export const lastDiagnosisByActorAndStore = new Map<string, number>();

export function resetMessengerGraphDiagnosticRateLimitForTests(): void {
  lastDiagnosisByActorAndStore.clear();
}

export const lastRepairByActorAndStore = new Map<string, number>();

export function resetMessengerRepairRateLimitForTests(): void {
  lastRepairByActorAndStore.clear();
}

export const lastFingerprintByActorAndStore = new Map<string, number>();

export function resetMessengerTokenFingerprintRateLimitForTests(): void {
  lastFingerprintByActorAndStore.clear();
}
