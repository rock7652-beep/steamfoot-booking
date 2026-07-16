"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession, requireStaffSession } from "@/lib/session";
import { requireStoreFeature } from "@/lib/feature-gate";
import { requirePermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { pushMessage, renderTemplate, type TemplateVariables } from "@/lib/line";
import { isLineSmokeTestEnabled } from "@/lib/line-config";
import type { ActionResult } from "@/types";
import { getShopConfig } from "@/lib/shop-config";
import { deriveBaseUrl } from "@/lib/base-url";
import { resolveWriteStoreId } from "@/lib/store";

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

const lineSmokeTestSchema = z.object({
  customerId: z.string().optional(),
  lineUserId: z.string().trim().optional(),
}).refine((data) => Boolean(data.customerId || data.lineUserId), {
  message: "請選擇顧客或輸入測試 lineUserId",
});

// ============================================================
// ReminderRule CRUD
// ============================================================

export async function createReminderRule(
  input: z.input<typeof createRuleSchema>
): Promise<ActionResult<{ ruleId: string }>> {
  try {
    const user = await requireStaffSession();
    const data = createRuleSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    const rule = await prisma.reminderRule.create({
      data: {
        storeId,
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
    const user = await requireStaffSession();
    const data = updateRuleSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    // Ownership check
    const existing = await prisma.reminderRule.findUnique({ where: { id: ruleId } });
    if (!existing || existing.storeId !== storeId) {
      throw new AppError("NOT_FOUND", "提醒規則不存在");
    }

    await prisma.reminderRule.update({
      where: { id: ruleId, storeId },
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
    const user = await requireStaffSession();
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    // Ownership check
    const existing = await prisma.reminderRule.findUnique({ where: { id: ruleId } });
    if (!existing || existing.storeId !== storeId) {
      throw new AppError("NOT_FOUND", "提醒規則不存在");
    }

    await prisma.reminderRule.update({
      where: { id: ruleId, storeId },
      data: { isEnabled },
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Store-level reminder toggle (canonical entry point — replaces per-rule UX)
// ============================================================

/**
 * 啟用/停用該店「明日預約提醒」（store-level，每店最多 1 條 enabled rule）
 *
 * 為什麼不是 per-rule toggle：reminder engine 是 daily next-day batch，
 * 不依 ReminderRule.fixedTime/offsetMinutes 排程；多條 enabled rule 會造成
 * 同一筆預約 N 倍重複發送（dedupe key 含 ruleId）。
 *
 * enabled=true 行為：
 *   - 無任何 rule → 建立 canonical「明日預約提醒」rule
 *   - 已有 ≥1 條 rule → 保留最早 createdAt 那條為 enabled，其餘同店 rule 一律
 *     改 isEnabled=false（reconcile 一律執行，防 future regression）
 *
 * enabled=false 行為：該店所有 isEnabled=true 一律改 false（不刪 row，保留 audit）
 */
export async function setReminderEnabled(
  enabled: boolean
): Promise<ActionResult<{ ruleId: string | null }>> {
  try {
    const user = await requireStaffSession();
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    if (!enabled) {
      await prisma.reminderRule.updateMany({
        where: { storeId, isEnabled: true },
        data: { isEnabled: false },
      });
      revalidatePath("/dashboard/reminders");
      return { success: true, data: { ruleId: null } };
    }

    const rules = await prisma.reminderRule.findMany({
      where: { storeId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (rules.length === 0) {
      const newRule = await prisma.reminderRule.create({
        data: {
          storeId,
          name: "明日預約提醒",
          triggerType: "BEFORE_BOOKING_1D",
          type: "fixed",
          offsetMinutes: null,
          offsetDays: 1,
          fixedTime: "18:00",
          channel: "LINE",
          isEnabled: true,
          templateId: null,
        },
      });
      revalidatePath("/dashboard/reminders");
      return { success: true, data: { ruleId: newRule.id } };
    }

    const canonical = rules[0];
    const extras = rules.slice(1);

    await prisma.$transaction([
      prisma.reminderRule.update({
        where: { id: canonical.id, storeId },
        data: { isEnabled: true },
      }),
      ...extras.map((r) =>
        prisma.reminderRule.update({
          where: { id: r.id, storeId },
          data: { isEnabled: false },
        })
      ),
    ]);

    revalidatePath("/dashboard/reminders");
    return { success: true, data: { ruleId: canonical.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * 設定該店 canonical rule 綁定的訊息模板
 *
 * canonical rule = 最早 createdAt 的 enabled rule；無 enabled rule 時退而求其次
 * 取最早 createdAt 的 rule（避免「停用狀態下無法預先選模板」）。
 */
export async function setReminderTemplate(
  templateId: string | null
): Promise<ActionResult<void>> {
  try {
    const user = await requireStaffSession();
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    const canonical =
      (await prisma.reminderRule.findFirst({
        where: { storeId, isEnabled: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })) ??
      (await prisma.reminderRule.findFirst({
        where: { storeId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }));

    if (!canonical) {
      throw new AppError("NOT_FOUND", "尚未建立提醒規則，請先啟用提醒");
    }

    if (templateId !== null) {
      const tpl = await prisma.messageTemplate.findUnique({
        where: { id: templateId },
        select: { storeId: true },
      });
      if (!tpl || tpl.storeId !== storeId) {
        throw new AppError("NOT_FOUND", "訊息模板不存在");
      }
    }

    await prisma.reminderRule.update({
      where: { id: canonical.id, storeId },
      data: { templateId },
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
    const user = await requireStaffSession();
    const data = createTemplateSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    // If setting as default, unset others (scoped to store)
    if (data.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: { channel: data.channel, isDefault: true, storeId },
        data: { isDefault: false },
      });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        storeId,
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
    const user = await requireStaffSession();
    const data = updateTemplateSchema.parse(input);
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    // Ownership check
    const existing = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
    if (!existing || existing.storeId !== storeId) {
      throw new AppError("NOT_FOUND", "訊息模板不存在");
    }

    if (data.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: { channel: existing.channel, isDefault: true, NOT: { id: templateId }, storeId },
        data: { isDefault: false },
      });
    }

    await prisma.messageTemplate.update({
      where: { id: templateId, storeId },
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
    const storeId = await resolveWriteStoreId(adminUser);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);

    const [customer, template] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId, storeId },
        include: { assignedStaff: true },
      }),
      prisma.messageTemplate.findUnique({ where: { id: templateId, storeId } }),
    ]);
    const shopConfig = customer ? await getShopConfig(customer.storeId) : null;

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
      bookingLink: `${deriveBaseUrl()}/my-bookings`,
    };

    const renderedBody = renderTemplate(template.body, vars);

    const result = await pushMessage(customer.storeId, customer.lineUserId, [
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
        storeId: customer.storeId,
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

export async function sendLineSmokeTest(
  input: z.input<typeof lineSmokeTestSchema>
): Promise<ActionResult<{ messageLogId: string; storeName: string }>> {
  try {
    const user = await requirePermission("customer.read");
    if (!isLineSmokeTestEnabled()) {
      throw new AppError("FORBIDDEN", "LINE smoke test is disabled");
    }

    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = lineSmokeTestSchema.parse(input);
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    const storeName = store?.name ?? "本店";

    const customer = data.customerId
      ? await prisma.customer.findFirst({
          where: {
            id: data.customerId,
            storeId,
            lineLinkStatus: "LINKED",
            lineUserId: { not: null },
          },
          select: { id: true, lineUserId: true },
        })
      : await prisma.customer.findFirst({
          where: {
            storeId,
            lineUserId: data.lineUserId,
            lineLinkStatus: "LINKED",
          },
          select: { id: true, lineUserId: true },
        });

    if (!customer?.lineUserId) {
      throw new AppError("VALIDATION", "找不到同店已綁定 LINE 的測試顧客");
    }

    const renderedBody = `這是 ${storeName} LINE 系統通知測試`;
    const result = await pushMessage(storeId, customer.lineUserId, [
      { type: "text", text: renderedBody },
    ]);

    const log = await prisma.messageLog.create({
      data: {
        customerId: customer.id,
        channel: "LINE",
        status: result.success ? "SENT" : "FAILED",
        renderedBody,
        errorMessage: result.error ?? null,
        sentAt: result.success ? new Date() : null,
        storeId,
      },
    });

    revalidatePath("/dashboard/reminders");

    if (!result.success) {
      throw new AppError("BUSINESS_RULE", result.error ?? "LINE 發送失敗");
    }

    return { success: true, data: { messageLogId: log.id, storeName } };
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
      const existing = await prisma.customer.findFirst({
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
