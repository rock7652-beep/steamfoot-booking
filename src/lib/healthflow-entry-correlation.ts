const ATTEMPT_ID_PATTERN =
  /^hf_attempt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createHealthflowEntryAttemptId(): string {
  return `hf_attempt_${crypto.randomUUID()}`;
}

export function normalizeHealthflowEntryAttemptId(value: unknown): string {
  return typeof value === "string" && ATTEMPT_ID_PATTERN.test(value)
    ? value
    : createHealthflowEntryAttemptId();
}

export function isHealthflowEntryAttemptId(value: unknown): value is string {
  return typeof value === "string" && ATTEMPT_ID_PATTERN.test(value);
}

export function createHealthflowEntryErrorCode(attemptId: string): string {
  const normalized = normalizeHealthflowEntryAttemptId(attemptId);
  const suffix = normalized.replace(/[^0-9a-f]/g, "").slice(-8).toUpperCase();
  return `HF-${suffix}`;
}
