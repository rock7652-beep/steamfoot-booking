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
import {
  captureLineRebindCandidate,
  lineWebhookEventKey,
} from "@/server/services/line-rebind";
import {
  logLineBindEvent,
  maskLineUserId,
  type AccountSyncStatus,
} from "@/lib/line-bind-log";
import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";
import {
  addDigitalButlerEscapeQuickReplies,
  digitalButlerReplyDiagnostics,
  sanitizeDigitalButlerReplyMessages,
} from "@/server/services/digital-butler-line-reply";
import { digitalButlerIntentsToLineMessages } from "@/server/services/digital-butler-channel";
import { handleSessionBalanceLineResponse } from "@/server/services/session-balance-notifications";
import { createTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
import { ZHUBEI_EXPERIENCE_BOOKING_URL } from "@/lib/booking-links";

export const dynamic = "force-dynamic";

function isStoreLineIdentityConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
    return false;
  }
  const target = "meta" in error
    ? (error.meta as { target?: string[] | string } | undefined)?.target
    : undefined;
  const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  return fields.includes("storeId") && fields.includes("lineUserId");
}

async function updateStoreLineRecipient(
  update: () => Promise<{ count: number }>,
): Promise<{ count: number; identityConflict: boolean }> {
  try {
    const result = await update();
    return { count: result.count, identityConflict: false };
  } catch (error) {
    if (isStoreLineIdentityConflict(error)) {
      return { count: 0, identityConflict: true };
    }
    throw error;
  }
}

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
          "如需開啟預約提醒與方案通知，請直接輸入您的手機號碼完成通知設定。",
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

  const notificationBindingMatch = text.match(/^綁定通知\s*([A-F0-9]{10})$/i);
  if (notificationBindingMatch) {
    await handleNotificationRecipientBinding(
      lineUserId,
      notificationBindingMatch[1].toUpperCase(),
      storeId,
      replyToken,
    );
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
        await replyDigitalButlerMessages(storeId, replyToken, digitalButlerResult, lineUserId);
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
      await replyDigitalButlerMessages(storeId, replyToken, result, lineUserId);
    }
  }
}

async function handleNotificationRecipientBinding(
  lineUserId: string,
  bindingCode: string,
  storeId: string,
  replyToken?: string,
) {
  const recipient = await prisma.storeLineNotificationRecipient.findFirst({
    where: { storeId, bindingCode },
    select: { id: true, displayName: true, bindingCodeExpiresAt: true },
  });
  let reply = "綁定連結無效，請回到店家後台重新新增通知人員。";
  if (recipient && recipient.bindingCodeExpiresAt && recipient.bindingCodeExpiresAt > new Date()) {
    const occupied = await prisma.storeLineNotificationRecipient.findFirst({
      where: { storeId, lineUserId, NOT: { id: recipient.id } },
      select: { id: true },
    });
    if (occupied) {
      reply = "這個 LINE 已是本店通知人員；如需調整姓名或身分，請先在後台解除原綁定。";
    } else {
      await prisma.storeLineNotificationRecipient.update({
        where: { id: recipient.id },
        data: {
          lineUserId,
          bindingCode: null,
          bindingCodeExpiresAt: null,
          linkedAt: new Date(),
          isActive: true,
        },
      });
      reply = `${recipient.displayName}，店家重要通知已綁定成功 ✓\n\n之後顧客有 VIP 續購、新體驗預約或留下聯絡資料時，系統會主動通知您。`;
    }
  } else if (recipient) {
    reply = "這個綁定連結已超過 24 小時，請回到店家後台重新新增。";
  }
  if (replyToken) await replyMessage(storeId, replyToken, [{ type: "text", text: reply }]);
}

