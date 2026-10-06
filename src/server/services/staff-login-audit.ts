import "server-only";
import { prisma } from "@/lib/db";
import { loginAuditDevice } from "@/lib/login-audit-device";
import { headers } from "next/headers";

type Actor = { id: string; name: string; role: string; staff?: { storeId: string } | null };
export async function recordStaffLogin(actor: Actor | null, outcome: "SUCCESS" | "FAILED", reason?: string, request?: Request) {
  const ua = request ? request.headers.get("user-agent") : (await headers()).get("user-agent");
  return prisma.staffLoginRecord.create({ data: {
    actorUserId: actor?.id, actorNameSnapshot: actor?.name,
    actorRoleSnapshot: actor?.role, storeId: actor?.staff?.storeId,
    outcome, reason, device: loginAuditDevice(ua),
  }, select: { id: true } });
}

// Bounded server-side timestamps only; never caches identities or record payloads.
const recentlyTouched = new Map<string, number>();
/** Conditional update throttles writes across instances, not only in this process. */
export async function touchStaffLogin(id: string, actorUserId: string) {
  const key = `${id}:${actorUserId}`;
  const now = Date.now();
  if ((recentlyTouched.get(key) ?? 0) > now - 300_000) return;
  try {
    await prisma.staffLoginRecord.updateMany({
      where: { id, actorUserId, outcome: "SUCCESS", OR: [
        { lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 300_000) } },
      ] }, data: { lastUsedAt: new Date() },
    });
    if (recentlyTouched.size >= 5000) recentlyTouched.delete(recentlyTouched.keys().next().value!);
    recentlyTouched.set(key, now);
  } catch {
    console.error("[staff-login-audit] activity update failed");
  }
}
