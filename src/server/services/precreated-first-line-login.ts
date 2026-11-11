import "server-only";
import type { Prisma } from "@prisma/client";
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
  if (!/^09\d{8}$/.test(normalizePhone(input.phone)) || !input.name.trim()) return "review";
  try {
    return await prisma.$transaction(tx => activateUnlinkedStoreMemberInTransaction(tx, input), { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2002" || code === "P2034" || (error instanceof Error && error.message === "FIRST_LOGIN_RECORD_CHANGED")) return "review";
    return "unavailable";
  }
}

/** Shared first-activation implementation. The caller has verified the store's
 * LINE token. Course callers hold the store lock in a Serializable transaction;
 * their phone lookup includes contact-only siblings and scoped Providers.
 * This does not authorize a phone group or replace an existing identity. */
export async function activateUnlinkedStoreMemberInTransaction(tx: Prisma.TransactionClient, input: {
  storeId: string; lineUserId: string; name: string; phone: string;
  course?: true; identityProvider?: string;
}): Promise<"activated" | "review"> {
  const phone = normalizePhone(input.phone), name = input.name.trim();
  const provider = input.identityProvider ?? "line";
  if (!/^09\d{8}$/.test(phone) || !name || (!input.course && provider !== "line")) return "review";
  const customers = await tx.customer.findMany({
    where: { storeId: input.storeId, ...(input.course ? { OR: [{ phone }, { phone: "", contactPhone: phone }] } : { phone }) }, take: 2,
    select: { id: true, name: true, phone: true, userId: true, lineUserId: true, googleId: true, lineBindingCode: true,
      mergedIntoCustomerId: true, identityLinks: { select: { id: true } } },
  });
  if (customers.length !== 1) return "review";
  const customer = customers[0];
  if (customer.name.trim() !== name || customer.userId ||
      (customer.lineUserId && (provider !== "line" || customer.lineUserId !== input.lineUserId)) ||
      customer.mergedIntoCustomerId || customer.identityLinks.length ||
      (input.course && (customer.phone !== phone || customer.googleId || customer.lineBindingCode))) return "review";
  const [phoneOwner, account, lineCustomer, lineLink] = await Promise.all([
    tx.user.findUnique({ where: { phone_role: { phone, role: "CUSTOMER" } }, select: { id: true } }),
    tx.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: input.lineUserId } }, select: { id: true } }),
    provider === "line" ? tx.customer.findFirst({ where: { storeId: input.storeId, lineUserId: input.lineUserId, id: { not: customer.id } }, select: { id: true } }) : Promise.resolve(null),
    tx.customerIdentityLink.findFirst({ where: { provider, providerAccountId: input.lineUserId }, select: { id: true } }),
  ]);
  if (phoneOwner || account || lineCustomer || lineLink) return "review";
  const user = await tx.user.create({
    data: { name: customer.name, phone, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true },
  });
  const claimed = await tx.customer.updateMany({
    where: { id: customer.id, storeId: input.storeId, phone, name: customer.name,
      userId: null, lineUserId: customer.lineUserId, mergedIntoCustomerId: null, identityLinks: { none: {} },
      ...(input.course ? { googleId: null, lineBindingCode: null } : {}) },
    data: { userId: user.id, authSource: "LINE", ...(provider === "line" ? { lineUserId: input.lineUserId } : {}),
      lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
  });
  if (claimed.count !== 1) throw new Error("FIRST_LOGIN_RECORD_CHANGED");
  await tx.account.create({ data: { userId: user.id, provider, providerAccountId: input.lineUserId, type: "oauth" } });
  await tx.customerIdentityLink.create({ data: { userId: user.id, storeId: input.storeId,
    customerId: customer.id, provider, providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
  await tx.auditLog.create({ data: { actorUserId: user.id, ...(input.course ? { storeId: input.storeId, module: "COURSE" } : {}), targetType: "Customer", targetId: customer.id,
    action: "FIRST_LINE_LOGIN_NAME_PHONE_MATCH", afterJson: { storeId: input.storeId, existingCustomerActivated: true, ...(input.course ? { identityProvider: provider } : {}) } } });
  return "activated";
}
