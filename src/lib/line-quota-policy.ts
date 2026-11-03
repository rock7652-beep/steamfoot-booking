export type LineQuota = { used: number; limit: number | null };
export function quotaThreshold({ used, limit }: LineQuota): 80 | 95 | 100 | null {
  if (limit === null) return null;
  if (used >= limit) return 100;
  if (used >= limit * .95) return 95;
  if (used >= limit * .8) return 80;
  return null;
}
export function isLineQuotaExceeded(error: string | null | undefined): boolean {
  // A generic HTTP 429 can be a rate limit; only LINE's monthly-limit message qualifies.
  return /monthly (?:message |messages? )?limit|monthly message quota|You have reached your monthly limit/i.test(error ?? "");
}
