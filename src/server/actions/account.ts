"use server";

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { sendActivationEmail, sendPasswordResetEmail } from "@/lib/email";
import type { ActionResult } from "@/types";

// ============================================================
// Token helpers
// ============================================================

/** 產生隨機 token（URL-safe） */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash token（DB 存 hash，URL 給 raw） */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const ACTIVATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1h

// ============================================================
// checkPhoneStatus — 判斷手機號碼的帳號狀態
// ============================================================

export type PhoneStatus =
  | { status: "not_found" }
  | { status: "needs_activation"; customerName: string; hasEmail: boolean }
  | { status: "active"; customerName: string };

export async function checkPhoneStatus(phone: string): Promise<PhoneStatus> {
  if (!phone || !/^09\d{8}$/.test(phone)) {
    return { status: "not_found" };
  }

  // 先查 User — 只查 CUSTOMER 角色（店長帳號不影響顧客）
  const user = await prisma.user.findFirst({
    where: { phone, role: "CUSTOMER" },
    select: { id: true, role: true, status: true, customer: { select: { name: true } } },
  });

  if (user && user.status === "ACTIVE") {
    return {
      status: "active",
      customerName: user.customer?.name ?? "",
    };
  }

  // 查 Customer（可能由後台建立，無 User）
  const customer = await prisma.customer.findFirst({
    where: { phone, userId: null },
    select: { name: true, email: true },
    orderBy: { createdAt: "desc" },
  });

  if (customer) {
    return {
      status: "needs_activation",
      customerName: customer.name,
      hasEmail: !!customer.email,
    };
  }

  return { status: "not_found" };
}

// ============================================================
// requestActivation — 寄出帳號開通 Email
// ============================================================

export type ActivationRequestResult = ActionResult<{ masked: string }>;

export async function requestActivation(
  phone: string,
  email: string
): Promise<ActivationRequestResult> {
  try {
    if (!phone || !/^09\d{8}$/.test(phone)) {
      return { success: false, error: "手機號碼格式不正確" };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "Email 格式不正確" };
    }

    // 找到未開通的 Customer
    const customer = await prisma.customer.findFirst({
      where: { phone, userId: null },
      orderBy: { createdAt: "desc" },
    });

    if (!customer) {
      return { success: false, error: "找不到此手機號碼的顧客資料，或帳號已開通" };
    }

    // 檢查 email 是否被其他顧客使用
    if (email) {
      const emailTaken = await prisma.customer.findFirst({
        where: { email, id: { not: customer.id } },
      });
      if (emailTaken) {
        return { success: false, error: "此 Email 已被其他帳號使用" };
      }
    }

    // 更新 Customer email
    await prisma.customer.update({
      where: { id: customer.id },
      data: { email },
    });

    // 清除舊 token
    const identifier = `activate:${customer.id}`;
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    // 建立新 token
    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires: new Date(Date.now() + ACTIVATE_EXPIRY_MS),
      },
    });

    // 寄出 email（URL 帶 raw token）
    await sendActivationEmail(email, rawToken, customer.name);

    // 回傳遮蔽 email
    const masked = maskEmail(email);
    return { success: true, data: { masked } };
  } catch (e) {
    console.error("[requestActivation]", e);
    return { success: false, error: "系統錯誤，請稍後再試" };
  }
}

// ============================================================
// activateAccount — 驗證 token + 設定密碼 + 建立 User
// ============================================================

export type ActivateResult = ActionResult<{ phone: string }>;

