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
import {
  pushMessage,
  pushSteamButlerMessage,
  renderTemplate,
  type TemplateVariables,
} from "@/lib/line";
import { isLineSmokeTestEnabled } from "@/lib/line-config";
import type { ActionResult } from "@/types";
import { getShopConfig } from "@/lib/shop-config";
import { deriveBaseUrl } from "@/lib/base-url";
import { resolveWriteStoreId } from "@/lib/store";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
import { getAllActiveStoreIds } from "@/lib/store";
import { DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING } from "@/lib/session-balance-notification-settings";
import { createTrialBookingActionToken } from "@/server/services/trial-booking-self-service";
import {
  buildPackageBookingTestReminderLineMessages,
  buildTrialBookingReminderLineMessages,
  buildTrialBookingReminderTextFallback,
  canFallbackToTextReminder,
} from "@/server/services/trial-booking-reminder-line-message";
import {
  previewMessengerUtilityTestReminder,
  sendMessengerUtilityTestReminder,
  type MessengerUtilityReminderCode,
} from "@/server/services/messenger-utility-reminder";

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
  customerId: z.string().min(1),
});

const bookingLineTestSchema = z.object({
  bookingId: z.string().min(1),
});

const bookingTestReminderSchema = bookingLineTestSchema;

const sessionBalanceSettingSchema = z.object({
  isEnabled: z.boolean(),
  lastSessionEnabled: z.boolean(),
  planUsedUpEnabled: z.boolean(),
  lastSessionUnbookedTemplate: z.string().min(1).max(1500),
  lastSessionBookedTemplate: z.string().min(1).max(1500),
  planUsedUpTemplate: z.string().min(1).max(1500),
  learnMoreButtonLabel: z.string().min(1).max(20),
  laterButtonLabel: z.string().min(1).max(20),
}).superRefine((data, ctx) => {
  const required: Array<{
    field: "lastSessionUnbookedTemplate" | "lastSessionBookedTemplate" | "planUsedUpTemplate";
    variables: string[];
  }> = [
    {
      field: "lastSessionUnbookedTemplate",
      variables: ["{customerName}", "{planName}", "{bookingUrl}"],
    },
    {
      field: "lastSessionBookedTemplate",
      variables: ["{customerName}", "{planName}", "{bookingDateTime}"],
    },
    {
      field: "planUsedUpTemplate",
      variables: ["{customerName}", "{planName}"],
    },
  ];
  for (const requirement of required) {
    for (const variable of requirement.variables) {
      if (!data[requirement.field].includes(variable)) {
        ctx.addIssue({
          code: "custom",
          path: [requirement.field],
          message: `必須保留變數 ${variable}`,
        });
      }
    }
  }
});

const BOOKING_LINE_TEST_PREFIX = "【測試提醒｜不影響正式排程】";
const BOOKING_LINE_TEST_COOLDOWN_MS = 60_000;

function packageReminderCardText(
  templateBody: string | null | undefined,
  renderedReminder: string,
  bookingLink: string,
): string {
  if (!templateBody) return "請記得準時到店。";

  const standardTemplateLines = new Set([
    "{{customerName}} 您好！",
    "明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。",
    "如需取消或改期，請點擊：{{bookingLink}}",
    "{{shopName}} 敬上",
  ]);
  const templateLines = templateBody.split("\n");
  const customText = renderedReminder
    .split("\n")
    .filter((_, index) => !standardTemplateLines.has(templateLines[index]?.trim()))
    .map((line) => line.replaceAll(bookingLink, "").trim())
    .filter((line) => line && !/^如需.*請點擊[：:]?$/.test(line))
    .join("\n");
  return customText || "請記得準時到店。";
}

type SessionBalanceSettingInput = z.input<typeof sessionBalanceSettingSchema>;

export type BookingTestReminderChannel = "LINE" | "MESSENGER";

type BookingTestReminderPreview = {
  channel: BookingTestReminderChannel;
  channelLabel: string;
};

