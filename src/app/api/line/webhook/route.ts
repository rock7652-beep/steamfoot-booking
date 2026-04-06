import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, replyMessage } from "@/lib/line";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    // Verify signature (skip if no secret configured yet)
    if (process.env.LINE_CHANNEL_SECRET) {
      if (!verifyLineSignature(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const data = JSON.parse(body);
    const events = data.events ?? [];

    for (const event of events) {
      await handleLineEvent(event);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[LINE Webhook Error]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// LINE webhook verification (GET)
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

async function handleLineEvent(event: LineWebhookEvent) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  switch (event.type) {
    case "follow": {
      console.log(`[LINE] Follow event from ${lineUserId}`);
      // Re-link if previously blocked
      const blocked = await prisma.customer.findFirst({
        where: { lineUserId, lineLinkStatus: "BLOCKED" },
      });
      if (blocked) {
        await prisma.customer.update({
          where: { id: blocked.id },
          data: { lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
        });
      }
      // Reply with welcome + binding instructions
      if (event.replyToken) {
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: "歡迎加入蒸足官方帳號！\n\n如需綁定您的預約帳號，請輸入：\n綁定 你的綁定碼\n\n例如：綁定 ABC123\n\n綁定碼可在店家後台的顧客頁面取得。",
          },
        ]);
      }
      break;
    }
    case "unfollow": {
      console.log(`[LINE] Unfollow event from ${lineUserId}`);
      await prisma.customer.updateMany({
        where: { lineUserId },
        data: { lineLinkStatus: "BLOCKED" },
      });
      break;
    }
    case "message": {
      if (event.message?.type !== "text" || !event.message.text) break;
      const text = event.message.text.trim();
      console.log(`[LINE] Message from ${lineUserId}: ${text}`);

      // 解析「綁定 XXXXXX」格式
      const bindMatch = text.match(/^綁定\s*([A-Z0-9]{6})$/i);
      if (bindMatch) {
        await handleBindingRequest(lineUserId, bindMatch[1].toUpperCase(), event.replyToken);
      }
      break;
    }
  }
}

// ============================================================
// 綁定碼處理
// ============================================================

async function handleBindingRequest(
  lineUserId: string,
  bindingCode: string,
  replyToken?: string
) {
  // 1. 檢查此 LINE 是否已綁定其他顧客
  const existingLinked = await prisma.customer.findFirst({
    where: { lineUserId, lineLinkStatus: "LINKED" },
  });

  if (existingLinked) {
    if (replyToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "此 LINE 帳號已綁定其他顧客資料，如需協助請聯繫店家。",
        },
      ]);
    }
    return;
  }

  // 2. 查詢綁定碼對應的顧客
  const customer = await prisma.customer.findUnique({
    where: { lineBindingCode: bindingCode },
  });

  if (!customer) {
    if (replyToken) {
      await replyMessage(replyToken, [
        {
          type: "text",
          text: "綁定失敗，請確認綁定碼是否正確。\n\n綁定碼可在店家後台的顧客頁面取得。",
        },
      ]);
    }
    return;
  }

  // 3. 檢查該顧客是否已被其他 LINE 綁定
  if (customer.lineLinkStatus === "LINKED" && customer.lineUserId) {
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

  // 4. 執行綁定
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      lineUserId,
      lineLinkStatus: "LINKED",
      lineLinkedAt: new Date(),
      // 綁定碼保留，但不再可用（因 lineLinkStatus 已改）
    },
  });

  console.log(`[LINE] Binding success: ${customer.name} (${customer.id}) <-> ${lineUserId}`);

  if (replyToken) {
    await replyMessage(replyToken, [
      {
        type: "text",
        text: `${customer.name} 您好！LINE 綁定成功，之後您將可收到預約提醒通知。`,
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
