"use server";

import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { createRegisterEvent } from "@/server/services/referral-events";

const PENDING_REF_COOKIE = "pending-ref";

// ============================================================
// 顧客手機登入
// ============================================================

export type CustomerLoginState = { error: string | null };

export async function customerLoginAction(
  _prev: CustomerLoginState,
  formData: FormData
): Promise<CustomerLoginState> {
  const phone = (formData.get("phone") as string)?.trim();
  const password = formData.get("password") as string;
  const storeId = (formData.get("storeId") as string) || undefined;
  const storeSlug = (formData.get("storeSlug") as string) || "zhubei";

  if (!phone || !password) {
    return { error: "請輸入手機號碼和密碼" };
  }

  try {
    await signIn("customer-phone", {
      phone,
      password,
      storeId,
      redirectTo: `/s/${storeSlug}/book`,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "手機號碼或密碼錯誤" };
    }
    // Re-throw Next.js redirect error
    throw e;
  }

  return { error: null };
}

// ============================================================
// 顧客註冊
// ============================================================

export type RegisterState = { error: string | null };

export async function customerRegisterAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const gender = (formData.get("gender") as string)?.trim() || null;
  const birthdayStr = (formData.get("birthday") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const formReferrerId = (formData.get("referrerId") as string)?.trim() || null;

  // fallback：若表單沒帶 referrerId，改讀 pending-ref cookie
  const cookieStore = await cookies();
  const cookieRef = cookieStore.get(PENDING_REF_COOKIE)?.value?.trim() || null;
  const referrerId = formReferrerId || cookieRef;

  // B7-4: 從表單讀取 store context
  const storeId = (formData.get("storeId") as string) || (await getStoreIdFromCookie());
  const storeSlug = (formData.get("storeSlug") as string) || "zhubei";

  // 必填驗證
  if (!name) return { error: "請輸入姓名" };
  if (!phone) return { error: "請輸入手機號碼" };
  if (!password) return { error: "請輸入密碼" };

  // 手機格式
  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機號碼格式不正確（09 開頭共 10 碼）" };
  }

  // 密碼規則：至少 4 位數字
  if (!/^\d{4,}$/.test(password)) {
    return { error: "密碼需為純數字，至少 4 碼" };
  }

  if (password !== confirmPassword) {
    return { error: "兩次密碼不一致" };
  }

  // 檢查手機是否已有顧客帳號（同店）
  const existingCustomer = await prisma.customer.findFirst({ where: { phone, storeId } });
  if (existingCustomer) {
    if (!existingCustomer.userId) {
      // 後台建立的顧客，導向帳號開通
      return { error: "NEEDS_ACTIVATION" };
    }
    return { error: "此手機號碼已註冊，請直接登入" };
  }

  // 也檢查 User 表（跨店同手機的 CUSTOMER User）
  const existingUser = await prisma.user.findFirst({
    where: { phone, role: "CUSTOMER" },
    include: { customer: { select: { storeId: true } } },
  });
  if (existingUser?.customer?.storeId === storeId) {
    return { error: "此手機號碼已註冊，請直接登入" };
  }

  // 選填欄位
  const birthday = birthdayStr ? new Date(birthdayStr) : null;

  // B8: 驗證推薦人存在且同 store
  let sponsorId: string | null = null;
  if (referrerId) {
    const sponsor = await prisma.customer.findFirst({
      where: { id: referrerId, storeId },
      select: { id: true },
    });
    if (sponsor) sponsorId = sponsor.id;
  }

  const passwordHash = hashSync(password, 10);

  try {
    // 建立 User + Customer
    const created = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
        customer: {
          create: {
            name,
            phone,
            gender,
            birthday,
            notes,
            authSource: "EMAIL",
            customerStage: "LEAD",
            storeId,
            sponsorId,
          },
        },
      },
      include: { customer: { select: { id: true } } },
    });

    // REGISTER 事件埋點（在 signIn 拋 NEXT_REDIRECT 前寫入）
    // 寫入失敗不應阻擋註冊 — 包 try/catch 靜默失敗
    try {
      await createRegisterEvent({
        storeId,
        customerId: created.customer?.id ?? null,
        referrerId: referrerId ?? null,
        source: cookieRef && !formReferrerId ? "pending-ref-cookie" : "register-form",
      });
    } catch {
      // 埋點失敗不影響註冊流程
    }

    // 清除 pending-ref cookie（無論有沒有用到，註冊完成就失效）
    if (cookieRef) {
      cookieStore.delete(PENDING_REF_COOKIE);
    }

    // 自動登入
    await signIn("customer-phone", {
      phone,
      password,
      storeId,
      redirectTo: `/s/${storeSlug}/book`,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "註冊成功但自動登入失敗，請手動登入" };
    }
    // Re-throw redirect
    throw e;
  }

  return { error: null };
}

// ============================================================
// Helper: 從 cookie slug 解析 storeId（fallback）
// ============================================================
async function getStoreIdFromCookie(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const slug = cookieStore.get("store-slug")?.value;
    if (slug) {
      const { resolveStoreBySlug } = await import("@/lib/store-resolver");
      const store = await resolveStoreBySlug(slug);
      if (store) return store.id;
    }
    return "default-store";
  } catch {
    return "default-store";
  }
}
