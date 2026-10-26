import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { AppError } from "@/lib/errors";

/** Inside the primary identity transaction, after a committed booking and its
 * store-verified entry select this customer. Phone never authorizes this.
 * Never run with the restricted Beauty database role. */
export async function connectVerifiedBeautyBooking(tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">, input: {
  storeId: string; customerId: string; lineUserId: string; name: string;
}) {
  const config = getConfiguredStoreLine(input.storeId);
  if (!config) throw new AppError("FORBIDDEN", "此店家尚未完成 LINE 通道設定");
  const provider = storeLineIdentityProvider(config);
  const conflict = () => new AppError("CONFLICT", "LINE 身分與既有資料不一致，請由店家協助核對");
  const customers = await tx.$queryRaw<Array<{ userId: string | null }>>`
    SELECT "userId" FROM "Customer" WHERE id=${input.customerId} AND "storeId"=${input.storeId}
    AND "lineUserId"=${input.lineUserId} AND "lineLinkStatus"='LINKED' AND "mergedIntoCustomerId" IS NULL FOR UPDATE`;
  if (customers.length !== 1) throw conflict();
  const accounts = await tx.$queryRaw<Array<{ userId: string; role: string; status: string }>>`
    SELECT a."userId",u.role::text,u.status::text FROM "Account" a JOIN "User" u ON u.id=a."userId"
    WHERE a.provider=${provider} AND a."providerAccountId"=${input.lineUserId} FOR UPDATE OF a,u`;
  if (accounts.length > 1 || accounts.some(a => a.role !== "CUSTOMER" || a.status !== "ACTIVE")) throw conflict();
  const userId = accounts[0]?.userId ?? randomUUID();
  if (customers[0].userId && customers[0].userId !== userId) throw conflict();
  const links = await tx.$queryRaw<Array<{ userId: string; customerId: string; providerAccountId: string }>>`
    SELECT "userId","customerId","providerAccountId" FROM "CustomerIdentityLink"
    WHERE "storeId"=${input.storeId} AND provider=${provider}
    AND ("providerAccountId"=${input.lineUserId} OR "customerId"=${input.customerId} OR "userId"=${userId}) FOR UPDATE`;
  if (links.some(l => l.userId !== userId || l.customerId !== input.customerId || l.providerAccountId !== input.lineUserId)) throw conflict();
  if (!accounts.length) {
    // Never claim a global login phone from the number supplied in a form.
    await tx.$executeRaw`INSERT INTO "User" (id,name,role,status,"createdAt","updatedAt") VALUES (${userId},${input.name},'CUSTOMER','ACTIVE',NOW(),NOW())`;
    await tx.$executeRaw`INSERT INTO "Account" (id,"userId",type,provider,"providerAccountId") VALUES (${randomUUID()},${userId},'oauth',${provider},${input.lineUserId})`;
  }
  if (!links.length) await tx.$executeRaw`INSERT INTO "CustomerIdentityLink" (id,"userId","storeId","customerId",provider,"providerAccountId","lineUserId","createdAt","updatedAt") VALUES (${randomUUID()},${userId},${input.storeId},${input.customerId},${provider},${input.lineUserId},${input.lineUserId},NOW(),NOW())`;
}
