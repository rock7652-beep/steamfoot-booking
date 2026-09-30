"use server";

import { createHash, randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { sendBackofficePasswordResetEmail } from "@/lib/email";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";

const EXPIRY_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;
const STAFF_ROLES = ["OWNER", "PARTNER"] as const;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Always answer identically, regardless of whether an account exists. */
export async function requestBackofficePasswordReset(emailInput: string, storeSlugInput: string) {
  const response = { success: true as const };
  const email = emailInput.trim().toLowerCase();
  const storeSlug = storeSlugInput.trim();
  if (!isEmailConfigured || isPreviewExternalIntegrationBlocked() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[a-z0-9-]{1,80}$/.test(storeSlug)) return response;

  try {
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug }, select: { id: true, name: true, slug: true },
    });
    if (!store) return response;
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" }, status: "ACTIVE",
        role: { in: [...STAFF_ROLES] },
        staff: { storeId: store.id, status: "ACTIVE" },
      },
      select: { id: true, email: true },
    });
    if (!user?.email) return response;

    const identifier = `backoffice-reset:${store.id}:${user.id}`;
    const existing = await prisma.verificationToken.findFirst({
      where: { identifier, expires: { gt: new Date(Date.now() + EXPIRY_MS - COOLDOWN_MS) } },
    });
    if (existing) return response;

    const token = randomBytes(32).toString("hex");
    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.deleteMany({ where: { identifier } });
      await tx.verificationToken.create({
        data: { identifier, token: hashToken(token), expires: new Date(Date.now() + EXPIRY_MS) },
      });
    });
    await sendBackofficePasswordResetEmail(user.email, token, store.name, store.slug);
  } catch (error) {
    console.error("[backoffice-password-reset] request failed", error);
  }
  return response;
}

export async function completeBackofficePasswordReset(token: string, storeSlug: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-z0-9-]{1,80}$/.test(storeSlug)) {
    return { success: false as const, error: "重設連結無效或已過期" };
  }
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { success: false as const, error: "新密碼需 10 至 128 字元，並包含英文字母與數字" };
  }
  const digest = hashToken(token);
  try {
    const record = await prisma.verificationToken.findUnique({ where: { token: digest } });
    const match = record?.identifier.match(/^backoffice-reset:([^:]+):([^:]+)$/);
    if (!record || !match || record.expires <= new Date()) {
      return { success: false as const, error: "重設連結無效或已過期" };
    }
    const [, storeId, userId] = match;
    const user = await prisma.user.findFirst({
      where: {
        id: userId, status: "ACTIVE", role: { in: [...STAFF_ROLES] },
        staff: { storeId, status: "ACTIVE", store: { slug: storeSlug } },
      },
      select: { id: true },
    });
    if (!user) return { success: false as const, error: "重設連結無效或已過期" };

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationToken.deleteMany({
        where: { identifier: record.identifier, token: digest, expires: { gt: new Date() } },
      });
      if (consumed.count !== 1) throw new Error("token_already_consumed");
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashSync(password, 10) } });
    });
    return { success: true as const };
  } catch (error) {
    console.error("[backoffice-password-reset] completion failed", error);
    return { success: false as const, error: "重設連結無效或已過期" };
  }
}
