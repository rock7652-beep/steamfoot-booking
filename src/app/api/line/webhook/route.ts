// ============================================================
// LINE Webhook — 完整事件處理（B7-4.5: store-aware）
//
// ⚠️ 規則：
//   1. 使用原生 Response，不使用 NextResponse（避免 307）
//   2. POST 最後一定 return 200
//   3. 所有錯誤在 try-catch 內處理，不外拋
//   4. B7-4.5: 每個 webhook 必須先 resolve store，失敗則安全中止
// ============================================================

import { verifyLineSignature, replyMessage } from "@/lib/line";
import { prisma } from "@/lib/db";

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

    // 簽章驗證
    if (process.env.LINE_CHANNEL_SECRET && signature) {
      if (!verifyLineSignature(body, signature)) {
        console.warn("[LINE Webhook] Invalid signature");
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const data = JSON.parse(body);
    const events: LineWebhookEvent[] = data.events ?? [];

    // B7-4.5: 從 destination 解析 store
    const destination: string | undefined = data.destination;
    const storeId = await resolveStoreFromDestination(destination);

    if (!storeId) {
      console.warn("[LINE Webhook] Cannot resolve store — aborting", { destination });
      return new Response("OK", { status: 200 });
    }

    console.log("[LINE Webhook] Resolved store", { destination, storeId });

    for (const event of events) {
      try {
        await handleLineEvent(event, storeId);
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
    console.warn("[LINE Webhook] No store found for destination:", destination);
    return null;
  }

  return store.id;
}

// ============================================================
// Event dispatcher
// ============================================================

async function handleLineEvent(event: LineWebhookEvent, storeId: string) {
  const lineUserId = event.source?.userId;
  console.log("[LINE] Event:", {
    type: event.type,
    userId: lineUserId,
    storeId,
    hasReplyToken: !!event.replyToken,
    messageType: event.message?.type,
    messageText: event.message?.text,
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
          event.replyToken
        );
      }
      break;
  }
}

// ============================================================
// follow — 新好友加入 / 封鎖後重新加入
// ============================================================

async function handleFollow(lineUserId: string, storeId: string, replyToken?: string) {
  console.log(`[LINE] Follow from ${lineUserId} (store: ${storeId})`);

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
    const result = await replyMessage(replyToken, [
      {
        type: "text",
        text: [
          "歡迎加入蒸足官方帳號！",
          "",
          "如需綁定您的預約帳號，請輸入：",
          "綁定 你的綁定碼",
          "",
          "例如：綁定 ABC123",
          "",
          "綁定碼可在店家後台的顧客頁面取得。",
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
  console.log(`[LINE] Unfollow from ${lineUserId} (store: ${storeId})`);

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
  replyToken?: string
) {
  console.log(`[LINE] Message from ${lineUserId}: ${text} (store: ${storeId})`);

  // 解析「綁定 XXXXXX」格式（大小寫不敏感）
  const bindMatch = text.match(/^綁定\s*([A-Z0-9]{6})$/i);
  if (bindMatch) {
    await handleBindingRequest(
      lineUserId,
      bindMatch[1].toUpperCase(),
      storeId,
      replyToken
    );
  }
  // 未來可在此擴充其他指令（查詢預約等）
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
  console.log(`[LINE] Binding request: code=${bindingCode}, lineUser=${lineUserId}, store=${storeId}`);

  // 1. 此 LINE 是否已綁定同店其他顧客
  const existingLinked = await prisma.customer.findFirst({
    where: { lineUserId, storeId, lineLinkStatus: "LINKED" },
  });

  if (existingLinked) {
    console.log(`[LINE] Already linked to customer: ${existingLinked.name}`);
    if (replyToken) {
      const result = await replyMessage(replyToken, [
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
    if (replyToken) {
      const result = await replyMessage(replyToken, [
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
    if (replyToken) {
      const result = await replyMessage(replyToken, [
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
      if (replyToken) {
        const result = await replyMessage(replyToken, [
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

  console.log(`[LINE] Binding success: ${customer.name} (${customer.id}) <-> ${lineUserId} (store: ${storeId})`);

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
    const result = await replyMessage(replyToken, [
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
  message?: { type: string; text?: string };
}
