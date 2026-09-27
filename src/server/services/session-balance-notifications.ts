import { deliverManagerNotification } from "./manager-notification-delivery";
import { createHash } from "node:crypto";
import { LINE_CARD_COLORS, LINE_CARD_STYLES } from "@/lib/line-card-theme";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  extractSessionBalanceCustomCopy,
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";
import {
  pushMessage,
  pushSteamButlerMessage,
  type LineMessage,
} from "@/lib/line";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { todayRange } from "@/lib/date-utils";
import {
  decideCustomerSessionBalanceNotification,
  shouldDispatchCustomerSessionBalanceNotification,
} from "@/server/services/session-balance-notification-policy";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";

type Tx = Prisma.TransactionClient;

export async function enqueueSessionBalanceNotifications(
  tx: Tx,
  input: {
    walletIds: string[];
    customerId: string;
    storeId: string;
  },
): Promise<string[]> {
  const walletIds = [...new Set(input.walletIds)];
  if (walletIds.length === 0) return [];

  const { start: todayStart } = todayRange();
  const [wallets, validWallets, setting] = await Promise.all([
    tx.customerPlanWallet.findMany({
      where: {
        id: { in: walletIds },
        customerId: input.customerId,
        storeId: input.storeId,
      },
      select: { id: true, remainingSessions: true },
    }),
    tx.customerPlanWallet.findMany({
      where: {
        customerId: input.customerId,
        storeId: input.storeId,
        status: "ACTIVE",
        remainingSessions: { gt: 0 },
        plan: { category: "PACKAGE" },
        OR: [{ expiryDate: null }, { expiryDate: { gte: todayStart } }],
      },
      select: { id: true, remainingSessions: true },
    }),
    tx.sessionBalanceNotificationSetting.findUnique({
      where: { storeId: input.storeId },
      select: {
        isEnabled: true,
        lastSessionEnabled: true,
        planUsedUpEnabled: true,
      },
    }),
  ]);
  const effectiveSetting = setting ?? DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING;
  if (!effectiveSetting.isEnabled) return [];
  const totalRemainingSessions = validWallets.reduce(
    (sum, wallet) => sum + wallet.remainingSessions,
    0,
  );
  const decision = decideCustomerSessionBalanceNotification({ totalRemainingSessions });
  const typeEnabled =
    decision.type === "LAST_SESSION"
      ? effectiveSetting.lastSessionEnabled
      : decision.type === "PLAN_USED_UP"
        ? effectiveSetting.planUsedUpEnabled
        : false;
  const notificationWallet = decision.type === "LAST_SESSION"
    ? validWallets.find((wallet) => wallet.remainingSessions === 1)
    : wallets.find((wallet) => wallet.remainingSessions === 0);
  const candidates = decision.type && typeEnabled && notificationWallet
    ? [{
        storeId: input.storeId,
        customerId: input.customerId,
        walletId: notificationWallet.id,
        type: decision.type,
        deliveryVersion: 1,
        nextAttemptAt: new Date(),
        retryUntil: new Date(Date.now() + 23 * 60 * 60 * 1000),
      }]
    : [];
  if (candidates.length === 0) return [];

  await tx.sessionBalanceNotification.createMany({
    data: candidates,
    skipDuplicates: true,
  });

  const pending = await tx.sessionBalanceNotification.findMany({
    where: {
      walletId: { in: candidates.map((candidate) => candidate.walletId) },
      type: { in: candidates.map((candidate) => candidate.type) },
      status: "PENDING",
    },
    select: { id: true },
  });
  return pending.map((notification) => notification.id);
}

const SESSION_BALANCE_CARD_COLORS = LINE_CARD_COLORS;

