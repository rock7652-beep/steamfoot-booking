"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwnerSession } from "@/lib/session";
import { requireFeature } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { AppError, handleActionError } from "@/lib/errors";
import { pushMessage, renderTemplate, type TemplateVariables } from "@/lib/line";
import type { ActionResult } from "@/types";

// ============================================================
// Validators
// ============================================================

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  triggerType: z.enum(["BEFORE_BOOKING_1D", "BEFORE_BOOKING_2H", "AFTER_SERVICE_7D", "INACTIVE_30D"]),
  channel: z.enum(["LINE", "EMAIL", "SMS"]).optional().default("LINE"),
  templateId: z.string().cuid().optional(),
  isEnabled: z.boolean().optional().default(true),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  triggerType: z.enum(["BEFORE_BOOKING_1D", "BEFORE_BOOKING_2H", "AFTER_SERVICE_7D", "INACTIVE_30D"]).optional(),
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
    await requireOwnerSession();
    await requireFeature(FEATURES.AUTO_REMINDER);
    const data = createRuleSchema.parse(input);

    const rule = await prisma.reminderRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
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
    await requireOwnerSession();
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
    await requireOwnerSession();
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
    await requireOwnerSession();
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
    await requireOwnerSession();
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
    await requireOwnerSession();
    await requireFeature(FEATURES.AUTO_REMINDER);

    const [customer, template, shopConfig] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        include: { assignedStaff: true },
      }),
      prisma.messageTemplate.findUnique({ where: { id: templateId } }),
      prisma.shopConfig.findUnique({ where: { id: "default" } }),
    ]);

    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
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
      bookingLink: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://steamfoot.tw"}/my-bookings`,
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
