"use server";

import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { DEFAULT_STORE_ID } from "@/lib/store";

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

  if (!phone || !password) {
    return { error: "請輸入手機號碼和密碼" };
  }

  try {
    await signIn("customer-phone", {
      phone,
      password,
      redirectTo: "/book",
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

  // 檢查手機是否已有顧客帳號（店長帳號不影響）
  const existingUser = await prisma.user.findFirst({
    where: { phone, role: "CUSTOMER" },
  });
  if (existingUser) {
    return { error: "此手機號碼已註冊，請直接登入" };
  }

  const existingCustomer = await prisma.customer.findFirst({ where: { phone, storeId: DEFAULT_STORE_ID } });
  if (existingCustomer) {
    if (!existingCustomer.userId) {
      // 後台建立的顧客，導向帳號開通
      return { error: "NEEDS_ACTIVATION" };
    }
    return { error: "此手機號碼已註冊，請直接登入" };
  }

  // 選填欄位
  const birthday = birthdayStr ? new Date(birthdayStr) : null;

  const passwordHash = hashSync(password, 10);

  try {
    // 建立 User + Customer
    await prisma.user.create({
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
            storeId: DEFAULT_STORE_ID,
          },
        },
      },
    });

    // 自動登入
    await signIn("customer-phone", {
      phone,
      password,
      redirectTo: "/book",
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
