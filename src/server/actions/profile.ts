"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

// ============================================================
// Profile Update Action — 顧客更新個人資料
// ============================================================

export type ProfileState = { error: string | null; success: boolean };

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
  const gender = (formData.get("gender") as string)?.trim() || null;
  const birthdayStr = (formData.get("birthday") as string)?.trim() || null;
  const heightStr = (formData.get("height") as string)?.trim() || null;

  // Validation — 必填欄位
  if (!name) return { error: "請輸入姓名", success: false };
  if (!phone) return { error: "請輸入手機號碼", success: false };

  // 手機號碼格式驗證
  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機號碼格式不正確（請輸入 09 開頭的 10 位數字）", success: false };
  }

  // 選填欄位處理
  const birthday = birthdayStr ? new Date(birthdayStr) : null;
  const height = heightStr ? parseFloat(heightStr) : null;

  if (height !== null && (isNaN(height) || height < 50 || height > 250)) {
    return { error: "身高數值不合理（50-250 cm）", success: false };
  }

  try {
    // 檢查 phone 是否已被其他 Customer 使用
    const existingByPhone = await prisma.customer.findFirst({
      where: {
        phone,
        id: { not: user.customerId },
      },
    });
    if (existingByPhone) {
      return { error: "此手機號碼已被其他帳號使用", success: false };
    }

    await prisma.customer.update({
      where: { id: user.customerId },
      data: {
        name,
        phone,
        gender,
        birthday,
        height,
      },
    });

    revalidatePath("/profile");
    return { error: null, success: true };
  } catch (error) {
    console.error("[updateProfileAction] Error:", error);
    return { error: "儲存失敗，請稍後再試", success: false };
  }
}
