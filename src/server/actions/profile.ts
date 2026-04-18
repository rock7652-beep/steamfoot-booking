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
    // not_found — 統一處理：先查「目標店內真人 Customer」再決定 merge / update / create
    if (!storeId) {
      return {
        error: "無法判斷您的所屬店舖，請重新進入店家入口再試",
        success: false,
      };
    }
    try {
      // 1) 目標店內，是否已有 phone 或 email 吻合的真人 Customer
      const realByPhone = await prisma.customer.findFirst({
        where: { phone, storeId },
        select: { id: true, userId: true, phone: true, email: true },
      });
      const realByEmail = !realByPhone
        ? await prisma.customer.findFirst({
            where: { email, storeId },
            select: { id: true, userId: true, phone: true, email: true },
          })
        : null;
      const real = realByPhone ?? realByEmail;

      // 2) 當前 user 是否已有 Customer（可能是 auth.ts 首登建的佔位，可能在同/別店）
      const existingByUserId = await prisma.customer.findUnique({
        where: { userId: user.id },
        select: { id: true, storeId: true, phone: true },
      });

      console.info("[updateProfileAction] not_found analysis", {
        userId: user.id,
        sessionStoreId: storeId,
        realId: real?.id ?? null,
        realUserId: real?.userId ?? null,
        realMatchedBy: realByPhone ? "phone" : realByEmail ? "email" : null,
        existingByUserIdId: existingByUserId?.id ?? null,
        existingByUserIdStoreId: existingByUserId?.storeId ?? null,
      });

      // ── Case A: 有 real，且 real 與當前使用者的 existing 是不同 row → merge ──
      if (real && (!existingByUserId || existingByUserId.id !== real.id)) {
        if (real.userId && real.userId !== user.id) {
          console.warn(
            "[updateProfileAction] merge blocked — real owned by another user",
            {
              userId: user.id,
              realId: real.id,
              realUserId: real.userId,
            },
          );
          return {
            error:
              "此聯絡電話/Email 已綁定其他登入帳號。若確認是您本人，請聯繫店家協助。",
            success: false,
          };
        }
        // 安全 merge：先釋放 existing 的 userId，再綁定 real 並寫入資料
        const ops = [];
        if (existingByUserId) {
          ops.push(
            prisma.customer.update({
              where: { id: existingByUserId.id },
              data: { userId: null },
            }),
          );
        }
        ops.push(
          prisma.customer.update({
            where: { id: real.id },
            data: {
              userId: user.id,
              name,
              phone,
              email,
              gender,
              birthday,
              height,
              address,
              notes,
            },
          }),
        );
        await prisma.$transaction(ops);
        await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
        console.info("[updateProfileAction] merged (not_found path)", {
          userId: user.id,
          placeholderId: existingByUserId?.id ?? null,
          realId: real.id,
          mergedBy: realByPhone ? "phone" : "email",
        });
        revalidatePath("/profile");
        return { error: null, success: true };
      }

      // ── Case B: 有 real，且就是 existing 自己（例如前一次已 merge 綁過）→ 直接 update ──
      if (real && existingByUserId && existingByUserId.id === real.id) {
        await prisma.customer.update({
          where: { id: real.id },
          data: { name, phone, email, gender, birthday, height, address, notes, storeId },
        });
        console.info("[updateProfileAction] updated self (real === existing)", {
          userId: user.id,
          customerId: real.id,
        });
        revalidatePath("/profile");
        return { error: null, success: true };
      }

      // ── Case C: 目標店無 real，但有 existing（通常是佔位）→ 就地 update 並校正 storeId ──
      if (existingByUserId) {
        await prisma.customer.update({
          where: { id: existingByUserId.id },
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
          },
        });
        console.info(
          "[updateProfileAction] updated existing-by-userId (no real conflict)",
          {
            userId: user.id,
            customerId: existingByUserId.id,
            existingStoreId: existingByUserId.storeId,
            sessionStoreId: storeId,
          },
        );
        revalidatePath("/profile");
        return { error: null, success: true };
      }

      // ── Case D: 全無既有資料 → create ──
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
      const errMsg = err instanceof Error ? err.message : String(err);
      const prismaCode = (err as { code?: string })?.code;
      const prismaMeta = (err as { meta?: { target?: string[] } })?.meta;
      console.error("[updateProfileAction] not_found branch failed", {
        userId: user.id,
        storeId,
        payloadEmail: email,
        payloadPhone: phone,
        prismaCode,
        prismaTarget: prismaMeta?.target,
        error: errMsg,
      });

      if (prismaCode === "P2002") {
        const target = prismaMeta?.target;
        if (target?.includes("email") || target?.includes("uq_store_customer_email")) {
          return { error: "此 Email 已被其他帳號使用", success: false };
        }
        if (target?.includes("phone") || target?.includes("uq_store_customer_phone")) {
          return { error: "此聯絡電話已被其他帳號使用", success: false };
        }
      }

      return {
        error: "建立顧客資料失敗，請稍後再試或聯繫店家",
        success: false,
      };
    }
  }

  // resolved.customer 存在 → update
  const customerId = resolved.customer.id;
  const customerStoreId = resolved.customer.storeId;

  // ── Placeholder → Real merge 偵測 ─────────────────
  // 情境：auth.ts 在 LINE/Google 首次登入時建了佔位 Customer（phone=_oauth_xxx），
  // 但後台早已有一筆「真人 Customer」（staff 建的）存在，phone/email 對得上。
  // 這時 update 佔位會撞到同店 phone/email unique。
  // 安全條件：真人 Customer 的 userId 為 null（未被佔用）或等於當前使用者。
  const isResolvedPlaceholder =
    resolved.customer.phone.startsWith("_oauth_");

  if (isResolvedPlaceholder) {
    try {
      const realByPhone = await prisma.customer.findFirst({
        where: { phone, id: { not: customerId }, storeId: customerStoreId },
        select: { id: true, userId: true },
      });
      const realByEmail =
        !realByPhone
          ? await prisma.customer.findFirst({
              where: { email, id: { not: customerId }, storeId: customerStoreId },
              select: { id: true, userId: true },
            })
          : null;
      const real = realByPhone ?? realByEmail;

      if (real) {
        if (real.userId && real.userId !== user.id) {
          console.warn(
            "[updateProfileAction] merge blocked — real customer owned by another user",
            {
              userId: user.id,
              placeholderId: customerId,
              realId: real.id,
              realUserId: real.userId,
            },
          );
          return {
            error:
              "此聯絡電話/Email 已綁定其他登入帳號。若確認是您本人，請聯繫店家協助。",
            success: false,
          };
        }

        // Merge: 先把佔位的 userId 釋放，再把真人 Customer 綁到當前 userId 並更新欄位
        await prisma.$transaction([
          prisma.customer.update({
            where: { id: customerId },
            data: { userId: null },
          }),
          prisma.customer.update({
            where: { id: real.id },
            data: {
              userId: user.id,
              name,
              phone,
              email,
              gender,
              birthday,
              height,
              address,
              notes,
            },
          }),
        ]);

        console.info("[updateProfileAction] placeholder merged into real", {
          userId: user.id,
          placeholderId: customerId,
          realId: real.id,
          mergedBy: realByPhone ? "phone" : "email",
        });

        // 同步 User.name
        await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });

        revalidatePath("/profile");
        return { error: null, success: true };
      }
      // real 不存在 → 放行繼續下方正常 update（更新佔位並換成使用者輸入的真資料）
    } catch (err) {
      console.error("[updateProfileAction] merge probe failed", {
        userId: user.id,
        customerId,
        err,
      });
      // 不中斷，繼續往下走正常 update；若撞 unique 會由下方 catch 處理
    }
  }

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
