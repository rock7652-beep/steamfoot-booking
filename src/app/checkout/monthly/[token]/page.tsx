import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  BASIC: "基本版",
  GROWTH: "專業版",
  ALLIANCE: "展店版",
};

export default async function MonthlyCheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) notFound();
  const checkoutTokenHash = createHash("sha256").update(token).digest("hex");
  const agreement = await prisma.ecpayRecurringAgreement.findUnique({
    where: { checkoutTokenHash },
    select: {
      store: { select: { name: true } },
      plan: true,
      monthlyAmount: true,
      initialTermMonths: true,
      termsSnapshot: true,
      termsVersion: true,
      status: true,
      tokenExpiresAt: true,
      termsAcceptedAt: true,
    },
  });
  if (!agreement || agreement.tokenExpiresAt <= new Date()) notFound();

  if (agreement.status !== "PENDING_AUTHORIZATION") {
    return <main className="mx-auto max-w-xl px-5 py-12 text-[#18332b]">
      <h1 className="text-2xl font-semibold">月繳訂單狀態</h1>
      <p className="mt-4 rounded-xl bg-white p-5 leading-7">
        {agreement.status === "ACTIVE" || agreement.status === "CANCEL_REQUESTED"
          ? "此訂閱已完成首次信用卡授權。若要查詢或取消續扣，請依服務條款聯絡蒸管家客服。"
          : "此訂閱連結已失效，請聯絡蒸管家重新確認訂單。"}
      </p>
      <a href="/terms" className="mt-4 inline-block min-h-11 underline">服務條款</a>
    </main>;
  }

  const amount = agreement.monthlyAmount;
  return <main className="mx-auto max-w-xl px-5 py-10 text-[#18332b]">
    <div className="rounded-2xl border border-[#153B31]/15 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-sm font-semibold tracking-widest text-[#74603C]">蒸管家信用卡月繳</p>
      <h1 className="mt-2 text-2xl font-semibold">確認訂單與定期扣款授權</h1>
      <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-xl bg-[#F8F5EE] p-4 text-base">
        <dt>店家</dt><dd className="text-right font-medium">{agreement.store.name}</dd>
        <dt>方案</dt><dd className="text-right font-medium">{PLAN_NAMES[agreement.plan] ?? agreement.plan}</dd>
        <dt>每月扣款</dt><dd className="text-right font-semibold">NT${amount.toLocaleString("zh-TW")}</dd>
        <dt>最低承諾期間</dt><dd className="text-right font-medium">{agreement.initialTermMonths} 個月</dd>
        <dt>最低承諾總額</dt><dd className="text-right font-semibold">NT${(amount * agreement.initialTermMonths).toLocaleString("zh-TW")}</dd>
      </dl>
      <pre className="mt-5 whitespace-pre-wrap font-sans text-sm leading-7 text-[#4C6259]">{agreement.termsSnapshot}</pre>
      <p className="mt-4 text-sm leading-6 text-[#4C6259]">
        詳細內容請閱讀<a href="/terms" className="mx-1 underline">服務條款</a>及<a href="/refunds" className="mx-1 underline">取消與退費政策</a>。條款版本：{agreement.termsVersion}。
      </p>
      <form action={`/api/payments/ecpay/recurring/authorize/${encodeURIComponent(token)}`} method="post" className="mt-6 border-t border-[#153B31]/15 pt-5">
        <label className="block text-sm font-medium">店家授權代表姓名
          <input type="text" name="consentingName" autoComplete="name" maxLength={100} required className="mt-1 min-h-11 w-full rounded-lg border border-[#153B31]/20 px-3 py-2" />
        </label>
        <label className="mt-4 block text-sm font-medium">聯絡電子郵件
          <input type="email" name="consentingEmail" autoComplete="email" maxLength={254} required className="mt-1 min-h-11 w-full rounded-lg border border-[#153B31]/20 px-3 py-2" />
        </label>
        <label className="flex items-start gap-3 text-base leading-7">
          <input type="checkbox" name="acceptTerms" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-[#123E32]" />
          <span>我已閱讀並同意上述月繳方案、12 個月最低承諾、期滿後按月續約及信用卡定期扣款安排，並授權綠界依訂單金額執行扣款。</span>
        </label>
        <button type="submit" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#123E32] px-5 py-3 font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#123E32]">
          同意並前往綠界信用卡授權
        </button>
      </form>
      <p className="mt-4 text-xs leading-5 text-[#64756D]">蒸管家不會收到或保存完整卡號、有效期限或安全碼；信用卡資料由綠界的付款頁面處理。</p>
    </div>
  </main>;
}