export function buildSessionBalanceLineMessages(input: {
  type: "LAST_SESSION" | "PLAN_USED_UP";
  customerName: string;
  planName: string;
  storeSlug: string;
  reservedBooking: { bookingDate: Date; slotTime: string } | null;
  setting: SessionBalanceNotificationSettingValue;
}): { body: string; messages: LineMessage[] } {
  const variables = {
    customerName: input.customerName,
    planName: input.planName,
    bookingDateTime: input.reservedBooking
      ? `${input.reservedBooking.bookingDate.toISOString().slice(0, 10)} ${input.reservedBooking.slotTime}`
      : "",
    bookingUrl: `${deriveBaseUrl()}/s/${input.storeSlug}/liff/member-booking`,
  };
  if (input.type === "LAST_SESSION") {
    const template = input.reservedBooking
      ? input.setting.lastSessionBookedTemplate
      : input.setting.lastSessionUnbookedTemplate;
    const body = renderSessionBalanceTemplate(
      extractSessionBalanceCustomCopy(template),
      variables,
    );
    return {
      body,
      messages: [{
        type: "flex",
        altText: `${input.customerName} 您好，您的「${input.planName}」剩下最後 1 堂。`,
        contents: {
          type: "bubble",
      styles: LINE_CARD_STYLES,
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: SESSION_BALANCE_CARD_COLORS.headerBackground,
            paddingAll: "16px",
            contents: [
              { type: "text", text: "蒸管家｜堂數提醒", color: SESSION_BALANCE_CARD_COLORS.headerText, weight: "bold", size: "lg", wrap: true },
              { type: "text", text: "方案剩餘最後 1 堂", color: SESSION_BALANCE_CARD_COLORS.headerSubtext, size: "sm", margin: "sm" },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              { type: "text", text: `${input.customerName} 您好`, color: LINE_CARD_COLORS.primary, wrap: true, weight: "bold", size: "lg" },
              { type: "separator" },
              { type: "text", text: "方案名稱", color: LINE_CARD_COLORS.label, size: "sm" },
              { type: "text", text: input.planName, color: LINE_CARD_COLORS.text, size: "md", weight: "bold", wrap: true },
              ...(input.reservedBooking
                ? [
                    { type: "text" as const, text: "已預約時間", color: LINE_CARD_COLORS.label, size: "sm" as const },
                    { type: "text" as const, text: variables.bookingDateTime, color: LINE_CARD_COLORS.text, size: "md" as const, wrap: true },
                  ]
                : []),
              { type: "separator" },
              { type: "text", text: body, color: LINE_CARD_COLORS.text, size: "sm", wrap: true },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              ...(!input.reservedBooking
                ? [{
                    type: "button" as const,
                    style: "primary" as const,
                    color: SESSION_BALANCE_CARD_COLORS.primary,
                    action: { type: "uri" as const, label: "立即預約", uri: variables.bookingUrl },
                  }]
                : []),
              {
                type: "button",
                style: "link",
                color: SESSION_BALANCE_CARD_COLORS.secondary,
                action: { type: "message", label: "諮詢店長", text: SESSION_BALANCE_VIP_COMMAND },
              },
            ],
          },
        },
      }],
    };
  }

  const body = renderSessionBalanceTemplate(
    extractSessionBalanceCustomCopy(input.setting.planUsedUpTemplate),
    variables,
  );
  const topUpButtonLabel = input.setting.learnMoreButtonLabel === "了解蒸足 VIP 方案"
    ? "我要儲值"
    : input.setting.learnMoreButtonLabel;
  return {
    body,
    messages: [{
      type: "flex",
      altText: `${input.customerName} 您好，您的「${input.planName}」方案已使用完畢。`,
      contents: {
        type: "bubble",
      styles: LINE_CARD_STYLES,
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: SESSION_BALANCE_CARD_COLORS.headerBackground,
          paddingAll: "16px",
          contents: [
            { type: "text", text: "蒸管家｜方案提醒", color: SESSION_BALANCE_CARD_COLORS.headerText, weight: "bold", size: "lg", wrap: true },
            { type: "text", text: "本期方案已完成", color: SESSION_BALANCE_CARD_COLORS.headerSubtext, size: "sm", margin: "sm" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: `${input.customerName} 您好`, color: LINE_CARD_COLORS.primary, wrap: true, weight: "bold", size: "lg" },
            { type: "separator" },
            { type: "text", text: "已完成方案", color: LINE_CARD_COLORS.label, size: "sm" },
            { type: "text", text: input.planName, color: LINE_CARD_COLORS.text, size: "md", weight: "bold", wrap: true },
            { type: "separator" },
            { type: "text", text: body, color: LINE_CARD_COLORS.text, size: "sm", wrap: true },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
          {
            type: "button",
            style: "primary",
            color: SESSION_BALANCE_CARD_COLORS.primary,
            action: { type: "message", label: topUpButtonLabel, text: SESSION_BALANCE_TOP_UP_COMMAND },
          },
          {
            type: "button",
            style: "link",
            color: SESSION_BALANCE_CARD_COLORS.secondary,
            action: { type: "message", label: "諮詢店長", text: SESSION_BALANCE_VIP_COMMAND },
          },
          ],
        },
      },
    }],
  };
}

