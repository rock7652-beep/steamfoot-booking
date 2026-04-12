"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession, requireStaffSession } from "@/lib/session";
import { requireFeature } from "@/lib/shop-config";
import { requirePermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/shop-plan";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { pushMessage, renderTemplate, type TemplateVariables } from "@/lib/line";
import type { ActionResult } from "@/types";
import { getShopConfig } from "@/lib/shop-config";

// ============================================================
// Validators
// ============================================================

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  triggerType: z.string().default("CUSTOM"), // legacy compat
  type: z.enum(["relative", "fixed"]),
  offsetMinutes: z.number().int().min(1).max(10080).optional(), // max 7 days
  offsetDays: z.number().int().min(0).max(7).optional().default(1),
  fixedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  channel: z.enum(["LINE", "EMAIL", "SMS"]).optional().default("LINE"),
  templateId: z.string().cuid().optional(),
  isEnabled: z.boolean().optional().default(true),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["relative", "fixed"]).optional(),
  offsetMinutes: z.number().int().min(1).max(10080).optional(),
  offsetDays: z.number().int().min(0).max(7).optional(),
  fixedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  templateId: z.string().cuid().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  channel: z.enum(["LINE", "EMAIL", "SMS"]).optional().default("LINE"),
  body: z.string().min(1).max(2000),
  isDefault: z.boolean().optional().default(false),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  body: z.string().min(1).max(2000).optional(),
  isDefault: z.boolean().optional(),
});

// ============================================================
// ReminderRule CRUD
// ============================================================

export async function createReminderRule(
  input: z.input<typeof createRuleSchema>
): Promise<ActionResult<{ ruleId: string }>> {
  try {
    await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);
    const data = createRuleSchema.parse(input);

    const rule = await prisma.reminderRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
        type: data.type,
        offsetMinutes: data.type === "relative" ? data.offsetMinutes : null,
        offsetDays: data.type === "fixed" ? (data.offsetDays ?? 1) : 0,
        fixedTime: data.type === "fixed" ? (data.fixedTime ?? "20:00") : null,
        channel: data.channel,
        templateId: data.templateId ?? null,
        isEnabled: data.isEnabled,
      },
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: { ruleId: rule.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function updateReminderRule(
  ruleId: string,
  input: z.input<typeof updateRuleSchema>
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);
    const data = updateRuleSchema.parse(input);

    await prisma.reminderRule.update({
      where: { id: ruleId },
      data,
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function toggleReminderRule(
  ruleId: string,
  isEnabled: boolean
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);

    await prisma.reminderRule.update({
      where: { id: ruleId },
      data: { isEnabled },
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// MessageTemplate CRUD
// ============================================================

export async function createMessageTemplate(
  input: z.input<typeof createTemplateSchema>
): Promise<ActionResult<{ templateId: string }>> {
  try {
    await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);
    const data = createTemplateSchema.parse(input);

    // If setting as default, unset others
    if (data.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: { channel: data.channel, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        name: data.name,
        channel: data.channel,
        body: data.body,
        isDefault: data.isDefault,
      },
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: { templateId: template.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function updateMessageTemplate(
  templateId: string,
  input: z.input<typeof updateTemplateSchema>
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);
    const data = updateTemplateSchema.parse(input);

    if (data.isDefault) {
      const existing = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
      if (existing) {
        await prisma.messageTemplate.updateMany({
          where: { channel: existing.channel, isDefault: true, NOT: { id: templateId } },
          data: { isDefault: false },
        });
      }
    }

    await prisma.messageTemplate.update({
      where: { id: templateId },
      data,
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Test send
// ============================================================

export async function testSendLineMessage(
  customerId: string,
  templateId: string
): Promise<ActionResult<void>> {
  try {
    const adminUser = await requireAdminSession();
    await requireFeature(FEATURES.AUTO_REMINDER);

    const [customer, template] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        include: { assignedStaff: true },
      }),
      prisma.messageTemplate.findUnique({ where: { id: templateId } }),
    ]);
    const shopConfig = customer ? await getShopConfig(customer.storeId) : null;

    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(adminUser, customer.storeId);
    if (!template) throw new AppError("NOT_FOUND", "模板不存在");
    if (!customer.lineUserId) {
      throw new AppError("BUSINESS_RULE", "此顧客尚未綁定 LINE");
    }

    const vars: TemplateVariables = {
      customerName: customer.name,
      bookingDate: "2026-01-01",
      bookingTime: "14:00",
      shopName: shopConfig?.shopName ?? "蒸足",
      staffName: customer.assignedStaff?.displayName ?? "店長",
      bookingLink: `${process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.steamfoot.com"}/my-bookings`,
    };

    const renderedBody = renderTemplate(template.body, vars);

    const result = await pushMessage(customer.lineUserId, [
      { type: "text", text: renderedBody },
    ]);

    // Log the send
    await prisma.messageLog.create({
      data: {
        customerId: customer.id,
        templateId: template.id,
        channel: "LINE",
        status: result.success ? "SENT" : "FAILED",
        renderedBody,
        errorMessage: result.error ?? null,
        sentAt: result.success ? new Date() : null,
      },
    });

    if (!result.success) {
      throw new AppError("BUSINESS_RULE", `發送失敗: ${result.error}`);
    }

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// LINE Binding Actions
// ============================================================

/** 產生 6 碼英數綁定碼 */
function generateBindingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字元
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 產生或重新產生顧客的 LINE 綁定碼 */
export async function generateLineBindingCode(
  customerId: string
): Promise<ActionResult<{ code: string }>> {
  try {
    const user = await requirePermission("customer.update");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    if (customer.lineLinkStatus === "LINKED") {
      throw new AppError("BUSINESS_RULE", "此顧客���綁定 LINE，請先解除綁定");
    }

    // 產生唯一綁定碼（最多嘗試 10 次）
    let code = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateBindingCode();
      const existing = await prisma.customer.findUnique({
        where: { lineBindingCode: code },
      });
      if (!existing) break;
      if (attempt === 9) throw new AppError("BUSINESS_RULE", "產生綁定碼失敗，請重試");
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        lineBindingCode: code,
        lineBindingCodeCreatedAt: new Date(),
      },
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true, data: { code } };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 解除 LINE 綁定 */
export async function unlinkLineAccount(
  customerId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("customer.update");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        lineUserId: null,
        lineLinkedAt: null,
        lineLinkStatus: "UNLINKED",
        lineBindingCode: null,
        lineBindingCodeCreatedAt: null,
      },
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
