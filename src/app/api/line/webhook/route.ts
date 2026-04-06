// ============================================================
// LINE Webhook — 完整事件處理
//
// ⚠️ 規則：
//   1. 使用原生 Response，不使用 NextResponse（避免 307）
//   2. POST 最後一定 return 200
//   3. 所有錯誤在 try-catch 內處理，不外拋
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

    for (const event of events) {
      try {
        await handleLineEvent(event);
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
// Event dispatcher
// ============================================================

async function handleLineEvent(event: LineWebhookEvent) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  switch (event.type) {
    case "follow":
      await handleFollow(lineUserId, event.replyToken);
      break;

    case "unfollow":
      await handleUnfollow(lineUserId);
      break;

    case "message":
      if (event.message?.type === "text" && event.message.text) {
        await handleTextMessage(
          lineUserId,
          event.message.text.trim(),
          event.replyToken
        );
      }
      break;
  }
}

// ============================================================
// follow — 新好友加入 / 封鎖後重新加入
// ============================================================

async function handleFollow(lineUserId: string, replyToken?: string) {
  console.log(`[LINE] Follow from ${lineUserId}`);

  // 若之前被封鎖，自動恢復綁定
  const blocked = await prisma.customer.findFirst({
    where: { lineUserId, lineLinkStatus: "BLOCKED" },
  });

  if (blocked) {
    await prisma.customer.update({
      where: { id: blocked.id },
      data: { lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
    });
    console.log(`[LINE] Re-linked blocked customer: ${blocked.name} (${blocked.id})`);
  }

  // 回覆歡迎訊息
  if (replyToken) {
    await replyMessage(replyToken, [
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
  }
}

// ============================================================
// unfollow — 封鎖 / 取消好友
// ============================================================

async function handleUnfollow(lineUserId: string) {
  console.log(`[LINE] Unfollow from ${lineUserId}`);

  const result = await prisma.customer.updateMany({
    where: { lineUserId },
    data: { lineLinkStatus: "BLOCKED" },
  });

  console.log(`[LINE] Marked ${result.count} customer(s) as BLOCKED`);
}

// ============================================================
// message — 文字訊息處理
// ============================================================

async function handleTextMessage(
  lineUserId: string,
  text: string,
  replyToken?: string
) {
  console.log(`[LINE] Message from ${lineUserId}: ${text}`);

  // 解析「綁定 XXXXXX」格式（大小寫不敏感）
  const bindMatch = text.match(/^綁定\s*([A-Z0-9]{6})$/i);
  if (bindMatch) {
    await handleBindingRequest(
      lineUserId,
      bindMatch[1].toUpperCase(),
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
  replyToken?: string
) {
  console.log(`[LINE] Binding request: code=${bindingCode}, lineUser=${lineUserId}`);

  // 1. 此 LINE 是否已綁定其他顧客
  const existingLinked = await prisma.customer.findFirst({
    where: { lineUserId, lineLinkStatus: "LINKED" },
  });

  if (existingLinked) {
    console.log(`[LINE] Already linked to customer: ${existingLinked.name}`);
    if (replyToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "此 LINE 帳號已綁定其他顧客資料，如需變更請聯繫店家。",
        },
      ]);
    }
    return;
  }

  // 2. 查詢綁定碼
  const customer = await prisma.customer.findUnique({
    where: { lineBindingCode: bindingCode },
  });

  if (!customer) {
    console.log(`[LINE] Invalid binding code: ${bindingCode}`);
    if (replyToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: [
            "綁定失敗，請確認綁定碼是否正確。",
            "",
            "綁定碼為 6 碼英數字（例如：ABC123），可在店家後台的顧客頁面取得。",
          ].join("\n"),
        },
      ]);
    }
    return;
  }

  // 3. 該顧客是否已綁定其他 LINE
  if (customer.lineLinkStatus === "LINKED" && customer.lineUserId) {
    console.log(`[LINE] Customer ${customer.name} already linked to another LINE`);
    if (replyToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "此顧客帳號已綁定其他 LINE，如需重新綁定請聯繫店家解除後再試。",
        },
      ]);
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
        await replyMessage(replyToken, [
          {
            type: "text",
            text: "此綁定碼已過期，請聯繫店家重新產生綁定碼。",
          },
        ]);
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
      // 保留綁定碼（方便紀錄），但已綁定後不再可用
    },
  });

  console.log(`[LINE] Binding success: ${customer.name} (${customer.id}) <-> ${lineUserId}`);

  if (replyToken) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `${customer.name} 您好！LINE 綁定成功 ✓\n\n之後您將可收到預約提醒通知。`,
      },
    ]);
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
