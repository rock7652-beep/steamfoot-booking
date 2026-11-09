import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Only the authorized customer's LINE state changes; business history is untouched. */
export async function unlinkCustomerLine(input: { customerId: string; storeId: string; actorUserId: string }) {
  await prisma.$transaction(async tx => {
    // Match rebind's request → customer lock order. An old captured request
    // must not restore a binding after the operator has explicitly removed it.
    const requests = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "LineRebindRequest"
      WHERE "customerId" = ${input.customerId} AND "storeId" = ${input.storeId}
        AND "status" IN ('PENDING_CAPTURE', 'CANDIDATE_CAPTURED')
      ORDER BY "id" FOR UPDATE
    `;
    const customers = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Customer"
      WHERE "id" = ${input.customerId} AND "storeId" = ${input.storeId}
        AND "mergedIntoCustomerId" IS NULL FOR UPDATE
    `;
    if (customers.length !== 1) throw new AppError("NOT_FOUND", "顧客不存在或已異動，請重新讀取");
    const requestIds = requests.map(request => request.id);
    await tx.lineRebindCandidate.deleteMany({ where: { requestId: { in: requestIds } } });
    await tx.lineRebindRequest.updateMany({
      where: { id: { in: requestIds }, customerId: input.customerId, storeId: input.storeId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: input.actorUserId },
    });
    await tx.customerIdentityLink.deleteMany({
      where: { customerId: input.customerId, storeId: input.storeId, OR: [
        { provider: "line" },
        { provider: { startsWith: "line-provider:" } },
        { provider: { startsWith: "line-messaging:" } },
      ] },
    });
    // A previous notification approval must not continue to describe this
    // customer as linked after the LINE identity has been removed. Login
    // recovery requests and every other customer's records are independent.
    await tx.storeMemberConnection.updateMany({
      where: { customerId: input.customerId, storeId: input.storeId,
        status: { in: ["PENDING", "APPROVED"] },
        channelKey: { not: { startsWith: "login:" } } },
      data: { status: "REJECTED" },
    });
    await tx.customer.update({
      where: { id: input.customerId, storeId: input.storeId },
      data: { lineUserId: null, lineName: null, lineLinkedAt: null, lineLinkStatus: "UNLINKED", lineBindingCode: null, lineBindingCodeCreatedAt: null },
    });
    await tx.auditLog.create({ data: {
      actorUserId: input.actorUserId, targetType: "Customer", targetId: input.customerId,
      action: "UNLINK_CUSTOMER_LINE", afterJson: { storeId: input.storeId, status: "UNLINKED", cancelledRequests: requestIds.length },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
