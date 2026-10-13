import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildEcpayRecurringCheckout,
  getEcpayRecurringCredentials,
} from "@/lib/ecpay-recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function html(value: string | number) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function taiwanTradeDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const field = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${field("year")}/${field("month")}/${field("day")} ${field("hour")}:${field("minute")}:${field("second")}`;
}

function errorPage(message: string, status: number) {
  return new NextResponse(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>無法開始付款</title><body style="font-family:sans-serif;max-width:640px;margin:3rem auto;padding:1rem;color:#18332b"><h1>無法開始付款</h1><p>${html(message)}</p><a href="/pricing">返回方案頁</a></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return errorPage("請從月繳訂單頁送出授權。", 403);
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return errorPage("付款連結無效。", 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorPage("表單內容無效，請重新載入訂單。", 400);
  }
  if (form.get("acceptTerms") !== "yes") return errorPage("請先勾選同意訂單與定期扣款條款。", 400);
  const consentingName = String(form.get("consentingName") ?? "").trim();
  const consentingEmail = String(form.get("consentingEmail") ?? "").trim().toLowerCase();
  if (!consentingName || consentingName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consentingEmail) || consentingEmail.length > 254) {
    return errorPage("請填寫有效的授權代表姓名及電子郵件。", 400);
  }

  try {
    const checkoutTokenHash = createHash("sha256").update(token).digest("hex");
    const agreement = await prisma.ecpayRecurringAgreement.findUnique({
      where: { checkoutTokenHash },
      select: {
        id: true, merchantTradeNo: true, monthlyAmount: true, plan: true,
        termsAcceptedAt: true, status: true, tokenExpiresAt: true,
      },
    });
    if (!agreement || agreement.status !== "PENDING_AUTHORIZATION" || agreement.tokenExpiresAt <= new Date()) {
      return errorPage("此付款連結已失效，請聯絡蒸管家重新確認訂單。", 410);
    }
    const credentials = getEcpayRecurringCredentials();
    const base = process.env.ECPAY_CALLBACK_BASE_URL ?? process.env.NEXTAUTH_URL;
    if (!base) return errorPage("付款服務尚未完成環境設定，請聯絡客服。", 503);
    const origin = new URL(base).origin;
    const itemName = agreement.plan === "BASIC" ? "蒸管家基本版月繳" : agreement.plan === "GROWTH" ? "蒸管家專業版月繳" : "蒸管家展店版月繳";
    const checkout = buildEcpayRecurringCheckout({
      credentials,
      merchantTradeNo: agreement.merchantTradeNo,
      tradeDate: taiwanTradeDate(new Date()),
      amount: agreement.monthlyAmount,
      itemName,
      returnUrl: `${origin}/api/payments/ecpay/recurring/return`,
      periodReturnUrl: `${origin}/api/payments/ecpay/recurring/period`,
      clientBackUrl: `${origin}/checkout/monthly/result`,
    });
    const consent = await prisma.ecpayRecurringAgreement.updateMany({
      where: { id: agreement.id, status: "PENDING_AUTHORIZATION" },
      data: { termsAcceptedAt: agreement.termsAcceptedAt ?? new Date(), consentingName, consentingEmail },
    });
    if (consent.count !== 1) {
      return errorPage("訂單狀態已變更，請重新載入付款連結。", 409);
    }
    const fields = Object.entries(checkout.fields).map(([key, value]) => `<input type="hidden" name="${html(key)}" value="${html(value)}">`).join("");
    const body = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>前往綠界授權</title></head><body style="font-family:sans-serif;max-width:640px;margin:3rem auto;padding:1rem;color:#18332b"><h1>訂購同意已記錄</h1><p>下一步將前往綠界信用卡頁面，完成 NT$${agreement.monthlyAmount.toLocaleString("zh-TW")}／月的定期扣款授權。綠界回報首次扣款成功後，訂閱才會開通。</p><form method="post" action="${html(checkout.endpoint)}">${fields}<button type="submit" style="min-height:48px;padding:0 24px;background:#123e32;color:white;border:0;border-radius:24px;font-size:16px;font-weight:600">前往綠界信用卡授權</button></form><p><a href="/terms">服務條款</a> · <a href="/refunds">取消與退費政策</a></p></body></html>`;
    return new NextResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    console.error("[Ecpay recurring authorize] checkout initialization failed", error instanceof Error ? error.message : String(error));
    return errorPage("付款服務暫時無法使用，請聯絡蒸管家協助。", 503);
  }
}
