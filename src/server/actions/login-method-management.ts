"use server";

import { compareSync } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { requireSession } from "@/lib/session";
import {
  unlinkCustomerLoginMethod,
  type LoginMethod,
} from "@/server/services/manage-login-methods";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireCustomerId(): Promise<string | null> {
  const session = await requireSession();
  return session.role === "CUSTOMER" ? session.id : null;
}

export async function unlinkLoginMethodAction(method: LoginMethod): Promise<ActionResult> {
  const userId = await requireCustomerId();
  if (!userId) return { ok: false, message: "只有顧客會員可以管理登入方式" };
  if (!(["phone", "google", "line"] as const).includes(method)) {
    return { ok: false, message: "不支援的登入方式" };
  }
  const result = await unlinkCustomerLoginMethod({ userId, method });
  if (result === "last_method") {
    return { ok: false, message: "至少要保留一種登入方式，請先補綁其他方式" };
  }
  if (result === "unavailable") return { ok: false, message: "目前帳號無法變更" };
  revalidatePath("/profile");
  return { ok: true };
}

export async function replacePhoneLoginAction(input: {
  phone: string;
  phoneConfirmation: string;
  currentPassword: string;
}): Promise<ActionResult> {
  const userId = await requireCustomerId();
  if (!userId) return { ok: false, message: "只有顧客會員可以管理登入方式" };
  const phone = normalizePhone(input.phone);
  const confirmation = normalizePhone(input.phoneConfirmation);
  if (!phone || !/^09\d{8}$/.test(phone)) {
    return { ok: false, message: "請輸入 09 開頭的 10 碼手機號碼" };
  }
  if (phone !== confirmation) return { ok: false, message: "兩次輸入的手機號碼不一致" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, phone: true, passwordHash: true },
  });
  if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE" || !user.passwordHash) {
    return { ok: false, message: "請先設定手機密碼登入，或聯絡門市協助" };
  }
  if (!compareSync(input.currentPassword, user.passwordHash)) {
    return { ok: false, message: "目前密碼不正確" };
  }
  if (phone === user.phone) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      const conflict = await tx.user.findFirst({
        where: { phone, role: "CUSTOMER", id: { not: userId } },
        select: { id: true },
      });
      if (conflict) throw new Error("PHONE_OWNED_BY_OTHER_USER");
      const linkedCustomerConflict = await tx.customer.findFirst({
        where: {
          phone,
          userId: { not: null },
          NOT: { userId },
        },
        select: { id: true },
      });
      if (linkedCustomerConflict) throw new Error("PHONE_OWNED_BY_OTHER_USER");
      await tx.user.update({ where: { id: userId }, data: { phone } });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          targetType: "User",
          targetId: userId,
          action: "LOGIN_METHOD_PHONE_REPLACED",
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_OWNED_BY_OTHER_USER") {
      return { ok: false, message: "此手機號碼已屬於其他會員，無法覆蓋" };
    }
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "此手機號碼已屬於其他會員，無法覆蓋" };
    }
    throw error;
  }
  revalidatePath("/profile");
  return { ok: true };
}