const MESSENGER_TEST_ERROR: Record<Exclude<MessengerUtilityReminderCode, "SENT">, string> = {
  SKIPPED_DISABLED: "Messenger 自動提醒目前關閉；手動測試不會自行開啟它",
  SKIPPED_MISSING_TEMPLATE: "Messenger 的核准提醒範本尚未設定，因此未發送",
  SKIPPED_MISSING_IDENTITY: "這筆預約沒有可驗證的 Messenger 身分，因此未發送",
  FAILED_META_REJECTED: "Meta 拒絕此次 Messenger 測試提醒，未標記為成功",
  FAILED_TRANSPORT: "Messenger 傳輸失敗，未標記為成功",
  FAILED_CONFIGURATION: "Messenger Page 設定不完整，因此未發送",
  FAILED_IDENTITY_SCOPE: "Messenger 身分與此分店不一致，因此未發送",
};

function messengerTestError(code: Exclude<MessengerUtilityReminderCode, "SENT">): string {
  return MESSENGER_TEST_ERROR[code];
}

async function loadBookingTestReminderTarget(bookingId: string, storeId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, storeId },
    include: {
      customer: { include: { assignedStaff: true } },
      store: { select: { slug: true } },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "找不到同店預約");
  if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus)) {
    throw new AppError("BUSINESS_RULE", "只有待服務或已確認的預約可以發送測試提醒");
  }
  return booking;
}

function createTestBookingLink(booking: { id: string; storeId: string }): string {
  if (!process.env.TRIAL_BOOKING_ACTION_SECRET) {
    throw new AppError("BUSINESS_RULE", "體驗預約專屬連結尚未設定，因此未發送測試提醒");
  }
  return `${deriveBaseUrl()}/trial-booking/manage?token=${encodeURIComponent(createTrialBookingActionToken(booking))}`;
}

/**
 * Resolves exactly one delivery provider. Messenger is allowed only for a
 * first-trial booking whose original source is explicitly Messenger. Every
 * other booking uses the existing same-store, uniquely verified LINE route.
 */
export async function previewBookingTestReminder(
  input: z.input<typeof bookingTestReminderSchema>,
): Promise<ActionResult<BookingTestReminderPreview>> {
  try {
    const user = await requirePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    const { bookingId } = bookingTestReminderSchema.parse(input);
    const booking = await loadBookingTestReminderTarget(bookingId, storeId);

    if (booking.bookingType !== "FIRST_TRIAL" || booking.trialBookingChannel !== "MESSENGER") {
      const line = await previewBookingLineTestReminder({ bookingId });
      if (!line.success) return line;
      return {
        success: true,
        data: {
          channel: "LINE",
          channelLabel: line.data.lineRoute === "CENTRAL" ? "蒸管家中央 LINE" : "分店 LINE",
        },
      };
    }

    const preview = await previewMessengerUtilityTestReminder({
      booking: {
        id: booking.id,
        storeId: booking.storeId,
        bookingDate: booking.bookingDate,
        slotTime: booking.slotTime,
        people: booking.people,
      },
      store: { slug: booking.store.slug, shopName: (await getShopConfig(storeId)).shopName },
      bookingLink: createTestBookingLink(booking),
    });
    if (preview.code !== "READY") {
      throw new AppError("BUSINESS_RULE", messengerTestError(preview.code));
    }
    return { success: true, data: { channel: "MESSENGER", channelLabel: "Messenger Utility" } };
  } catch (e) {
    return handleActionError(e);
  }
}

/**
 * Sends an explicitly requested test through the booking's original channel.
 * Tests write only a test-marked MessageLog (without a scheduled rule or
 * trigger), so they cannot consume the 18:00 reminder's idempotency key.
 */
