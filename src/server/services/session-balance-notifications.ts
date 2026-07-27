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
              text: "我想了解適合我的方案",
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
