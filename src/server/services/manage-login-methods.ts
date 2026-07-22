import { prisma } from "@/lib/db";

export type LoginMethod = "phone" | "google" | "line";

export async function unlinkCustomerLoginMethod(input: {
  userId: string;
  method: LoginMethod;
}): Promise<"unlinked" | "not_linked" | "last_method" | "unavailable"> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        role: true,
        status: true,
        phone: true,
        passwordHash: true,
        accounts: {
          where: { provider: { in: ["google", "line"] } },
          select: { provider: true },
        },
      },
    });
    if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") {
      return "unavailable";
    }
    const providers = new Set(user.accounts.map((item) => item.provider));
    const linked = {
      phone: Boolean(user.phone && user.passwordHash),
      google: providers.has("google"),
      line: providers.has("line"),
    };
    if (!linked[input.method]) return "not_linked";
    if (Object.values(linked).filter(Boolean).length <= 1) return "last_method";

    if (input.method === "phone") {
      await tx.user.update({
        where: { id: input.userId },
        data: { passwordHash: null },
      });
    } else {
      await tx.account.deleteMany({
        where: { userId: input.userId, provider: input.method },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        targetType: "User",
        targetId: input.userId,
        action: `LOGIN_METHOD_${input.method.toUpperCase()}_UNLINKED`,
      },
    });
    return "unlinked";
  });
}
