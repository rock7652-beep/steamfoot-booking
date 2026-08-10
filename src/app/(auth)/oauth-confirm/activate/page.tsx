import { getOAuthTempSessionDetailed } from "@/lib/server/oauth-temp-session";
import { prisma } from "@/lib/db";
import { ActivationForm } from "./_components/activation-form";

interface PageProps { searchParams: Promise<{ customerId?: string }> }

export default async function TaichungFirstActivationPage({ searchParams }: PageProps) {
  const verification = await getOAuthTempSessionDetailed();
  const temp = verification.status === "verified" ? verification.session : null;
  const { customerId } = await searchParams;
  const customer = temp?.channelKey === "taichung" && customerId
    ? await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: temp.storeId,
        mergedIntoCustomerId: null,
        OR: [
          { userId: null },
          { user: { is: { role: "CUSTOMER", status: "ACTIVE", passwordHash: null } } },
        ],
      },
      select: { id: true, phone: true },
    })
    : null;
  if (!customer) {
    const code = verification.status === "rejected"
      ? verification.error === "expired" ? "activation_context_expired" : "activation_context_missing"
      : "customer_not_found";
    return <main className="mx-auto max-w-sm px-4 py-12"><div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h1 className="mb-2 text-base font-semibold text-amber-900">無法啟用帳號</h1><p className="text-sm text-amber-800">{code === "activation_context_expired" ? "登入驗證已過期，請重新從暖沐 LINE 登入。" : code === "activation_context_missing" ? "登入驗證資料遺失，請重新從暖沐 LINE 登入。" : "會員資料已變更，請重新從暖沐 LINE 登入。"}</p></div></main>;
  }
  return <main className="mx-auto max-w-sm px-4 py-12"><div className="rounded-lg border border-earth-200 bg-white p-5 shadow-sm"><h1 className="mb-1 text-base font-semibold text-earth-900">找到您的暖沐會員資料</h1><p className="mb-4 text-sm text-earth-600">請設定登入密碼，即可完成首次啟用。</p><ActivationForm customerId={customer.id} phone={customer.phone} /></div></main>;
}
