import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";

/** Called only after the onboarding action verifies the store's LINE token.
 * First activation requires the submitted name AND phone to match the unique,
 * unowned store record. A notification recipient is usable only when it is
 * exactly the subject verified by the caller; different subjects need review.
 */
export async function activateUnlinkedStoreMember(input: {
  storeId: string; lineUserId: string; name: string; phone: string;
}): Promise<"activated" | "review" | "unavailable"> {
  const phone = normalizePhone(input.phone);
  const name = input.name.trim();
  if (!/^09\d{8}$/.test(phone) || !name) return "review";
  try {
    return await prisma.$transaction(async tx => {
      const customers = await tx.customer.findMany({
        where: { storeId: input.storeId, phone }, take: 2,
        select: { id: true, name: true, userId: true, lineUserId: true,
          mergedIntoCustomerId: true, identityLinks: { select: { id: true } } },
      });
      if (customers.length !== 1) return "review";
      const customer = customers[0];
      if (customer.name.trim() !== name || customer.userId ||
          (customer.lineUserId && customer.lineUserId !== input.lineUserId) ||
          customer.mergedIntoCustomerId || customer.identityLinks.length) return "review";
      const [phoneOwner, account, lineCustomer, lineLink] = await Promise.all([
        tx.user.findUnique({ where: { phone_role: { phone, role: "CUSTOMER" } }, select: { id: true } }),
        tx.account.findUnique({ where: { provider_providerAccountId: { provider: "line", providerAccountId: input.lineUserId } }, select: { id: true } }),
        tx.customer.findFirst({ where: { storeId: input.storeId, lineUserId: input.lineUserId, id: { not: customer.id } }, select: { id: true } }),
        tx.customerIdentityLink.findFirst({ where: { provider: "line", providerAccountId: input.lineUserId }, select: { id: true } }),
      ]);
      if (phoneOwner || account || lineCustomer || lineLink) return "review";
      const user = await tx.user.create({
        data: { name: customer.name, phone, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true },
      });
      const claimed = await tx.customer.updateMany({
        where: { id: customer.id, storeId: input.storeId, phone, name: customer.name,
          userId: null, lineUserId: customer.lineUserId, mergedIntoCustomerId: null, identityLinks: { none: {} } },
        data: { userId: user.id, authSource: "LINE", lineUserId: input.lineUserId,
          lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("FIRST_LOGIN_RECORD_CHANGED");
      await tx.account.create({ data: { userId: user.id, provider: "line", providerAccountId: input.lineUserId, type: "oauth" } });
      await tx.customerIdentityLink.create({ data: { userId: user.id, storeId: input.storeId,
        customerId: customer.id, provider: "line", providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
      await tx.auditLog.create({ data: { actorUserId: user.id, targetType: "Customer", targetId: customer.id,
        action: "FIRST_LINE_LOGIN_NAME_PHONE_MATCH", afterJson: { storeId: input.storeId, existingCustomerActivated: true } } });
      return "activated";
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2002" || code === "P2034" || (error instanceof Error && error.message === "FIRST_LOGIN_RECORD_CHANGED")) return "review";
    return "unavailable";
  }
}
