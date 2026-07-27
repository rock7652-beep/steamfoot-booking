// ============================================================
// LINE Webhook — 完整事件處理（B7-4.5: store-aware）
//
// ⚠️ 規則：
//   1. 使用原生 Response，不使用 NextResponse（避免 307）
//   2. POST 最後一定 return 200
//   3. 所有錯誤在 try-catch 內處理，不外拋
//   4. 品牌 Channel 先以自身簽章識別；其餘 webhook 才 resolve store
// ============================================================

import {
  verifyLineSignature,
  verifySteamButlerLineSignature,
  replyMessage,
  replySteamButlerMessage,
  probeStoreLineRecipient,
} from "@/lib/line";
import {
  getLineWebhookDiagnosticsForStore,
  isSteamButlerLineDestination,
} from "@/lib/line-config";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { bindLineToCustomerInStore } from "@/server/services/bind-line-to-customer";
import {
  captureLineRebindCandidate,
  lineWebhookEventKey,
} from "@/server/services/line-rebind";
import { syncLineAccountForUser } from "@/server/services/line-account-sync";
import { upsertCustomerIdentityLink } from "@/server/services/customer-identity-link";
import {
  logLineBindEvent,
  maskLineUserId,
  type AccountSyncStatus,
} from "@/lib/line-bind-log";
import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";
import {
  digitalButlerReplyDiagnostics,
  sanitizeDigitalButlerReplyMessages,
} from "@/server/services/digital-butler-line-reply";
import { digitalButlerIntentsToLineMessages } from "@/server/services/digital-butler-channel";
import { handleSessionBalanceLineResponse } from "@/server/services/session-balance-notifications";

export const dynamic = "force-dynamic";

// ── POST: 處理 LINE events ──

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-line-signature");

    console.log("[LINE Webhook] POST hit", {
      bodyLength: body.length,
      hasSignature: !!signature,
    });

    const data = JSON.parse(body);
    const events: LineWebhookEvent[] = data.events ?? [];

    const destination: string | undefined = data.destination;

    // 品牌 Channel 的身分由其簽章證明，不能依賴人工設定的 destination。
    // 只有品牌簽章驗證失敗時，才回到既有 Store destination 解析流程。
    if (signature && verifySteamButlerLineSignature(body, signature)) {
      logBrandLineEvent("brand_line_signature_valid");
      if (isSteamButlerLineDestination(destination)) {
        logBrandLineEvent("brand_line_destination_matched");
      } else {
        logBrandLineEvent("brand_line_destination_mismatch", {
          destination: maskLineUserId(destination),
        });
      }

      for (const event of events) {
        try {
          await handleSteamButlerEvent(event);
        } catch {
          console.error("[Brand LINE] Event handler error");
        }
      }

      return new Response("OK", { status: 200 });
    }

    const storeId = await resolveStoreFromDestination(destination);

    if (!storeId) {
      console.warn("[LINE Webhook] Cannot resolve store — aborting", { destination: maskLineUserId(destination) });
      return new Response("OK", { status: 200 });
    }

    console.log("[LINE Webhook] Resolved store", { destination: maskLineUserId(destination), storeId });

    // 簽章驗證必須使用該 store 的 LINE channel secret；缺 secret 也視為驗證失敗。
    const lineDiagnostics = getLineWebhookDiagnosticsForStore(storeId);
    console.log("[LINE Webhook] Signature config diagnostics", {
      storeId,
      destination: maskLineUserId(destination),
      resolvedLineStoreSlug: lineDiagnostics.storeSlug,
      envName: lineDiagnostics.secretEnvName,
      hasSecret: lineDiagnostics.hasSecret,
      secretLength: lineDiagnostics.secretLength,
      hasAccessToken: lineDiagnostics.hasAccessToken,
    });
    if (!signature || !verifyLineSignature(storeId, body, signature)) {
      console.warn("[LINE Webhook] Invalid signature", { storeId, hasSignature: !!signature });
      return new Response("Invalid signature", { status: 401 });
    }

    for (const event of events) {
      try {
        await handleLineEvent(event, storeId, destination);
      } catch (err) {
        console.error("[LINE Webhook] Event handler error:", err);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[LINE Webhook] Fatal error:", err);
    // 即使出錯也回 200，避免 LINE 重試轟炸
    return new Response("OK", { status: 200 });
  }
}

