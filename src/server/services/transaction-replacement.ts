import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/** Caller holds the customer's row lock until the replacement and audit commit. */
export async function resolveTransactionReplacement(
  tx: Prisma.TransactionClient,
  input: { sourceId: string; storeId: string; customerId: string; fingerprint: string },
) {
  const source = await tx.transaction.findUnique({ where: { id: input.sourceId } });
  if (!source || source.storeId !== input.storeId || source.customerId !== input.customerId)
    throw new AppError("NOT_FOUND", "找不到本店顧客的原交易");
  if (source.status !== "VOIDED" || !["SINGLE_PURCHASE", "PACKAGE_PURCHASE"].includes(source.transactionType)
    || !["SUCCESS", "CONFIRMED"].includes(source.paymentStatus))
    throw new AppError("BUSINESS_RULE", "請先取消原購買交易，再補登正確收費");
  const prior = await tx.transactionAuditLog.findFirst({
    where: { storeId: input.storeId, transactionId: source.id, action: "UPDATE_NOTE",
      afterJson: { path: ["kind"], equals: "PURCHASE_REPLACEMENT" } },
    orderBy: { createdAt: "asc" },
  });
  if (prior) {
    const saved = prior.afterJson as Record<string, Prisma.JsonValue>;
    if (saved.fingerprint !== input.fingerprint)
      throw new AppError("CONFLICT", "原交易已補登，請查看補登後的交易，勿重複建立");
    const replacement = await tx.transaction.findUnique({ where: { id: String(saved.replacementTransactionId) } });
    if (!replacement || replacement.storeId !== input.storeId || replacement.customerId !== input.customerId
      || replacement.status !== "SUCCESS")
      throw new AppError("CONFLICT", "補登交易狀態已變更，請重新核對");
    return { source, existing: replacement };
  }
  return { source, existing: null };
}

export async function recordTransactionReplacement(tx: Prisma.TransactionClient, input: {
  sourceId: string; replacementId: string; storeId: string; actorUserId: string; fingerprint: string;
}) {
  await tx.transactionAuditLog.create({ data: {
    storeId: input.storeId, transactionId: input.sourceId, actorUserId: input.actorUserId,
    action: "UPDATE_NOTE", reason: "取消原交易後補登正確收費",
    afterJson: { kind: "PURCHASE_REPLACEMENT", replacementTransactionId: input.replacementId,
      fingerprint: input.fingerprint },
  } });
}
