import "server-only";
import { prisma } from "@/lib/db";

/** Rolling calendar year; evidence timestamps are absolute instants. */
export function auditRetentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return cutoff;
}

/** Disabled until isolated acceptance and rollout. Bounded batches never remove
 * undelivered evidence or recently used login sessions. No business data touched. */
export async function maintainAuditRetention(now = new Date()) {
  if (process.env.AUDIT_RETENTION_ENABLED !== "1") return { enabled: false };
  const cutoff = auditRetentionCutoff(now);
  return prisma.$transaction(async tx => {
    const operations = await tx.$executeRaw`DELETE FROM public."AuditLog" WHERE id IN (
      SELECT a.id FROM public."AuditLog" a WHERE a."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM public."OperationAuditOutbox" o
        WHERE o."deliveredAt" IS NULL AND a.id = 'audit-outbox:' || o.id)
      ORDER BY a."createdAt", a.id LIMIT 1000)`;
    const logins = await tx.$executeRaw`DELETE FROM public."StaffLoginRecord" WHERE id IN (
      SELECT l.id FROM public."StaffLoginRecord" l WHERE l."createdAt" < ${cutoff}
      AND COALESCE(l."lastUsedAt", l."createdAt") < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM public."OperationAuditOutbox" o
        WHERE o."deliveredAt" IS NULL AND o.payload->>'loginRecordId' = l.id)
      ORDER BY l."createdAt", l.id LIMIT 1000)`;
    const delivered = await tx.$executeRaw`DELETE FROM public."OperationAuditOutbox" WHERE id IN (
      SELECT id FROM public."OperationAuditOutbox" WHERE "deliveredAt" < ${cutoff}
      AND "createdAt" < ${cutoff} ORDER BY "createdAt", id LIMIT 1000)`;
    return { enabled: true, operations, logins, delivered };
  });
}