export async function sendBookingTestReminder(
  input: z.input<typeof bookingTestReminderSchema>,
): Promise<ActionResult<{ messageLogId: string; channel: BookingTestReminderChannel; channelLabel: string }>> {
  try {
    const user = await requirePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    const { bookingId } = bookingTestReminderSchema.parse(input);
    const booking = await loadBookingTestReminderTarget(bookingId, storeId);

    if (booking.bookingType !== "FIRST_TRIAL" || booking.trialBookingChannel !== "MESSENGER") {
      const line = await sendBookingLineTestReminder({ bookingId });
      if (!line.success) return line;
      return {
        success: true,
        data: {
          messageLogId: line.data.messageLogId,
          channel: "LINE",
          channelLabel: line.data.lineRoute === "CENTRAL" ? "蒸管家中央 LINE" : "分店 LINE",
        },
      };
    }

    const recentTest = await prisma.messageLog.findFirst({
      where: {
        bookingId,
        storeId,
        channel: "MESSENGER",
        renderedBody: { startsWith: BOOKING_LINE_TEST_PREFIX },
        createdAt: { gte: new Date(Date.now() - BOOKING_LINE_TEST_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recentTest) {
      throw new AppError("BUSINESS_RULE", "這筆預約剛剛已發送測試提醒，請稍後再試");
    }

    const shopConfig = await getShopConfig(storeId);
    const result = await sendMessengerUtilityTestReminder({
      booking: {
        id: booking.id,
        storeId: booking.storeId,
        bookingDate: booking.bookingDate,
        slotTime: booking.slotTime,
        people: booking.people,
      },
      store: { slug: booking.store.slug, shopName: shopConfig.shopName },
      bookingLink: createTestBookingLink(booking),
    });

    const [log] = await prisma.$transaction([
      prisma.messageLog.create({
        data: {
          customerId: booking.customerId,
          bookingId: booking.id,
          channel: "MESSENGER",
          status: result.code === "SENT" ? "SENT" : "FAILED",
          renderedBody: `${BOOKING_LINE_TEST_PREFIX}\nMessenger Utility 手動測試`,
          errorMessage: result.code === "SENT" ? null : result.code,
          sentAt: result.code === "SENT" ? new Date() : null,
          storeId,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Booking",
          targetId: booking.id,
          action: "SEND_MESSENGER_UTILITY_TEST_REMINDER",
          afterJson: { channel: "MESSENGER", success: result.code === "SENT", code: result.code },
        },
      }),
    ]);
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/bookings");

    if (result.code !== "SENT") {
      throw new AppError("BUSINESS_RULE", messengerTestError(result.code));
    }
    return { success: true, data: { messageLogId: log.id, channel: "MESSENGER", channelLabel: "Messenger Utility" } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function previewBookingLineTestReminder(
  input: z.input<typeof bookingLineTestSchema>
): Promise<ActionResult<{ lineRoute: "CENTRAL" | "STORE" }>> {
  try {
    const user = await requirePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const { bookingId } = bookingLineTestSchema.parse(input);
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      select: {
        customerId: true,
        storeId: true,
        customer: { select: { lineUserId: true, lineLinkStatus: true } },
      },
    });
    if (!booking) throw new AppError("NOT_FOUND", "找不到同店預約");

    const recipient = await resolveCentralLineRecipientForCustomer(
      booking.customerId,
      booking.storeId,
    );
    const route = await resolveVerifiedReminderLineRoute(
      booking.storeId,
      booking.customer.lineLinkStatus === "LINKED"
        ? booking.customer.lineUserId
        : null,
      recipient,
    );
    if (route.status === "BLOCKED") {
      throw new AppError("BUSINESS_RULE", `LINE 收件人無法使用（${route.reason}）`);
    }
    return { success: true, data: { lineRoute: route.channel } };
  } catch (e) {
    return handleActionError(e);
  }
}

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
// Session balance / renewal reminder settings
// ============================================================

function sessionBalanceSettingData(data: SessionBalanceSettingInput) {
  return {
    isEnabled: data.isEnabled,
    lastSessionEnabled: data.lastSessionEnabled,
    planUsedUpEnabled: data.planUsedUpEnabled,
    lastSessionUnbookedTemplate: data.lastSessionUnbookedTemplate,
    lastSessionBookedTemplate: data.lastSessionBookedTemplate,
    planUsedUpTemplate: data.planUsedUpTemplate,
    learnMoreButtonLabel: data.learnMoreButtonLabel,
    laterButtonLabel: data.laterButtonLabel,
  };
}

const sessionBalanceRuleSettingSchema = z.object({
  isEnabled: z.boolean(),
  lastSessionEnabled: z.boolean(),
  planUsedUpEnabled: z.boolean(),
});

const sessionBalanceTemplateSettingSchema = z.object({
  lastSessionUnbookedTemplate: z.string().min(1).max(1500),
  lastSessionBookedTemplate: z.string().min(1).max(1500),
  planUsedUpTemplate: z.string().min(1).max(1500),
  learnMoreButtonLabel: z.string().min(1).max(20),
  laterButtonLabel: z.string().min(1).max(20),
}).superRefine((data, ctx) => {
  const required = [
    { field: "lastSessionUnbookedTemplate" as const, variables: ["{customerName}", "{planName}", "{bookingUrl}"] },
    { field: "lastSessionBookedTemplate" as const, variables: ["{customerName}", "{planName}", "{bookingDateTime}"] },
    { field: "planUsedUpTemplate" as const, variables: ["{customerName}", "{planName}"] },
  ];
  for (const requirement of required) {
    for (const variable of requirement.variables) {
      if (!data[requirement.field].includes(variable)) {
        ctx.addIssue({
          code: "custom",
          path: [requirement.field],
          message: `必須保留變數 ${variable}`,
        });
      }
    }
  }
});

export async function saveSessionBalanceRuleSetting(
  input: z.input<typeof sessionBalanceRuleSettingSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = sessionBalanceRuleSettingSchema.parse(input);
    await prisma.sessionBalanceNotificationSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
        ...data,
      },
      update: data,
    });
    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function saveSessionBalanceTemplateSetting(
  input: z.input<typeof sessionBalanceTemplateSettingSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = sessionBalanceTemplateSettingSchema.parse(input);
    await prisma.sessionBalanceNotificationSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
        ...data,
      },
      update: data,
    });
    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function applySessionBalanceRulesToAllStores(
  input: z.input<typeof sessionBalanceRuleSettingSchema>,
): Promise<ActionResult<{ storeCount: number }>> {
  try {
    await requireAdminSession();
    const data = sessionBalanceRuleSettingSchema.parse(input);
    const storeIds = await getAllActiveStoreIds();
    await prisma.$transaction(
      storeIds.map((storeId) =>
        prisma.sessionBalanceNotificationSetting.upsert({
          where: { storeId },
          create: { storeId, ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING, ...data },
          update: data,
        }),
      ),
    );
    revalidatePath("/dashboard/reminders");
    return { success: true, data: { storeCount: storeIds.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function applySessionBalanceTemplatesToAllStores(
  input: z.input<typeof sessionBalanceTemplateSettingSchema>,
): Promise<ActionResult<{ storeCount: number }>> {
  try {
    await requireAdminSession();
    const data = sessionBalanceTemplateSettingSchema.parse(input);
    const storeIds = await getAllActiveStoreIds();
    await prisma.$transaction(
      storeIds.map((storeId) =>
        prisma.sessionBalanceNotificationSetting.upsert({
          where: { storeId },
          create: { storeId, ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING, ...data },
          update: data,
        }),
      ),
    );
    revalidatePath("/dashboard/reminders");
    return { success: true, data: { storeCount: storeIds.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function saveSessionBalanceNotificationSetting(
  input: SessionBalanceSettingInput,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = sessionBalanceSettingSchema.parse(input);

    await prisma.sessionBalanceNotificationSetting.upsert({
      where: { storeId },
      create: { storeId, ...sessionBalanceSettingData(data) },
      update: sessionBalanceSettingData(data),
    });

    revalidatePath("/dashboard/reminders");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function resetSessionBalanceNotificationSetting(): Promise<
  ActionResult<void>
> {
  return saveSessionBalanceNotificationSetting({
    ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  });
}

export async function applySessionBalanceSettingToAllStores(
  input: SessionBalanceSettingInput,
): Promise<ActionResult<{ storeCount: number }>> {
  try {
    await requireAdminSession();
    const data = sessionBalanceSettingSchema.parse(input);
    const storeIds = await getAllActiveStoreIds();

    await prisma.$transaction(
      storeIds.map((storeId) =>
        prisma.sessionBalanceNotificationSetting.upsert({
          where: { storeId },
          create: { storeId, ...sessionBalanceSettingData(data) },
          update: sessionBalanceSettingData(data),
        }),
      ),
    );

    revalidatePath("/dashboard/reminders");
    return { success: true, data: { storeCount: storeIds.length } };
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
    const recipient = await resolveCentralLineRecipientForCustomer(customer.id, customer.storeId);
    const route = await resolveVerifiedReminderLineRoute(
      customer.storeId,
      customer.lineUserId,
      recipient,
    );
    if (route.status === "BLOCKED") {
      throw new AppError("BUSINESS_RULE", `LINE 收件人無法使用（${route.reason}）`);
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

    const messages = [{ type: "text" as const, text: renderedBody }];
    const result = route.channel === "STORE"
      ? await pushMessage(customer.storeId, route.recipientLineUserId, messages)
      : await pushSteamButlerMessage(route.recipientLineUserId, messages);

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

    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, storeId },
      select: { id: true, lineUserId: true },
    });
    if (!customer) {
      throw new AppError("VALIDATION", "找不到同店測試顧客");
    }
    const recipient = await resolveCentralLineRecipientForCustomer(customer.id, storeId);
    const route = await resolveVerifiedReminderLineRoute(
      storeId,
      customer.lineUserId,
      recipient,
    );
    if (route.status === "BLOCKED") {
      throw new AppError("BUSINESS_RULE", `LINE 收件人無法使用（${route.reason}）`);
    }

    const renderedBody = `這是 ${storeName} LINE 系統通知測試`;
    const messages = [{ type: "text" as const, text: renderedBody }];
    const result = route.channel === "STORE"
      ? await pushMessage(storeId, route.recipientLineUserId, messages)
      : await pushSteamButlerMessage(route.recipientLineUserId, messages);

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

/**
 * 針對單筆預約立即發送測試提醒。
 *
 * 測試 MessageLog 刻意不帶 ruleId / triggerAt，避免占用正式排程的
 * uniq_rule_booking_trigger；正式 18:00 提醒仍會照常處理同一筆預約。
 */
export async function sendBookingLineTestReminder(
  input: z.input<typeof bookingLineTestSchema>
): Promise<ActionResult<{ messageLogId: string; lineRoute: "CENTRAL" | "STORE" }>> {
  try {
    const user = await requirePermission("booking.update");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const { bookingId } = bookingLineTestSchema.parse(input);

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, storeId },
      include: {
        customer: { include: { assignedStaff: true } },
        store: { select: { slug: true, name: true } },
      },
    });
    if (!booking) {
      throw new AppError("NOT_FOUND", "找不到同店預約");
    }
    if (!["PENDING", "CONFIRMED"].includes(booking.bookingStatus)) {
      throw new AppError("BUSINESS_RULE", "只有待服務或已確認的預約可以發送測試提醒");
    }
    if (booking.bookingType === "FIRST_TRIAL" && booking.trialBookingChannel === "MESSENGER") {
      throw new AppError("BUSINESS_RULE", "此體驗預約綁定 Messenger，不能改由 LINE 發送測試提醒");
    }

    const recentTest = await prisma.messageLog.findFirst({
      where: {
        bookingId,
        storeId,
        channel: "LINE",
        renderedBody: { startsWith: BOOKING_LINE_TEST_PREFIX },
        createdAt: { gte: new Date(Date.now() - BOOKING_LINE_TEST_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recentTest) {
      throw new AppError("BUSINESS_RULE", "這筆預約剛剛已發送測試提醒，請稍後再試");
    }

    const recipient = await resolveCentralLineRecipientForCustomer(
      booking.customerId,
      booking.storeId,
    );
    const route = await resolveVerifiedReminderLineRoute(
      booking.storeId,
      booking.customer.lineLinkStatus === "LINKED"
        ? booking.customer.lineUserId
        : null,
      recipient,
    );
    if (route.status === "BLOCKED") {
      throw new AppError("BUSINESS_RULE", `LINE 收件人無法使用（${route.reason}）`);
    }

    const [rule, shopConfig, storePresentation] = await Promise.all([
      prisma.reminderRule.findFirst({
        where: { storeId, isEnabled: true },
        orderBy: { createdAt: "asc" },
        include: { template: true },
      }),
      getShopConfig(storeId),
      booking.bookingType === "FIRST_TRIAL" || !booking.store?.slug
        ? Promise.resolve(null)
        : resolveStorePresentation(booking.store.slug),
    ]);
    const isLineTrialBooking = booking.bookingType === "FIRST_TRIAL";
    if (isLineTrialBooking && !process.env.TRIAL_BOOKING_ACTION_SECRET) {
      throw new AppError("BUSINESS_RULE", "體驗預約專屬連結尚未設定，已停止發送一般預約通知");
    }
    const templateBody = isLineTrialBooking
      ? `{{customerName}} 您好！

這是您明天 ({{bookingDate}}) {{bookingTime}} 的體驗預約提醒，請記得準時到店。

請使用下方按鈕確認會到、取消或改期。

{{shopName}} 敬上`
      : rule?.template?.body ??
      `{{customerName}} 您好！

明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

如需取消或改期，請點擊：{{bookingLink}}

{{shopName}} 敬上`;
    const bookingLink = isLineTrialBooking
      ? `${deriveBaseUrl()}/trial-booking/manage?token=${encodeURIComponent(createTrialBookingActionToken(booking))}`
      : `${deriveBaseUrl()}/my-bookings`;
    const customerFacingShopName = isLineTrialBooking
      ? shopConfig.shopName
      : storePresentation?.name ?? getCustomerFacingStoreName({
          slug: booking.store?.slug,
          name: shopConfig.shopName,
        });
    const renderedReminder = renderTemplate(templateBody, {
      customerName: booking.customer.name,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      bookingTime: booking.slotTime,
      shopName: customerFacingShopName,
      staffName: booking.customer.assignedStaff?.displayName ?? "店長",
      bookingLink,
    });
    const renderedBody = `${BOOKING_LINE_TEST_PREFIX}
這是管理者手動發送的通知測試，無須回覆。

${renderedReminder}`;
    const card = {
      customerName: booking.customer.name,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      bookingTime: booking.slotTime,
      shopName: customerFacingShopName,
      serviceName: "首次體驗",
    };
    const flexMessages = isLineTrialBooking
      ? buildTrialBookingReminderLineMessages(card, bookingLink)
      : buildPackageBookingTestReminderLineMessages({
        customerName: booking.customer.name,
        bookingDate: booking.bookingDate.toISOString().slice(0, 10),
        bookingTime: booking.slotTime,
        shopName: customerFacingShopName,
        serviceName: booking.bookingType === "PACKAGE_SESSION" ? "方案預約" : "單次預約",
        serviceDuration: "45 分鐘",
        address: storePresentation?.address,
        mapUrl: storePresentation?.mapUrl,
        reminderText: packageReminderCardText(
          rule?.template?.body,
          renderedReminder,
          bookingLink,
        ),
      }, bookingLink);
    const textMessages = isLineTrialBooking
      ? buildTrialBookingReminderTextFallback(card, bookingLink, `${BOOKING_LINE_TEST_PREFIX}\n這是管理者手動發送的通知測試，無須回覆。\n\n`)
      : [{ type: "text" as const, text: renderedBody }];
    let actualRoute = route.channel;
    let result =
      route.channel === "STORE"
        ? await pushMessage(storeId, route.recipientLineUserId, flexMessages)
        : await pushSteamButlerMessage(route.recipientLineUserId, flexMessages);
    if (canFallbackToTextReminder(result)) {
      result = route.channel === "STORE"
        ? await pushMessage(storeId, route.recipientLineUserId, textMessages)
        : await pushSteamButlerMessage(route.recipientLineUserId, textMessages);
    }
    const storeRecipient =
      booking.customer.lineLinkStatus === "LINKED"
        ? booking.customer.lineUserId?.trim()
        : null;
    if (
      route.channel === "CENTRAL" &&
      !result.success &&
      result.httpStatus === 400 &&
      storeRecipient
    ) {
      result = await pushMessage(storeId, storeRecipient, textMessages);
      actualRoute = "STORE";
    }

    const [log] = await prisma.$transaction([
      prisma.messageLog.create({
        data: {
          customerId: booking.customerId,
          bookingId: booking.id,
          templateId: rule?.templateId ?? null,
          channel: "LINE",
          lineRoute: actualRoute,
          status: result.success ? "SENT" : "FAILED",
          renderedBody,
          errorMessage: result.error ?? null,
          sentAt: result.success ? new Date() : null,
          storeId,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Booking",
          targetId: booking.id,
          action: "SEND_LINE_TEST_REMINDER",
          afterJson: {
            lineRoute: actualRoute,
            success: result.success,
          },
        },
      }),
    ]);

    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/bookings");

    if (!result.success) {
      throw new AppError("BUSINESS_RULE", result.error ?? "LINE 測試提醒發送失敗");
    }
    return {
      success: true,
      data: { messageLogId: log.id, lineRoute: actualRoute },
    };
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
