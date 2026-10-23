import "server-only";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { AppError } from "@/lib/errors";
import { requirePermission, type PermissionCode } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { resolveWriteStoreId, getActiveStoreForRead } from "@/lib/store";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreContext } from "@/lib/store-context";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import type { Prisma } from "../../../generated/beauty-client";
export type BeautyActor = {
  storeId: string;
  userId: string | null;
  name?:string;
  customerId?: string;
  technicianId?: string;
  grants?: string[];
  manager?: boolean;
  actorKey?: string;
  verifiedStore?: {id:string;name:string;slug:string};
};
export async function requireBeauty(storeId: string, write = false) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1")
    throw new AppError("FORBIDDEN", "美業模組尚未開放");
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      industryModule: "BEAUTY",
      operatingStatus: { in: ["ACTIVE", "TRIAL"] },
    },
    select: { id: true, name: true, slug: true },
  });
  if (!store) throw new AppError("FORBIDDEN", "此功能僅適用已開通美業店家");
  await requireStoreFeature(storeId, FEATURES.BASIC_BOOKING);
  if (write) await assertStoreSubscriptionWritable(storeId);
  return store;
}
export async function beautyManager(
  permission: PermissionCode,
  write = false,
): Promise<BeautyActor> {
  const user = await requirePermission(permission, undefined, {
    deferSubscriptionGuard: true,
  });
  const storeId = write
    ? await resolveWriteStoreId(user)
    : await getActiveStoreForRead(user);
  if (!storeId) throw new AppError("FORBIDDEN", "請先選擇店家");
  await requireBeauty(storeId, write);
  if (
    user.role !== "ADMIN" &&
    storeId === user.storeId &&
    !(await prisma.staff.findFirst({
      where: {
        id: user.staffId ?? "",
        storeId,
        userId: user.id,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    }))
  )
    throw new AppError("FORBIDDEN", "本店工作權限已停用");
  return { storeId, userId: user.id, name:user.name, manager: true };
}
export async function beautyMember(write = false): Promise<BeautyActor> {
  const [user,ctx]=await Promise.all([requireSession(),getStoreContext()]);
  if (!ctx) throw new AppError("FORBIDDEN", "請從店家入口登入");
  const [verifiedStore,active,linked]=await Promise.all([
    requireBeauty(ctx.storeId,write),
    prisma.user.findFirst({where:{id:user.id,status:"ACTIVE"},select:{id:true}}),
    resolveCentralMemberCustomerForStore(user.id,ctx.storeId),
  ]);
  if(!active)throw new AppError("FORBIDDEN","帳號已停用");
  if(!linked)throw new AppError("FORBIDDEN","請先連結本店會員");
  return {
    storeId: ctx.storeId,
    userId: user.id,
    customerId: linked.customerId,
    verifiedStore,
  };
}
export async function beautyWorker(write = false): Promise<BeautyActor> {
  const a = await beautyMember(write);
  const [,t]=await Promise.all([
    requireStoreFeature(a.storeId, FEATURES.STAFF_MANAGEMENT),
    beautyPrisma.beautyTechnician.findFirst({where:{storeId:a.storeId,userId:a.userId,active:true}}),
  ]);
  if (!t) throw new AppError("FORBIDDEN", "技師工作身分尚未開放");
  return { ...a, technicianId: t.id, grants: t.grants };
}
/** Every module mutation, shared-card reservation and configuration writer uses
 * the same Store row lock. No client can choose the actor or store. */
export async function beautyTransaction<T>(
  a: BeautyActor,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return beautyPrisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Store" WHERE id=${a.storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
      if (rows.length !== 1)
        throw new AppError("FORBIDDEN", "店家已停用或模組已變更");
      return work(tx);
    },
    { timeout: 20000 },
  );
}
export async function command<T extends Prisma.InputJsonValue>(
  tx: Prisma.TransactionClient,
  a: BeautyActor,
  key: string,
  intent: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const actorKey = a.actorKey ?? a.userId ?? "public",
    encoded = JSON.stringify(intent);
  const previous = await tx.beautyCommand.findUnique({
    where: { storeId_requestKey: { storeId: a.storeId, requestKey: key } },
  });
  if (previous) {
    if (previous.actorKey !== actorKey || previous.intent !== encoded)
      throw new AppError("CONFLICT", "操作請求已使用，請重新確認");
    return previous.result as T;
  }
  const result = await work();
  await tx.beautyCommand.create({
    data: {
      storeId: a.storeId,
      requestKey: key,
      actorKey,
      intent: encoded,
      result,
    },
  });
  return result;
}
export async function audit(
  tx: Prisma.TransactionClient,
  a: BeautyActor,
  kind: string,
  body: string,
  appointmentId?: string,
) {
  await tx.beautyEvent.create({
    data: {
      storeId: a.storeId,
      kind,
      body,
      appointmentId,
      userId: a.userId,
      status: "AUDIT",
    },
  });
}