export const SESSION_BALANCE_VIP_COMMAND = "了解蒸足 VIP 方案";
export const SESSION_BALANCE_TOP_UP_COMMAND = "我要儲值";
export const SESSION_BALANCE_LATER_COMMAND = "之後再看看";

export type SessionBalanceResponseResult =
  | { handled: false }
  | {
      handled: true;
      response: "VIP_INTEREST" | "LATER";
      customerReply: string;
    };

export async function handleSessionBalanceLineResponse(input: {
  storeId: string;
  lineUserId: string;
  text: string;
}): Promise<SessionBalanceResponseResult> {
  const response =
    input.text === SESSION_BALANCE_VIP_COMMAND || input.text === SESSION_BALANCE_TOP_UP_COMMAND
      ? "VIP_INTEREST"
      : input.text === SESSION_BALANCE_LATER_COMMAND
        ? "LATER"
        : null;
  if (!response) return { handled: false };

  const notification = await prisma.sessionBalanceNotification.findFirst({
    where: {
      storeId: input.storeId,
      type: "PLAN_USED_UP",
      status: "SENT",
      customer: {
        lineUserId: input.lineUserId,
        lineLinkStatus: "LINKED",
        mergedIntoCustomerId: null,
      },
    },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      responseAction: true,
      customerId: true,
      customer: {
        select: {
          name: true,
          phone: true,
          assignedStaffId: true,
        },
      },
      wallet: { select: { plan: { select: { name: true } } } },
      store: { select: { name: true } },
    },
  });
  if (!notification) return { handled: false };

  const recordedAt = new Date();
  const mayRecord =
    !notification.responseAction ||
    (notification.responseAction === "LATER" && response === "VIP_INTEREST");
  if (mayRecord) {
    const recorded = await prisma.sessionBalanceNotification.updateMany({
      where: {
        id: notification.id,
        storeId: input.storeId,
        responseAction: notification.responseAction,
      },
      data: { responseAction: response, responseAt: recordedAt },
    });
    if (recorded.count === 1 && response === "VIP_INTEREST") {
      await notifyManagerOfVipInterest({
        notificationId: notification.id,
        storeId: input.storeId,
        customerId: notification.customerId,
        customerName: notification.customer.name,
        customerPhone: notification.customer.phone,
        assignedStaffId: notification.customer.assignedStaffId,
        planName: notification.wallet.plan.name,
        storeName: notification.store.name,
      });
    }
  }

  return {
    handled: true,
    response,
    customerReply:
      response === "VIP_INTEREST"
        ? "收到囉 😊\n\n已經幫您通知店長，店長會親自為您說明「蒸足 VIP 方案」的內容與續購優惠，了解後再決定就可以了。"
        : "好的，沒問題 😊\n\n您可以依照自己的步調安排，不需要有壓力。\n\n之後想繼續保養，或想了解「蒸足 VIP 方案」，隨時傳訊息給我們就可以了。",
  };
}

async function notifyManagerOfVipInterest(input: {
  notificationId: string;
  storeId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  assignedStaffId: string | null;
  planName: string;
  storeName: string;
}) {
  const managerMessage: LineMessage = {
    type: "text",
    text: [
      "【蒸足 VIP 續購需求】",
      `分店：${input.storeName}`,
      `顧客：${input.customerName}`,
      `電話：${input.customerPhone}`,
      `原方案：${input.planName}`,
      "",
      "顧客已點選「了解蒸足 VIP 方案」，請主動聯絡並說明續購優惠。",
      `${deriveBaseUrl()}/dashboard/customers/${input.customerId}`,
    ].join("\n"),
  };

  const delivery = await deliverManagerNotification({ storeId: input.storeId,
    eventKey: `vip-interest:${input.notificationId}`, type: "VIP_INTEREST", messages: [managerMessage], assignedStaffId: input.assignedStaffId });
  const sent = delivery.status === "sent";
  const lastError = delivery.status === "failed" ? delivery.error : delivery.status === "skipped" ? "通知已關閉或尚未綁定" : null;
  await prisma.sessionBalanceNotification.update({
    where: { id: input.notificationId },
    data: {
      managerNotificationStatus: sent ? "SENT" : delivery.status === "skipped" ? "SKIPPED" : "FAILED",
      managerNotificationError: sent ? null : lastError,
      managerNotifiedAt: sent ? new Date() : null,
    },
  });
}

