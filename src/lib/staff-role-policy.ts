import type { UserRole, Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/** Account roles are independent of instructor/member identities. */
export function canManageStaffRole(actor: UserRole, target: UserRole): boolean {
  if (actor === "ADMIN") return true;
  if (actor === "OWNER") return target !== "ADMIN";
  return actor === "MANAGER" && (target === "STAFF" || target === "PARTNER");
}

export function canAssignStaffRole(actor: UserRole, role: UserRole): boolean {
  return actor === "ADMIN" || actor === "OWNER" ||
    (actor === "MANAGER" && role === "STAFF");
}

/** All role/deactivation writers share the store row lock, preventing a two-owner race. */
export async function assertStoreRetainsOwner(
  tx: Prisma.TransactionClient, storeId: string, excludingStaffId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
  const target = await tx.staff.findFirst({
    where: { id: excludingStaffId, storeId, status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } },
    select: { id: true },
  });
  if (!target) return;
  const count = await tx.staff.count({
    where: { storeId, id: { not: excludingStaffId }, status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } },
  });
  if (count === 0) throw new AppError("FORBIDDEN", "本店至少須保留一位啟用中的老闆");
}

/** Recheck the actor inside the same locked transaction as the mutation. */
export async function readStaffManagerGrants(tx: Prisma.TransactionClient, actor: {
  id: string; role: UserRole; staffId: string | null;
}, storeId: string): Promise<Set<string> | null> {
  const account = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, status: true } });
  if (!account || account.status !== "ACTIVE" || account.role !== actor.role)
    throw new AppError("FORBIDDEN", "帳號權限已變更，請重新登入");
  if (actor.role === "ADMIN") return null;
  const staff = await tx.staff.findFirst({ where: { id: actor.staffId ?? "", storeId, userId: actor.id, status: "ACTIVE" },
    include: { permissions: { where: { granted: true }, select: { permission: true } } } });
  if (!staff) throw new AppError("FORBIDDEN", "本店工作權限已停用");
  if (actor.role === "OWNER") return null;
  const grants = new Set(staff.permissions.map(p => p.permission));
  if (actor.role !== "MANAGER" || !grants.has("staff.manage")) throw new AppError("FORBIDDEN", "您沒有店員管理權限");
  return grants;
}