async function handleSteamButlerEvent(event: LineWebhookEvent) {
  if (event.type !== "message" || event.message?.type !== "text") {
    return;
  }

  const text = event.message.text ?? "";
  logBrandLineEvent("brand_line_text_received", { textLength: text.length });

  if (text !== "找到適合方案") {
    logBrandLineEvent("brand_line_command_ignored");
    return;
  }

  logBrandLineEvent("brand_line_command_matched", { command: "show_plan" });
  if (!event.replyToken) return;

  logBrandLineEvent("brand_line_reply_attempted");
  const result = await replySteamButlerMessage(event.replyToken, [PLAN_RECOMMENDATION_MESSAGE]);
  if (result.success) {
    logBrandLineEvent("brand_line_reply_success");
  } else {
    logBrandLineEvent("brand_line_reply_failed", {
      httpStatus: result.httpStatus,
      errorType: result.errorType,
    });
  }
}

function logBrandLineEvent(
  event: string,
  fields: Record<string, string | number | null> = {},
) {
  console.log(JSON.stringify({ event, ...fields }));
}

// ── GET: Verify 用 ──

export async function GET() {
  return new Response("OK", { status: 200 });
}

// ============================================================
// Store resolution — 從 LINE webhook destination 解析 store
// ============================================================

/**
 * 從 LINE webhook payload 的 destination 解析 storeId。
 * destination 是 LINE Official Account 的 bot userId，每個 OA 唯一。
 *
 * 解析順序：
 * 1. 查 DB: Store.lineDestination
 * 2. 失敗 → return null（caller 負責安全中止）
 *
 * 不可 fallback 到 DEFAULT_STORE_ID。
 */
async function resolveStoreFromDestination(
  destination: string | undefined
): Promise<string | null> {
  if (!destination) {
    console.warn("[LINE Webhook] No destination in payload");
    return null;
  }

  const store = await prisma.store.findFirst({
    where: { lineDestination: destination },
    select: { id: true },
  });

  if (!store) {
    console.warn("[LINE Webhook] No store found for destination:", maskLineUserId(destination));
    return null;
  }

  return store.id;
}

// ============================================================
// Event dispatcher
// ============================================================

async function handleLineEvent(event: LineWebhookEvent, storeId: string, destination?: string) {
  const lineUserId = event.source?.userId;
  console.log("[LINE] Event:", {
    type: event.type,
    userId: maskLineUserId(lineUserId),
    storeId,
    hasReplyToken: !!event.replyToken,
    messageType: event.message?.type,
    hasMessageText: Boolean(event.message?.text),
  });
  if (!lineUserId) return;

  switch (event.type) {
    case "follow":
      await handleFollow(lineUserId, storeId, event.replyToken);
      break;

    case "unfollow":
      await handleUnfollow(lineUserId, storeId);
      break;

    case "message":
      if (event.message?.type === "text" && event.message.text) {
        await handleTextMessage(
          lineUserId,
          event.message.text.trim(),
          storeId,
          event.replyToken,
          {
            webhookEventId: event.webhookEventId,
            destination,
            sourceUserId: lineUserId,
            timestamp: event.timestamp,
            messageId: event.message.id,
          },
        );
      }
      break;
  }
}

// ============================================================
// follow — 新好友加入 / 封鎖後重新加入
// ============================================================

