import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { requirePermission, type PermissionCode } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { resolveWriteStoreId } from "@/lib/store";
import { AppError } from "@/lib/errors";
import { resolveMemberRequestStoreId } from "./member-request-store";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";
import type { Prisma } from "../../../generated/course-client";

export async function courseManager(permission: PermissionCode) {
  const user = await requirePermission(permission);
  const storeId = await resolveWriteStoreId(user);
  await requireCourseStore(storeId);
  if (user.role !== "ADMIN") {
    const staff = await prisma.staff.findFirst({
      where: {
        id: user.staffId ?? "",
        storeId,
        userId: user.id,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
    });
    if (!staff) throw new AppError("FORBIDDEN", "本店工作權限已停用");
  }
  return { user, storeId };
}

export async function courseMember() {
  const user = await requireSession();
  if (!await prisma.user.findFirst({ where: { id: user.id, status: "ACTIVE" } })) throw new AppError("FORBIDDEN", "帳號已停用");
  const storeId = await resolveMemberRequestStoreId(user.storeId);
  if (!storeId) throw new AppError("FORBIDDEN", "請從課程店家入口登入");
  await requireCourseStore(storeId);
  const linked = await resolveCentralMemberCustomerForStore(user.id, storeId);
  const customer = linked
    ? await prisma.customer.findFirst({
        where: { id: linked.customerId, storeId, mergedIntoCustomerId: null },
        select: { id: true, name: true },
      })
    : await prisma.customer.findFirst({
        where: { userId: user.id, storeId, mergedIntoCustomerId: null },
        select: { id: true, name: true },
      });
  if (!customer) throw new AppError("FORBIDDEN", "帳號尚未連結本店顧客");
  return { user, storeId, customer };
}

// Every course balance, seat and membership mutation takes this same lock.
// It prevents races across different sessions spending the same shared card.
export async function courseTransaction<T>(
  storeId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return coursePrisma.$transaction(
    async (tx) => {
      const stores = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
      if (!stores.length)
        throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
      return work(tx);
    },
    { timeout: 15000 },
  );
}
