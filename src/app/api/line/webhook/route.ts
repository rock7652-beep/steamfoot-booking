import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/line";
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
      // 使用者加入好友 — 嘗試綁定
      console.log(`[LINE] Follow event from ${lineUserId}`);
      await linkLineUser(lineUserId);
      break;
    }
    case "unfollow": {
      // 使用者封鎖
      console.log(`[LINE] Unfollow event from ${lineUserId}`);
      await prisma.customer.updateMany({
        where: { lineUserId },
        data: { lineLinkStatus: "BLOCKED" },
      });
      break;
    }
    case "message": {
      // 收到訊息 — 嘗試綁定（若尚未綁定）
      console.log(`[LINE] Message from ${lineUserId}: ${event.message?.text ?? "(non-text)"}`);
      await linkLineUser(lineUserId);
      break;
    }
  }
}

/**
 * 嘗試將 LINE userId 與顧客綁定
 * v1 邏輯：找 lineLinkStatus=UNLINKED 且 lineUserId 為空的顧客
 *         目前無法自動配對，僅記錄 lineUserId 供手動綁定
 */
async function linkLineUser(lineUserId: string) {
  // 檢查是否已綁定
  const existing = await prisma.customer.findFirst({
    where: { lineUserId },
  });

  if (existing) {
    // 已綁定，確保狀態正確
    if (existing.lineLinkStatus !== "LINKED") {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { lineLinkStatus: "LINKED", lineLinkedAt: new Date() },
      });
    }
    return;
  }

  // v1: 記錄到 console，未來做完整綁定流程
  console.log(`[LINE] New lineUserId ${lineUserId} — no matching customer found. Manual binding required.`);
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