export async function activateAccount(
  rawToken: string,
  password: string
): Promise<ActivateResult> {
  try {
    if (!rawToken) return { success: false, error: "缺少驗證碼" };

    if (!/^\d{4,}$/.test(password)) {
      return { success: false, error: "密碼需為純數字，至少 4 碼" };
    }

    const hashedToken = hashToken(rawToken);
    const record = await prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record) {
      return { success: false, error: "驗證連結無效或已過期，請重新申請" };
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { identifier_token: { identifier: record.identifier, token: hashedToken } },
      });
      return { success: false, error: "驗證連結已過期，請重新申請" };
    }

    // 解析 customerId
    const match = record.identifier.match(/^activate:(.+)$/);
    if (!match) {
      return { success: false, error: "驗證碼格式錯誤" };
    }
    const customerId = match[1];

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      return { success: false, error: "顧客資料不存在" };
    }
    if (customer.userId) {
      return { success: false, error: "此帳號已開通，請直接登入" };
    }

    // 檢查是否已有 CUSTOMER 角色的 User 使用此手機（店長帳號不影響）
    const existingCustomerUser = await prisma.user.findFirst({
      where: { phone: customer.phone, role: "CUSTOMER" },
    });
    if (existingCustomerUser) {
      return { success: false, error: "此手機號碼已有顧客帳號，請直接登入或聯繫店家" };
    }

    const passwordHash = hashSync(password, 10);

    // Transaction: 建立 User + 連結 Customer + 刪除 token
    await prisma.$transaction([
      prisma.user.create({
        data: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          passwordHash,
          role: "CUSTOMER",
          status: "ACTIVE",
          customer: {
            connect: { id: customer.id },
          },
        },
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: { authSource: "EMAIL" },
      }),
      prisma.verificationToken.delete({
        where: {
          identifier_token: { identifier: record.identifier, token: hashedToken },
        },
      }),
    ]);

    return { success: true, data: { phone: customer.phone } };
  } catch (e) {
    console.error("[activateAccount]", e);
    return { success: false, error: "開通失敗，請稍後再試" };
  }
}

// ============================================================
// requestPasswordReset — 寄出密碼重設 Email
// ============================================================

export async function requestPasswordReset(
  phone: string
): Promise<ActionResult<void>> {
  try {
    if (!phone || !/^09\d{8}$/.test(phone)) {
      // 不要洩漏是否存在 — 統一成功訊息
      return { success: true, data: undefined };
    }

    const user = await prisma.user.findFirst({
      where: { phone, role: "CUSTOMER" },
      select: { id: true, role: true, status: true, customer: { select: { id: true, name: true, email: true } } },
    });

    // 不論是否找到，都回傳成功（防列舉攻擊）
    if (!user || user.status !== "ACTIVE") {
      return { success: true, data: undefined };
    }

    const email = user.customer?.email;
    if (!email) {
      // 沒有 email，無法寄送 — 但不告知
      return { success: true, data: undefined };
    }

    // 清除舊 token
    const identifier = `reset:${user.id}`;
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    // 建立新 token
    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires: new Date(Date.now() + RESET_EXPIRY_MS),
      },
    });

    await sendPasswordResetEmail(
      email,
      rawToken,
      user.customer?.name ?? "顧客"
    );

    return { success: true, data: undefined };
  } catch (e) {
    console.error("[requestPasswordReset]", e);
    return { success: true, data: undefined }; // 不洩漏錯誤
  }
}

// ============================================================
// resetPassword — 驗證 token + 更新密碼
// ============================================================

export async function resetPassword(
  rawToken: string,
  password: string
): Promise<ActionResult<void>> {
  try {
    if (!rawToken) return { success: false, error: "缺少驗證碼" };

    if (!/^\d{4,}$/.test(password)) {
      return { success: false, error: "密碼需為純數字，至少 4 碼" };
    }

    const hashedToken = hashToken(rawToken);
    const record = await prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record) {
      return { success: false, error: "重設連結無效或已過期，請重新申請" };
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { identifier_token: { identifier: record.identifier, token: hashedToken } },
      });
      return { success: false, error: "重設連結已過期，請重新申請" };
    }

    const match = record.identifier.match(/^reset:(.+)$/);
    if (!match) {
      return { success: false, error: "驗證碼格式錯誤" };
    }
    const userId = match[1];

    const passwordHash = hashSync(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      prisma.verificationToken.delete({
        where: {
          identifier_token: { identifier: record.identifier, token: hashedToken },
        },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (e) {
    console.error("[resetPassword]", e);
    return { success: false, error: "重設失敗，請稍後再試" };
  }
}

// ============================================================
// 自動登入 helper（activation 後呼叫）
// ============================================================

export async function autoLoginAfterActivation(
  phone: string,
  password: string
): Promise<{ error: string | null }> {
  try {
    await signIn("customer-phone", {
      phone,
      password,
      redirectTo: "/book",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "帳號已開通，但自動登入失敗，請手動登入" };
    }
    throw e; // re-throw redirect
  }
  return { error: null };
}

// ============================================================
// Helpers
// ============================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal =
    local.length <= 2
      ? local[0] + "***"
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}