async function replyDigitalButlerMessages(
  storeId: string,
  replyToken: string,
  result: Awaited<ReturnType<typeof handleDigitalButlerText>>,
  lineUserId: string,
) {
  if (!result) return;
  const intents = await Promise.all(result.messages.map(async (intent) => {
    if (intent.type !== "text" || intent.urlButton?.url !== ZHUBEI_EXPERIENCE_BOOKING_URL) return intent;
    try {
      const link = await createTrialBookingChatLink({ storeId, channel: "LINE", chatIdentity: lineUserId });
      return {
        ...intent,
        text: intent.text.replace(ZHUBEI_EXPERIENCE_BOOKING_URL, "請使用下方專屬連結完成預約。"),
        urlButton: { ...intent.urlButton, url: link.url },
      };
    } catch {
      console.error("[LINE Webhook] booking link issue failed", { storeId });
      return {
        ...intent,
        text: intent.text.replace(
          ZHUBEI_EXPERIENCE_BOOKING_URL,
          "專屬預約連結暫時無法建立，請稍後再輸入「我想體驗蒸足」。",
        ),
        urlButton: undefined,
      };
    }
  }));
  const messages = sanitizeDigitalButlerReplyMessages(
    addDigitalButlerEscapeQuickReplies(
      digitalButlerIntentsToLineMessages(intents),
      result.outcome,
    ),
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
  let lineIdentityOwnedByOtherCustomer = false;
  let reviewCustomerId: string | null = null;
  // This is a store-notification binding, not account registration.  The old
  // implementation reused the login binder and therefore created a User and
  // Account[line] for an unregistered Customer.  A later real registration
  // then collided with that synthetic account and surfaced "phone used".
  // Keep this path deliberately store-recipient-only: it may update Customer's
  // Messaging API identity, but must never create or replace login identity.
  const candidates = await prisma.customer.findMany({
    where: { storeId, phone, mergedIntoCustomerId: null },
    select: { id: true, userId: true, lineUserId: true },
    take: 2,
  });

  let result:
    | { status: "customer_not_found" }
    | { status: "ambiguous_multiple_candidates" }
    | { status: "already_bound_to_other_line"; customerId: string }
    | {
        status: "bound_existing" | "already_synced";
        customerId: string;
        userId: string;
        lineAccountSync: "noop_already_synced";
      };

  if (candidates.length === 0) {
    result = { status: "customer_not_found" };
  } else if (candidates.length > 1) {
    result = { status: "ambiguous_multiple_candidates" };
  } else {
    const customer = candidates[0];
    let mayReplaceRecipient = !customer.lineUserId || customer.lineUserId === lineUserId;

    if (customer.lineUserId && customer.lineUserId !== lineUserId) {
      const compatibility = await probeStoreLineRecipient(storeId, customer.lineUserId);
      mayReplaceRecipient = compatibility.status === "INCOMPATIBLE";
    }

    if (!mayReplaceRecipient) {
      result = {
        status: "already_bound_to_other_line",
        customerId: customer.id,
      };
    } else {
      const bound = await updateStoreLineRecipient(() => prisma.customer.updateMany({
        where: {
          id: customer.id,
          storeId,
          phone,
          mergedIntoCustomerId: null,
          ...(customer.lineUserId
            ? { lineUserId: customer.lineUserId }
            : { lineUserId: null }),
        },
        data: {
          lineUserId,
          lineLinkStatus: "LINKED",
          lineLinkedAt: new Date(),
        },
      }));

      if (bound.identityConflict) {
        lineIdentityOwnedByOtherCustomer = true;
        reviewCustomerId = customer.id;
      }

      result = bound.count === 1
        ? {
            status: customer.lineUserId === lineUserId ? "already_synced" : "bound_existing",
            customerId: customer.id,
            userId: customer.userId ?? "",
            lineAccountSync: "noop_already_synced",
          }
        : {
            status: "already_bound_to_other_line",
            customerId: customer.id,
          };
    }
  }

  logLineBindEvent({
    path: "webhook-bind-code",
    status: result.status,
    storeId,
    lineUserId,
    customerId: "customerId" in result ? result.customerId : null,
    userId: "userId" in result ? result.userId : null,
    accountSyncStatus: "lineAccountSync" in result ? result.lineAccountSync : undefined,
  });

  // A candidate is captured only after the existing binding helper has safely
  // rejected an overwrite and only when a staff-authorized request exists.
  const captureCustomerId = lineIdentityOwnedByOtherCustomer
    ? reviewCustomerId
    : result.status === "already_bound_to_other_line"
      ? result.customerId
      : null;
  if (captureCustomerId && eventIdentity) {
    const eventKey = lineWebhookEventKey(eventIdentity);
    if (eventKey) {
      try {
        const captured = await captureLineRebindCandidate({
          storeId,
          customerId: captureCustomerId,
          normalizedPhone: phone,
          lineUserId,
          webhookEventKey: eventKey,
          eventTimestamp: eventIdentity.timestamp ? new Date(eventIdentity.timestamp) : undefined,
        });
        // No raw LINE id, phone, candidate data, or encryption error is logged.
        console.info("[LINE Webhook] Rebind candidate capture", { storeId, customerId: captureCustomerId, status: captured.status });
      } catch {
        console.error("[LINE Webhook] Rebind candidate capture failed", { storeId, customerId: captureCustomerId });
      }
    }
  }

  if (!replyToken) return;

  const text = lineIdentityOwnedByOtherCustomer
    ? "此 LINE 已綁定其他顧客資料，請由店長確認解除或合併。"
    : result.status === "bound_existing" || result.status === "already_synced"
      ? "通知設定完成！之後您將可收到預約提醒與方案通知。若尚未註冊蒸管家，可繼續完成會員註冊。"
      : result.status === "customer_not_found"
        ? "查無顧客資料，請確認手機號碼是否與店長登記的一致，或聯繫店長協助確認。"
        : result.status === "ambiguous_multiple_candidates"
          ? "系統找到多筆相同手機的顧客資料，需由店長人工確認後才能綁定。"
          : result.status === "already_bound_to_other_line"
            ? "此顧客資料已綁定其他 LINE，如需變更請聯繫店長協助。"
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

  // A webhook identity is issued by this store's Messaging API channel. It
  // must never create Account[line] or a LINE Login CustomerIdentityLink:
  // those values are issued by a different channel and are not comparable.
  const accountSyncStatus: AccountSyncStatus = "skipped_no_user";

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