async function handleFollow(lineUserId: string, storeId: string, replyToken?: string) {
  console.log(`[LINE] Follow received`, { userId: maskLineUserId(lineUserId), storeId });

  // 若之前被封鎖，自動恢復綁定（限同店）
  const blocked = await prisma.customer.findFirst({
    where: { lineUserId, storeId, lineLinkStatus: "BLOCKED" },
  });

  if (blocked) {
    await prisma.customer.update({
      where: { id: blocked.id },
      data: { lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
    });
    console.log(`[LINE] Re-linked blocked customer: ${blocked.name} (${blocked.id})`);

    // 🆕 若此 customer 曾有 sponsor → 邀請者 +1（sourceKey dedupe：僅首次生效）
    try {
      const { awardLineJoinReferrerIfEligible } = await import(
        "@/server/services/referral-points"
      );
      await awardLineJoinReferrerIfEligible({
        customerId: blocked.id,
        storeId: blocked.storeId,
      });
    } catch {
      // 發點失敗不影響 re-link 流程
    }
  }

  // 回覆歡迎訊息
  if (replyToken) {
    const result = await replyMessage(storeId, replyToken, [
      {
        type: "text",
        text: [
          "歡迎加入蒸足官方帳號！",
          "",
          "如需開啟預約提醒與方案通知，請直接輸入您的手機號碼完成系統通知綁定。",
          "",
          "例如：0912345678",
          "",
          "系統會依照店舖與手機號碼對應到店長建立的顧客資料。",
        ].join("\n"),
      },
    ]);
    console.log("[LINE] Follow reply result:", result);
  }
}

// ============================================================
// unfollow — 封鎖 / 取消好友
// ============================================================

async function handleUnfollow(lineUserId: string, storeId: string) {
  console.log(`[LINE] Unfollow received`, { userId: maskLineUserId(lineUserId), storeId });

  // B7-4.5: 只更新同店的 customer
  const result = await prisma.customer.updateMany({
    where: { lineUserId, storeId },
    data: { lineLinkStatus: "BLOCKED" },
  });

  console.log(`[LINE] Marked ${result.count} customer(s) as BLOCKED (store: ${storeId})`);
}

// ============================================================
// message — 文字訊息處理
// ============================================================

async function handleTextMessage(
  lineUserId: string,
  text: string,
  storeId: string,
  replyToken?: string,
  eventIdentity?: Parameters<typeof lineWebhookEventKey>[0],
) {
  console.log("[LINE] Text message received", { userId: maskLineUserId(lineUserId), storeId, textLength: text.length });

  if (text === "找到適合方案") {
    if (replyToken) {
      await replyMessage(storeId, replyToken, [PLAN_RECOMMENDATION_MESSAGE]);
    }
    return;
  }

  const sessionBalanceResponse = await handleSessionBalanceLineResponse({
    storeId,
    lineUserId,
    text,
  });
  if (sessionBalanceResponse.handled) {
    if (replyToken) {
      await replyMessage(storeId, replyToken, [
        { type: "text", text: sessionBalanceResponse.customerReply },
      ]);
    }
    return;
  }

  // 解析「綁定 XXXXXX」格式（大小寫不敏感）
  const bindMatch = text.match(/^綁定\s*([A-Z0-9]{6})$/i);
  if (bindMatch) {
    await handleBindingRequest(
      lineUserId,
      bindMatch[1].toUpperCase(),
      storeId,
      replyToken
    );
    return;
  }
  const normalizedPhone = normalizePhone(text);
  if (/^09\d{8}$/.test(normalizedPhone)) {
    // A phone number can be both a Digital Butler answer and a notification
    // binding request. Let an active Butler conversation consume and persist
    // the answer first; then perform the binding without spending the LINE
    // reply token, so the single reply can continue the Butler flow.
    const digitalButlerResult = await handleDigitalButlerText(
      lineUserId,
      text,
      storeId,
      eventIdentity,
    );
    if (digitalButlerResult?.handled) {
      if (digitalButlerResult.outcome !== "DUPLICATE") {
        try {
          await handlePhoneBindingRequest(
            lineUserId,
            normalizedPhone,
            storeId,
            undefined,
            eventIdentity,
          );
        } catch {
          // Binding is a compatible side effect. It must never interrupt an
          // already-persisted Digital Butler answer or the next question.
          console.error("[LINE Webhook] Digital Butler phone binding sync failed", { storeId });
        }
      }
      if (replyToken && digitalButlerResult.messages.length > 0) {
        await replyDigitalButlerMessages(storeId, replyToken, digitalButlerResult);
      }
      return;
    }
    await handlePhoneBindingRequest(
      lineUserId,
      normalizedPhone,
      storeId,
      replyToken,
      eventIdentity,
    );
    return;
  }

  // 系統保留指令全部處理完畢後，才允許數位管家接手。執行層本身
  // fail-closed；未啟用、未命中或內部失敗都不改變既有 webhook 行為。
  if (replyToken && eventIdentity?.destination && eventIdentity.messageId) {
    const result = await handleDigitalButlerText(lineUserId, text, storeId, eventIdentity);
    if (result?.handled && result.messages.length > 0) {
      await replyDigitalButlerMessages(storeId, replyToken, result);
    }
  }
}

async function replyDigitalButlerMessages(
  storeId: string,
  replyToken: string,
  result: Awaited<ReturnType<typeof handleDigitalButlerText>>,
) {
  if (!result) return;
  const messages = sanitizeDigitalButlerReplyMessages(
    digitalButlerIntentsToLineMessages(result.messages),
  );
  if (!messages.length) {
    console.error(JSON.stringify({
      event: "digital_butler_reply_skipped",
      storeId,
      outcome: result.outcome,
      reason: "no_sendable_messages",
    }));
    return;
  }
  const diagnostics = digitalButlerReplyDiagnostics(storeId, result.outcome, messages);
  const deliver = async () => {
    const replyResult = await replyMessage(storeId, replyToken, messages);
    const fields = {
      event: "digital_butler_reply",
      ...diagnostics,
      success: replyResult.success,
      httpStatus: replyResult.success ? null : replyResult.httpStatus,
      errorType: replyResult.success ? null : replyResult.errorType,
    };
    if (replyResult.success) {
      console.info(JSON.stringify(fields));
    } else {
      console.error(JSON.stringify(fields));
    }
  };
  if (result.replyGuard?.requiresActiveConversation) {
    await new DigitalButlerRuntime().deliverReplyIfActive(
      storeId,
      result.replyGuard.conversationId,
      deliver,
    );
    return;
  }
  await deliver();
}

async function handleDigitalButlerText(
  lineUserId: string,
  text: string,
  storeId: string,
  eventIdentity?: Parameters<typeof lineWebhookEventKey>[0],
) {
  if (!eventIdentity?.destination || !eventIdentity.messageId) return null;

  try {
    return await new DigitalButlerRuntime().handleText({
      storeId,
      provider: "LINE",
      channelAccountId: eventIdentity.destination,
      senderId: lineUserId,
      text,
      webhookEventId: eventIdentity.webhookEventId,
      messageId: eventIdentity.messageId,
      occurredAt: new Date(eventIdentity.timestamp ?? Date.now()),
    });
  } catch {
    console.error("[Digital Butler] Isolated runtime failure", { storeId });
    return null;
  }
}

const PLAN_RECOMMENDATION_MESSAGE = {
  type: "flex" as const,
  altText: "找到適合你的方案",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "找到適合你的方案",
          weight: "bold",
          size: "xl",
          wrap: true,
        },
        {
          type: "text",
          text: "蒸管家依照店家規模與需求，提供適合的方案。\n另有幫助店家省心、省錢的顧客經營加購功能。\n不確定怎麼選？我們會協助你找到適合的方案。",
          size: "sm",
          color: "#666666",
          wrap: true,
        },
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
          action: {
            type: "uri",
            label: "開始 1 分鐘店務健檢",
            uri: "https://steam-butler-check.vercel.app/",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "找真人管家聊聊",
            text: "我想了解適合我的方案",
          },
        },
      ],
    },
  },
};

