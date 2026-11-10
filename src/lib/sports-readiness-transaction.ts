/** Match ordinary pooled query acquisition (10s), while keeping the existing
 * 5s interactive execution limit. Prisma otherwise abandons a queued catalog
 * check after 2s even when the one-connection client is still serving a read.
 * Scoped to these preflight checks; financial/scheduling mutations keep their
 * original store lock, isolation, idempotency and execution budgets. */
export const sportsReadinessTransactionOptions = Object.freeze({maxWait:10_000,timeout:5_000});
