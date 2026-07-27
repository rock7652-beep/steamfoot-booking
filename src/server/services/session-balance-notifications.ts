import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";
import {
  pushMessage,
  pushSteamButlerMessage,
  type LineMessage,
} from "@/lib/line";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { decideSessionBalanceNotification } from "@/server/services/session-balance-notification-policy";
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

  const [wallets, activeContinuationWallets, setting] = await Promise.all([
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
      },
      select: { id: true },
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
  const activeContinuationIds = new Set(
    activeContinuationWallets.map((wallet) => wallet.id),
  );

  const candidates = wallets.flatMap((wallet) => {
    const decision = decideSessionBalanceNotification({
      remainingSessions: wallet.remainingSessions,
      hasContinuationPlan: [...activeContinuationIds].some(
        (walletId) => walletId !== wallet.id,
      ),
    });
    const typeEnabled =
      decision.type === "LAST_SESSION"
        ? effectiveSetting.lastSessionEnabled
        : decision.type === "PLAN_USED_UP"
          ? effectiveSetting.planUsedUpEnabled
          : false;
    return decision.type && typeEnabled
      ? [{
          storeId: input.storeId,
          customerId: input.customerId,
          walletId: wallet.id,
          type: decision.type,
        }]
      : [];
  });
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

function buildMessages(input: {
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
    const body = renderSessionBalanceTemplate(template, variables);
    return { body, messages: [{ type: "text", text: body }] };
  }

  const body = renderSessionBalanceTemplate(
    input.setting.planUsedUpTemplate,
    variables,
  );
  return {
    body,
    messages: [{
      type: "text",
      text: body,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: input.setting.learnMoreButtonLabel,
              text: "了解蒸足 VIP 方案",
            },
          },
          {
            type: "action",
            action: {
              type: "message",
              label: input.setting.laterButtonLabel,
              text: "之後再看看",
            },
          },
        ],
      },
    }],
  };
}

export const SESSION_BALANCE_VIP_COMMAND = "了解蒸足 VIP 方案";
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
    input.text === SESSION_BALANCE_VIP_COMMAND
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
  const staff = await prisma.staff.findMany({
    where: {
      storeId: input.storeId,
      status: "ACTIVE",
      ...(input.assignedStaffId
        ? { OR: [{ id: input.assignedStaffId }, { isOwner: true }] }
        : { isOwner: true }),
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      user: {
        select: {
          accounts: {
            where: { provider: "line" },
            select: { providerAccountId: true },
          },
        },
      },
    },
  });
  const managerLineIds = [
    ...new Set(
      staff
        .sort((a, b) =>
          a.id === input.assignedStaffId
            ? -1
            : b.id === input.assignedStaffId
              ? 1
              : 0,
        )
        .flatMap((item) =>
          item.user.accounts.map((account) => account.providerAccountId.trim()),
        ),
    ),
  ].filter(Boolean);
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

  let sent = false;
  let lastError = managerLineIds.length === 0 ? "店長尚未綁定可接收通知的 LINE" : null;
  for (const managerLineId of managerLineIds) {
    const result = await pushMessage(input.storeId, managerLineId, [managerMessage]);
    if (result.success) {
      sent = true;
      lastError = null;
      break;
    }
    lastError = result.error ?? "LINE 店長通知失敗";
  }
  await prisma.sessionBalanceNotification.update({
    where: { id: input.notificationId },
    data: {
      managerNotificationStatus: sent ? "SENT" : "FAILED",
      managerNotificationError: lastError,
      managerNotifiedAt: sent ? new Date() : null,
    },
  });
}

export async function dispatchSessionBalanceNotifications(
  notificationIds: string[],
): Promise<void> {
  for (const id of [...new Set(notificationIds)]) {
    try {
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

      const setting =
        notification.store.sessionBalanceNotificationSetting ??
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING;
      const typeEnabled =
        notification.type === "LAST_SESSION"
          ? setting.lastSessionEnabled
          : setting.planUsedUpEnabled;
      if (!setting.isEnabled || !typeEnabled) {
        await prisma.sessionBalanceNotification.update({
          where: { id },
          data: {
            status: "SKIPPED",
            errorMessage: "該分店已停用此類提醒",
          },
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
      const content = buildMessages({
        type: notification.type,
        customerName: notification.customer.name,
        planName: notification.wallet.plan.name,
        storeSlug: notification.store.slug,
        reservedBooking: notification.wallet.sessions[0]?.booking ?? null,
        setting,
      });

      if (route.status === "BLOCKED") {
        await prisma.sessionBalanceNotification.update({
          where: { id },
          data: {
            status: "SKIPPED",
            renderedBody: content.body,
            errorMessage: route.reason,
          },
        });
        continue;
      }

      const result = route.channel === "STORE"
        ? await pushMessage(
            notification.storeId,
            route.recipientLineUserId,
            content.messages,
          )
        : await pushSteamButlerMessage(
            route.recipientLineUserId,
            content.messages,
          );
      await prisma.sessionBalanceNotification.update({
        where: { id },
        data: {
          status: result.success ? "SENT" : "FAILED",
          renderedBody: content.body,
          errorMessage: result.error ?? null,
          sentAt: result.success ? new Date() : null,
        },
      });
    } catch (error) {
      console.error("[SessionBalanceNotification] dispatch failed", {
        notificationId: id,
        error,
      });
    }
  }
}