async function handlePhoneBindingRequest(
  lineUserId: string,
  phone: string,
  storeId: string,
  replyToken?: string,
  eventIdentity?: Parameters<typeof lineWebhookEventKey>[0],
) {
  let result = await bindLineToCustomerInStore({
    storeId,
    lineUserId,
    lineName: null,
    phone,
    name: "顧客",
    allowCreate: false,
  });

  // Central LINE Login historically wrote its provider-scoped id into the
  // same Customer.lineUserId field used by store notifications. When a
  // verified store webhook supplies the matching phone, replace that stale id
  // only after LINE definitively confirms it is not valid for this store
  // channel. Outages and auth/config errors never authorize a replacement.
  if (result.status === "already_bound_to_other_line") {
    const existing = await prisma.customer.findFirst({
      where: { id: result.customerId, storeId },
      select: { id: true, lineUserId: true, userId: true },
    });
    if (existing?.lineUserId) {
      const compatibility = await probeStoreLineRecipient(storeId, existing.lineUserId);
      if (compatibility.status === "INCOMPATIBLE") {
        // An activated central member already owns the canonical User for this
        // phone. Re-entering the generic binder after clearing lineUserId would
        // try to create a duplicate CUSTOMER User before it can return the
        // phone_taken_by_other_user status. The verified store webhook only
        // needs to replace this store's notification recipient, so perform that
        // CAS directly and leave the central User / Account identities intact.
        if (existing.userId) {
          const rebound = await prisma.customer.updateMany({
            where: {
              id: existing.id,
              storeId,
              phone,
              userId: existing.userId,
              lineUserId: existing.lineUserId,
              mergedIntoCustomerId: null,
            },
            data: {
              lineUserId,
              lineLinkStatus: "LINKED",
              lineLinkedAt: new Date(),
            },
          });
          if (rebound.count === 1) {
            result = {
              status: "bound_existing",
              customerId: existing.id,
              userId: existing.userId,
              userCreated: false,
              lineAccountSync: "noop_already_synced",
            };
            console.info("[LINE Webhook] Repaired store recipient for central member", {
              storeId,
              customerId: existing.id,
              status: result.status,
            });
          }
        } else {
          const released = await prisma.customer.updateMany({
            where: {
              id: existing.id,
              storeId,
              lineUserId: existing.lineUserId,
            },
            data: {
              lineUserId: null,
              lineLinkStatus: "UNLINKED",
              lineLinkedAt: null,
            },
          });
          if (released.count === 1) {
            result = await bindLineToCustomerInStore({
              storeId,
              lineUserId,
              lineName: null,
              phone,
              name: "顧客",
              allowCreate: false,
            });
            console.info("[LINE Webhook] Repaired incompatible store recipient", {
              storeId,
              customerId: existing.id,
              status: result.status,
            });
          }
        }
      }
    }
  }

  // An activated central member already has Customer.userId, so the generic
  // login-identity binder intentionally returns phone_taken_by_other_user.
  // This webhook path is different: the store signature proves the channel,
  // and the phone scopes the existing same-store customer. Bind only the
  // notification recipient; never create/replace NextAuth Account[line] or a
  // central CustomerIdentityLink with this store-scoped id.
  if (result.status === "phone_taken_by_other_user") {
    const bound = await prisma.customer.updateMany({
      where: {
        id: result.customerId,
        storeId,
        phone,
        mergedIntoCustomerId: null,
        OR: [{ lineUserId: null }, { lineUserId }],
      },
      data: {
        lineUserId,
        lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(),
      },
    });
    if (bound.count === 1) {
      const customer = await prisma.customer.findUnique({
        where: { id: result.customerId },
        select: { userId: true },
      });
      result = {
        status: "bound_existing",
        customerId: result.customerId,
        userId: customer?.userId ?? "",
        userCreated: false,
        lineAccountSync: "noop_already_synced",
      };
    }
  }

  // Older repair attempts could clear the incompatible central-login
  // recipient before the generic binder failed while creating a duplicate
  // CUSTOMER User. That durable half-state returns P2002(phone, role) on every
  // retry and no longer has an old lineUserId to enter the compatibility path
  // above. A store-signed webhook plus an exact same-store phone match is
  // sufficient to restore only the notification recipient. Never create or
  // change the canonical User / Account identity here.
  if (
    result.status === "unique_conflict" &&
    result.conflictTarget.split(",").map((field) => field.trim()).includes("phone") &&
    result.conflictTarget.split(",").map((field) => field.trim()).includes("role")
  ) {
    const customer = await prisma.customer.findFirst({
      where: {
        storeId,
        phone,
        lineUserId: null,
        mergedIntoCustomerId: null,
      },
      select: { id: true, userId: true },
    });
    if (customer) {
      const rebound = await prisma.customer.updateMany({
        where: {
          id: customer.id,
          storeId,
          phone,
          lineUserId: null,
          mergedIntoCustomerId: null,
        },
        data: {
          lineUserId,
          lineLinkStatus: "LINKED",
          lineLinkedAt: new Date(),
        },
      });
      if (rebound.count === 1) {
        result = {
          status: "bound_existing",
          customerId: customer.id,
          userId: customer.userId ?? "",
          userCreated: false,
          lineAccountSync: "noop_already_synced",
        };
        console.info("[LINE Webhook] Repaired store recipient after duplicate User conflict", {
          storeId,
          customerId: customer.id,
          status: result.status,
        });
      }
    }
  }

  logLineBindEvent({
    path: "webhook-bind-code",
    status: result.status,
    storeId,
    lineUserId,
    customerId: "customerId" in result ? result.customerId : null,
    userId: "userId" in result ? result.userId : null,
    accountSyncStatus:
      "lineAccountSync" in result ? result.lineAccountSync : undefined,
  });

  // A candidate is captured only after the existing binding helper has safely
  // rejected an overwrite and only when a staff-authorized request exists.
  if (result.status === "already_bound_to_other_line" && eventIdentity) {
    const eventKey = lineWebhookEventKey(eventIdentity);
    if (eventKey) {
      try {
        const captured = await captureLineRebindCandidate({
          storeId,
          customerId: result.customerId,
          normalizedPhone: phone,
          lineUserId,
          webhookEventKey: eventKey,
          eventTimestamp: eventIdentity.timestamp ? new Date(eventIdentity.timestamp) : undefined,
        });
        // No raw LINE id, phone, candidate data, or encryption error is logged.
        console.info("[LINE Webhook] Rebind candidate capture", { storeId, customerId: result.customerId, status: captured.status });
      } catch {
        console.error("[LINE Webhook] Rebind candidate capture failed", { storeId, customerId: result.customerId });
      }
    }
  }

  if (!replyToken) return;

  const text =
    result.status === "bound_existing" || result.status === "already_synced"
      ? "系統通知綁定成功！之後您將可收到預約提醒與方案通知。"
      : result.status === "customer_not_found"
        ? "查無顧客資料，請確認手機號碼是否與店長登記的一致，或聯繫店長協助確認。"
        : result.status === "ambiguous_multiple_candidates"
          ? "系統找到多筆相同手機的顧客資料，需由店長人工確認後才能綁定。"
          : result.status === "already_bound_to_other_line"
            ? "此顧客資料已綁定其他 LINE，如需變更請聯繫店長協助。"
            : result.status === "phone_taken_by_other_user"
              ? "此手機已綁定會員帳號，請聯繫店長確認後再開啟通知。"
              : result.status === "validation_error"
                ? "手機號碼格式不正確，請輸入 09 開頭共 10 碼的手機號碼。"
                : "目前無法完成綁定，請稍後再試或聯繫店長協助。";

  await replyMessage(storeId, replyToken, [{ type: "text", text }]);
}

