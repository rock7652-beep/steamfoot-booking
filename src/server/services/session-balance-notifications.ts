import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
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

  const wallets = await tx.customerPlanWallet.findMany({
    where: {
      id: { in: walletIds },
      customerId: input.customerId,
      storeId: input.storeId,
    },
    select: { id: true, remainingSessions: true },
  });
  const activeContinuationWallets = await tx.customerPlanWallet.findMany({
    where: {
      customerId: input.customerId,
      storeId: input.storeId,
      status: "ACTIVE",
      remainingSessions: { gt: 0 },
    },
    select: { id: true },
  });
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
    return decision.type
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
}): { body: string; messages: LineMessage[] } {
  if (input.type === "LAST_SESSION") {
    const body = input.reservedBooking
      ? `${input.customerName} 您好，溫馨提醒，您的「${input.planName}」目前剩下最後 1 堂，已安排於 ${input.reservedBooking.bookingDate.toISOString().slice(0, 10)} ${input.reservedBooking.slotTime}。\n\n若您希望之後持續保養，也可以在到店時和我們聊聊下一階段怎麼安排，完全依照您的需求決定就好。`
      : `${input.customerName} 您好，您的「${input.planName}」目前剩下最後 1 堂囉 🌿\n\n如果最近有想安排放鬆保養，歡迎提前選擇適合的時間。不著急，依照自己的步調安排就可以了。\n\n查看可預約時段：${deriveBaseUrl()}/s/${input.storeSlug}/liff/member-booking`;
    return { body, messages: [{ type: "text", text: body }] };
  }

  const body = `${input.customerName} 您好，謝謝您完成這一期的「${input.planName}」蒸足保養 🤎\n\n如果覺得這段時間對身體有幫助，歡迎再依照自己的狀態，安排下一階段的保養頻率。\n\n還不確定也沒關係，我們可以先陪您了解目前的需求，再決定是否繼續。`;
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
              label: "了解適合我的方案",
              text: "我想了解適合我的方案",
            },
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "之後再看看",
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
          store: { select: { slug: true } },
        },
      });
      if (!notification) continue;

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
