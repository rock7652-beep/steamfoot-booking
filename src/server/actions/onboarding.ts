"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

// ============================================================
// Onboarding Action — 顧客首次填寫基本資料
// ============================================================

export type OnboardingState = { error: string | null };

export async function onboardingAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER" || !user.customerId) {
    return { error: "權限不足" };
  }

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const gender = (formData.get("gender") as string)?.trim() || null;
  const birthdayStr = (formData.get("birthday") as string)?.trim() || null;
  const heightStr = (formData.get("height") as string)?.trim() || null;

  // Validation — 必填欄位
  if (!name) return { error: "請輸入姓名" };
  if (!email) return { error: "請輸入 Email" };
  if (!phone) return { error: "請輸入手機號碼" };

  // 簡易 email 格式驗證
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email 格式不正確" };
  }

  // 手機號碼格式驗證（台灣格式）
  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機號碼格式不正確（請輸入 09 開頭的 10 位數字）" };
  }

  // 選填欄位處理
  const birthday = birthdayStr ? new Date(birthdayStr) : null;
  const height = heightStr ? parseFloat(heightStr) : null;

  if (height !== null && (isNaN(height) || height < 50 || height > 250)) {
    return { error: "身高數值不合理（50-250 cm）" };
  }

  try {
    // 檢查 email 是否已被其他 Customer 使用
    const existingByEmail = await prisma.customer.findFirst({
      where: {
        email,
        id: { not: user.customerId },
      },
    });
    if (existingByEmail) {
      return { error: "此 Email 已被其他帳號使用" };
    }

    // 檢查 phone 是否已被其他 Customer 使用
    const existingByPhone = await prisma.customer.findFirst({
      where: {
        phone,
        id: { not: user.customerId },
      },
    });
    if (existingByPhone) {
      return { error: "此手機號碼已被其他帳號使用" };
    }

    await prisma.customer.update({
      where: { id: user.customerId },
      data: {
        name,
        email,
        phone,
        gender,
        birthday,
        height,
      },
    });
  } catch (error) {
    console.error("[onboardingAction] Error:", error);
    return { error: "儲存失敗，請稍後再試" };
  }

  redirect("/book");
}