// ============================================================
// 綁定碼處理
// ============================================================

async function handleBindingRequest(
  lineUserId: string,
  bindingCode: string,
  storeId: string,
  replyToken?: string
) {
  console.log("[LINE] Binding code request", { userId: maskLineUserId(lineUserId), storeId });

  // 1. 此 LINE 是否已綁定同店其他顧客
  const existingLinked = await prisma.customer.findFirst({
    where: { lineUserId, storeId, lineLinkStatus: "LINKED" },
  });

  if (existingLinked) {
    console.log(`[LINE] Already linked to customer: ${existingLinked.name}`);
    logLineBindEvent({
      path: "webhook-bind-code",
      status: "bind_code_already_linked",
      storeId,
      lineUserId,
      customerId: existingLinked.id,
    });
    if (replyToken) {
      const result = await replyMessage(storeId, replyToken, [
        {
          type: "text",
          text: "此 LINE 帳號已綁定其他顧客資料，如需變更請聯繫店家。",
        },
      ]);
      console.log("[LINE] Already-linked reply result:", result);
    }
    return;
  }

  // 2. 查詢綁定碼（限同店）
  const customer = await prisma.customer.findFirst({
    where: { lineBindingCode: bindingCode, storeId },
  });

  if (!customer) {
    console.log(`[LINE] Invalid binding code: ${bindingCode} (store: ${storeId})`);
    logLineBindEvent({
      path: "webhook-bind-code",
      status: "bind_code_invalid",
      storeId,
      lineUserId,
    });
    if (replyToken) {
      const result = await replyMessage(storeId, replyToken, [
        {
          type: "text",
          text: [
            "綁定失敗，請確認綁定碼是否正確。",
            "",
            "綁定碼為 6 碼英數字（例如：ABC123），可在店家後台的顧客頁面取得。",
          ].join("\n"),
        },
      ]);
      console.log("[LINE] Invalid-code reply result:", result);
    }
    return;
  }

  // 3. 該顧客是否已綁定其他 LINE
  if (customer.lineLinkStatus === "LINKED" && customer.lineUserId) {
    console.log(`[LINE] Customer ${customer.name} already linked to another LINE`);
    logLineBindEvent({
      path: "webhook-bind-code",
      status: "bind_code_customer_locked",
      storeId,
      lineUserId,
      customerId: customer.id,
    });
    if (replyToken) {
      const result = await replyMessage(storeId, replyToken, [
        {
          type: "text",
          text: "此顧客帳號已綁定其他 LINE，如需重新綁定請聯繫店家解除後再試。",
        },
      ]);
      console.log("[LINE] Already-linked-customer reply result:", result);
    }
    return;
  }

  // 4. 檢查綁定碼是否過期（超過 24 小時）
  if (customer.lineBindingCodeCreatedAt) {
    const ageMs = Date.now() - customer.lineBindingCodeCreatedAt.getTime();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (ageMs > TWENTY_FOUR_HOURS) {
      console.log(`[LINE] Binding code expired for customer: ${customer.name}`);
      logLineBindEvent({
        path: "webhook-bind-code",
        status: "bind_code_expired",
        storeId,
        lineUserId,
        customerId: customer.id,
      });
      if (replyToken) {
        const result = await replyMessage(storeId, replyToken, [
          {
            type: "text",
            text: "此綁定碼已過期，請聯繫店家重新產生綁定碼。",
          },
        ]);
        console.log("[LINE] Expired-code reply result:", result);
      }
      return;
    }
  }

  // 5. 執行綁定
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      lineUserId,
      lineLinkStatus: "LINKED",
      lineLinkedAt: new Date(),
    },
  });

  console.log("[LINE] Binding success", { customerId: customer.id, userId: maskLineUserId(lineUserId), storeId });

  // 同步 NextAuth Account[line]：webhook 只設 Customer.lineUserId 不同步 Account 會造成
  // 「後台看似已綁定但 LINE OAuth 仍走新身份建立流程」的分裂。Customer.userId 為 null
  // 時無 user 可綁，跳過（顧客之後若走 /profile 啟用流程仍可在那條鏈補上）。
  let accountSyncStatus: AccountSyncStatus = "skipped_no_user";
  if (customer.userId) {
    const syncResult = await syncLineAccountForUser({
      userId: customer.userId,
      lineUserId,
    });
    await upsertCustomerIdentityLink({
      userId: customer.userId,
      storeId,
      customerId: customer.id,
      provider: "line",
      providerAccountId: lineUserId,
      lineUserId,
    });
    accountSyncStatus = syncResult.status;
    console.log(`[LINE] Account sync result for ${customer.name}: ${syncResult.status}`);
  } else {
    console.log(`[LINE] Account sync skipped: Customer.userId is null (customer not yet activated)`);
  }

  logLineBindEvent({
    path: "webhook-bind-code",
    status: "bind_code_success",
    storeId,
    lineUserId,
    customerId: customer.id,
    userId: customer.userId ?? null,
    accountSyncStatus,
  });

  // 🆕 若此 customer 有 sponsor → 邀請者 +1（sourceKey dedupe：僅首次生效）
  try {
    const { awardLineJoinReferrerIfEligible } = await import(
      "@/server/services/referral-points"
    );
    await awardLineJoinReferrerIfEligible({
      customerId: customer.id,
      storeId: customer.storeId,
    });
  } catch {
    // 發點失敗不影響綁定流程
  }

  if (replyToken) {
    const result = await replyMessage(storeId, replyToken, [
      {
        type: "text",
        text: `${customer.name} 您好！LINE 綁定成功 ✓\n\n之後您將可收到預約提醒通知。`,
      },
    ]);
    console.log("[LINE] Binding-success reply result:", result);
  }
}

// ============================================================
// Types
// ============================================================

interface LineWebhookEvent {
  type: string;
  source?: { type: string; userId?: string };
  replyToken?: string;
  webhookEventId?: string;
  timestamp?: number;
  deliveryContext?: { isRedelivery?: boolean };
  message?: { type: string; id?: string; text?: string };
}
