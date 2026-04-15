"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { compareSync, hashSync } from "bcryptjs";
import { revalidatePath } from "next/cache";

// ============================================================
// 更新個人資料
// ============================================================

export type ProfileState = { error: string | null; success: boolean; phoneChanged?: boolean };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER" || !user.customerId) {
    return { error: "權限不足", success: false };
  }

  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const gender = (formData.get("gender") as string)?.trim() || null;
  const birthdayStr = (formData.get("birthday") as string)?.trim() || null;
  const heightStr = (formData.get("height") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return { error: "請輸入姓名", success: false };
  if (!phone) return { error: "請輸入手機號碼", success: false };

  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機號碼格式不正確（09 開頭共 10 碼）", success: false };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email 格式不正確", success: false };
  }

  const birthday = birthdayStr ? new Date(birthdayStr) : null;
  const height = heightStr ? parseFloat(heightStr) : null;

  if (height !== null && (isNaN(height) || height < 50 || height > 250)) {
    return { error: "身高數值不合理（50-250 cm）", success: false };
  }

  try {
    // 檢查 phone unique（排除自己，限同店）
    const currentCustomer = await prisma.customer.findUnique({
      where: { id: user.customerId },
      select: { phone: true, userId: true, storeId: true },
    });
    if (!currentCustomer) return { error: "找不到帳號", success: false };

    if (phone !== currentCustomer.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone, id: { not: user.customerId }, storeId: currentCustomer.storeId },
      });
      if (existingPhone) {
        return { error: "此手機號碼已被其他帳號使用", success: false };
      }
      // 同步更新 User.phone（登入用）— 只檢查同角色（CUSTOMER）
      if (currentCustomer.userId) {
        const existingUserPhone = await prisma.user.findFirst({
          where: { phone, role: "CUSTOMER", id: { not: currentCustomer.userId } },
        });
        if (existingUserPhone) {
          return { error: "此手機號碼已被其他帳號使用", success: false };
        }
        await prisma.user.update({
          where: { id: currentCustomer.userId },
          data: { phone },
        });
      }
    }

    // 檢查 email unique（限同店）
    if (email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email, id: { not: user.customerId }, storeId: currentCustomer.storeId },
      });
      if (existingEmail) {
        return { error: "此 Email 已被其他帳號使用", success: false };
      }
    }

    await prisma.customer.update({
      where: { id: user.customerId },
      data: { name, phone, email, gender, birthday, height, address, notes },
    });

    // 同步 User.name
    if (currentCustomer.userId) {
      await prisma.user.update({
        where: { id: currentCustomer.userId },
        data: { name },
      });
    }

    const phoneChanged = phone !== currentCustomer.phone;
    revalidatePath("/profile");
    return { error: null, success: true, phoneChanged };
  } catch (error) {
    console.error("[updateProfileAction] Error:", error);
    return { error: "儲存失敗，請稍後再試", success: false };
  }
}

// ============================================================
// 修改密碼
// ============================================================

export type ChangePasswordState = { error: string | null; success: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") {
    return { error: "權限不足", success: false };
  }

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword) return { error: "請輸入目前密碼", success: false };
  if (!newPassword) return { error: "請輸入新密碼", success: false };

  if (!/^\d{4,}$/.test(newPassword)) {
    return { error: "新密碼需為純數字，至少 4 碼", success: false };
  }

  if (newPassword !== confirmPassword) {
    return { error: "兩次密碼不一致", success: false };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return { error: "帳號異常，請聯繫客服", success: false };
    }

    const valid = compareSync(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return { error: "目前密碼不正確", success: false };
    }

    const newHash = hashSync(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return { error: null, success: true };
  } catch (error) {
    console.error("[changePasswordAction] Error:", error);
    return { error: "修改失敗，請稍後再試", success: false };
  }
}