export async function dispatchSessionBalanceNotifications(
  notificationIds: string[],
): Promise<void> {
  // Preview must never dispatch customer messages, even if it shares DB access.
  if (process.env.VERCEL_ENV === "preview") return;
  for (const id of [...new Set(notificationIds)]) {
    let leaseUntil: Date | null = null;
    const writeDelivery = async (data: Prisma.SessionBalanceNotificationUpdateManyMutationInput) => {
      if (!leaseUntil) {
        await prisma.sessionBalanceNotification.update({ where: { id }, data });
        return;
      }
      const written = await prisma.sessionBalanceNotification.updateMany({
        where: { id, leaseUntil, status: "PENDING" }, data,
      });
      if (written.count !== 1) throw new Error("Notification delivery lease lost");
    };
    try {
      const delivery = await prisma.sessionBalanceNotification.findUnique({ where: { id } });
      if (!delivery || !["PENDING", "FAILED"].includes(delivery.status)) continue;
      if (delivery.deliveryVersion === 1) {
        const now = new Date();
        if (!delivery.retryUntil || delivery.retryUntil <= now || delivery.deliveryAttempts >= 5) continue;
        leaseUntil = new Date(now.getTime() + 10 * 60_000);
        const claim = await prisma.sessionBalanceNotification.updateMany({
          where: {
            id, deliveryVersion: 1, status: { in: ["PENDING", "FAILED"] },
            deliveryAttempts: delivery.deliveryAttempts,
            retryUntil: { gt: now }, nextAttemptAt: { lte: now },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: { leaseUntil, deliveryAttempts: { increment: 1 }, status: "PENDING" },
        });
        if (!claim.count) { leaseUntil = null; continue; }
      } else if (delivery.status !== "PENDING") continue;
      const notification = await prisma.sessionBalanceNotification.findFirst({
        where: { id, status: "PENDING" },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              lineUserId: true,
              lineLinkStatus: true,
            },
          },
          wallet: {
            select: {
              plan: { select: { name: true } },
              sessions: {
                where: { status: "RESERVED" },
                take: 1,
                select: {
                  booking: {
                    select: { bookingDate: true, slotTime: true },
                  },
                },
              },
            },
          },
          store: {
            select: {
              slug: true,
              sessionBalanceNotificationSetting: {
                select: {
                  isEnabled: true,
                  lastSessionEnabled: true,
                  planUsedUpEnabled: true,
                  lastSessionUnbookedTemplate: true,
                  lastSessionBookedTemplate: true,
                  planUsedUpTemplate: true,
                  learnMoreButtonLabel: true,
                  laterButtonLabel: true,
                },
              },
            },
          },
        },
      });
      if (!notification) continue;

      const { start: todayStart } = todayRange();
      const validWallets = await prisma.customerPlanWallet.findMany({
        where: {
          customerId: notification.customerId,
          storeId: notification.storeId,
          status: "ACTIVE",
          remainingSessions: { gt: 0 },
          plan: { category: "PACKAGE" },
          OR: [{ expiryDate: null }, { expiryDate: { gte: todayStart } }],
        },
        select: { id: true, remainingSessions: true },
      });
      if (!shouldDispatchCustomerSessionBalanceNotification({
        type: notification.type,
        notificationWalletId: notification.walletId,
        validWallets,
      })) {
        await writeDelivery({
            status: "SKIPPED",
            errorMessage: "顧客有效方案總堂數已變更，未發送續購提醒",
        });
        continue;
      }

      const setting =
        notification.store.sessionBalanceNotificationSetting ??
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING;
      const typeEnabled =
        notification.type === "LAST_SESSION"
          ? setting.lastSessionEnabled
          : setting.planUsedUpEnabled;
      if (!setting.isEnabled || !typeEnabled) {
        await writeDelivery({
            status: "SKIPPED",
            errorMessage: "該分店已停用此類提醒",
        });
        continue;
      }

      const centralRecipient = await resolveCentralLineRecipientForCustomer(
        notification.customerId,
        notification.storeId,
      );
      const route = await resolveVerifiedReminderLineRoute(
        notification.storeId,
        notification.customer.lineLinkStatus === "LINKED"
          ? notification.customer.lineUserId
          : null,
        centralRecipient,
      );
      let content = buildSessionBalanceLineMessages({
        type: notification.type,
        customerName: notification.customer.name,
        planName: notification.wallet.plan.name,
        storeSlug: notification.store.slug,
        reservedBooking: notification.wallet.sessions[0]?.booking ?? null,
        setting,
      });

      if (route.status === "BLOCKED") {
        await writeDelivery({
            status: "SKIPPED",
            renderedBody: content.body,
            errorMessage: route.reason,
        });
        continue;
      }

      // Freeze route + content before the first external call. A retry must not
      // send a different message or switch LINE channels with the same key.
      if (delivery.deliveryVersion === 1) {
        const snapshot = notification.deliverySnapshot as {
          channel: string; recipient: string; body: string; messages: LineMessage[];
        } | null;
        if (snapshot) {
          if (snapshot.channel !== route.channel || snapshot.recipient !== route.recipientLineUserId) {
            await writeDelivery({
              status: "SKIPPED", errorMessage: "通知收件路徑已變更，停止自動補送",
            });
            continue;
          }
          content = { ...content, body: snapshot.body, messages: snapshot.messages };
        } else {
          await writeDelivery({
            deliverySnapshot: {
              channel: route.channel, recipient: route.recipientLineUserId,
              body: content.body, messages: content.messages,
            } as unknown as Prisma.InputJsonValue,
          });
        }
      }
      const hash = createHash("sha256").update(`session-balance:${id}`).digest("hex");
      const retryKey = delivery.deliveryVersion === 1
        ? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
        : undefined;

      if (leaseUntil) {
        // Recheck ownership and deadline immediately before the external call.
        const owned = await prisma.sessionBalanceNotification.findFirst({
          where: { id, leaseUntil, status: "PENDING", retryUntil: { gt: new Date() } },
          select: { id: true },
        });
        if (!owned || leaseUntil <= new Date()) continue;
      }

      const result = route.channel === "STORE"
        ? await pushMessage(
            notification.storeId,
            route.recipientLineUserId,
            content.messages,
            retryKey,
          )
        : await pushSteamButlerMessage(
            route.recipientLineUserId,
            content.messages,
            retryKey,
          );
      await writeDelivery({
          status: result.success ? "SENT" : "FAILED",
          renderedBody: content.body,
          errorMessage: result.error ?? null,
          sentAt: result.success ? new Date() : null,
          ...(delivery.deliveryVersion === 1 ? {
            nextAttemptAt: new Date(Date.now() + 5 * 60_000),
          } : {}),
      });
    } catch (error) {
      console.error("[SessionBalanceNotification] dispatch failed", {
        notificationId: id,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      if (leaseUntil) await prisma.sessionBalanceNotification.updateMany({
        where: { id, leaseUntil, status: "PENDING" },
        data: { status: "FAILED", errorMessage: "派送暫時失敗，等待重試", nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
      }).catch(() => undefined);
    } finally {
      if (leaseUntil) await prisma.sessionBalanceNotification.updateMany({
        where: { id, leaseUntil }, data: { leaseUntil: null },
      }).catch(() => undefined);
    }
  }
}

/** Bounded recovery; never replay legacy records or push outside the retry window. */
export async function retrySessionBalanceNotifications() {
  const now = new Date();
  await prisma.sessionBalanceNotification.updateMany({
    where: {
      deliveryVersion: 1, status: "PENDING", store: { industryModule: "STEAMFOOT" },
      AND: [
        { OR: [{ retryUntil: { lte: now } }, { deliveryAttempts: { gte: 5 } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      ],
    },
    data: { status: "FAILED", errorMessage: "自動補送已達上限或期限，請人工確認", leaseUntil: null },
  });
  const pending = await prisma.sessionBalanceNotification.findMany({
    where: {
      deliveryVersion: 1, status: { in: ["PENDING", "FAILED"] },
      deliveryAttempts: { lt: 5 }, retryUntil: { gt: now }, nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      store: { industryModule: "STEAMFOOT" },
    },
    orderBy: { nextAttemptAt: "asc" }, take: 5, select: { id: true },
  });
  await dispatchSessionBalanceNotifications(pending.map(({ id }) => id));
  return { processed: pending.length };
}
