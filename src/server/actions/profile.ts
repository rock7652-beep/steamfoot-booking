"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { compareSync, hashSync } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";

// ============================================================
// 更新個人資料
// ============================================================

export type ProfileState = { error: string | null; success: boolean };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") {
    return { error: "權限不足", success: false };
  }

  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const gender = (formData.get("gender") as string)?.trim();
  const birthdayStr = (formData.get("birthday") as string)?.trim();
  const heightStr = (formData.get("height") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null; // 僅 notes 保持可空

  // 必填驗證（除 notes 外皆必填）
  if (!name) return { error: "請輸入姓名", success: false };
  if (!phone) return { error: "請輸入手機號碼", success: false };
  if (!email) return { error: "請輸入 Email", success: false };
  if (!gender) return { error: "請選擇性別", success: false };
  if (!birthdayStr) return { error: "請選擇生日", success: false };
  if (!heightStr) return { error: "請輸入身高", success: false };
  if (!address) return { error: "請輸入地址", success: false };

  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機號碼格式不正確（09 開頭共 10 碼）", success: false };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email 格式不正確", success: false };
  }

  const birthday = new Date(birthdayStr);
  if (isNaN(birthday.getTime())) {
    return { error: "生日格式不正確", success: false };
  }

  const height = parseFloat(heightStr);
  if (isNaN(height) || height < 50 || height > 250) {
    return { error: "身高數值不合理（50-250 cm）", success: false };
  }

  // ── 統一 resolver ───────────────────────────────────
  // 與 profile page render 使用同一支；submit 額外提供 payload email/phone
  // 供 email/phone 唯一匹配 auto-bind。
  const storeCtx = await getStoreContext();
  const storeId = user.storeId ?? storeCtx?.storeId ?? null;

  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId,
    storeSlug: storeCtx?.storeSlug ?? null,
    payloadEmail: email,
    payloadPhone: phone,
  });

  console.info("[updateProfileAction] resolved", {
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId,
    payloadEmail: email,
    payloadPhone: phone,
    resolvedCustomerId: resolved.customer?.id ?? null,
    reason: resolved.reason,
  });

  // 錯誤訊息分流 — 不要一律顯示「找不到」
  if (!resolved.customer) {
    if (resolved.reason === "conflict_multiple_email") {
      return {
        error: "系統偵測到同店有多筆相同 Email 的顧客資料，請聯繫店家協助確認",
        success: false,
      };
    }
    if (resolved.reason === "conflict_multiple_phone") {
      return {
        error: "系統偵測到同店有多筆相同聯絡電話的顧客資料，請聯繫店家協助確認",
        success: false,
      };
    }
    if (resolved.reason === "conflict_already_linked_email") {
      return {
        error:
          "此 Email 已綁定其他登入帳號。請確認聯絡電話也與您過去留給店家的一致；若確認無誤請聯繫店家協助。",
        success: false,
      };
    }
    if (resolved.reason === "conflict_already_linked_phone") {
      return {
        error:
          "此聯絡電話已綁定其他登入帳號。請確認 Email 也與您過去留給店家的一致；若確認無誤請聯繫店家協助。",
        success: false,
      };
    }
    // not_found — 這時允許新建（但需有 storeId）
    if (!storeId) {
      return {
        error: "無法判斷您的所屬店舖，請重新進入店家入口再試",
        success: false,
      };
    }
    try {
      const created = await prisma.customer.create({
        data: {
          name,
          phone,
          email,
          gender,
          birthday,
          height,
          address,
          notes,
          storeId,
          userId: user.id,
          authSource: "EMAIL",
          customerStage: "LEAD",
        },
        select: { id: true },
      });
      console.info("[updateProfileAction] customer created on-demand", {
        userId: user.id,
        storeId,
        customerId: created.id,
      });
      revalidatePath("/profile");
      return { error: null, success: true };
    } catch (err) {
      console.error("[updateProfileAction] create failed", { userId: user.id, err });
      return {
        error: "建立顧客資料失敗，請稍後再試或聯繫店家",
        success: false,
      };
    }
  }

  // resolved.customer 存在 → update
  const customerId = resolved.customer.id;
  const customerStoreId = resolved.customer.storeId;

  try {
    // 額外的 unique 檢查：phone/email 是否被「其他」人佔用（同店）
    if (phone !== resolved.customer.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone, id: { not: customerId }, storeId: customerStoreId },
      });
      if (existingPhone) {
        return { error: "此聯絡電話已被其他帳號使用", success: false };
      }
    }
    if (email !== resolved.customer.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email, id: { not: customerId }, storeId: customerStoreId },
      });
      if (existingEmail) {
        return { error: "此 Email 已被其他帳號使用", success: false };
      }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { name, phone, email, gender, birthday, height, address, notes },
    });

    // 同步 User.name
    if (resolved.customer.userId) {
      await prisma.user.update({
        where: { id: resolved.customer.userId },
        data: { name },
      });
    }

    revalidatePath("/profile");
    return { error: null, success: true };
  } catch (error) {
    console.error("[updateProfileAction] update failed", {
      userId: user.id,
      customerId,
      error,
    });
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

// ============================================================
// 後台修改密碼（ADMIN / OWNER / STAFF）
// ============================================================

export async function staffChangePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireStaffSession();

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword) return { error: "請輸入目前密碼", success: false };
  if (!newPassword) return { error: "請輸入新密碼", success: false };
  if (newPassword.length < 8) return { error: "新密碼至少 8 碼", success: false };
  if (newPassword !== confirmPassword) return { error: "兩次密碼不一致", success: false };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return { error: "帳號異常，請聯繫管理者", success: false };
    }

    if (!compareSync(currentPassword, dbUser.passwordHash)) {
      return { error: "目前密碼不正確", success: false };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashSync(newPassword, 10) },
    });

    return { error: null, success: true };
  } catch (error) {
    console.error("[staffChangePasswordAction] Error:", error);
    return { error: "修改失敗，請稍後再試", success: false };
  }
}
