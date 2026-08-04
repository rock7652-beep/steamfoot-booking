import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { prisma } from "@/lib/db";
import { ActivationForm } from "./_components/activation-form";

interface PageProps { searchParams: Promise<{ customerId?: string }> }

export default async function TaichungFirstActivationPage({ searchParams }: PageProps) {
  const temp = await getOAuthTempSession();
  const { customerId } = await searchParams;
  const customer = temp?.channelKey === "taichung" && customerId
    ? await prisma.customer.findFirst({ where: { id: customerId, storeId: temp.storeId, userId: null, mergedIntoCustomerId: null }, select: { id: true, phone: true } })
    : null;
  if (!customer) return <main className="mx-auto max-w-sm px-4 py-12"><div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h1 className="mb-2 text-base font-semibold text-amber-900">無法啟用帳號</h1><p className="text-sm text-amber-800">登入流程已過期或資料不符，請重新從暖沐 LINE 登入。</p></div></main>;
  return <main className="mx-auto max-w-sm px-4 py-12"><div className="rounded-lg border border-earth-200 bg-white p-5 shadow-sm"><h1 className="mb-1 text-base font-semibold text-earth-900">找到您的暖沐會員資料</h1><p className="mb-4 text-sm text-earth-600">請設定登入密碼，即可完成首次啟用。</p><ActivationForm customerId={customer.id} phone={customer.phone} /></div></main>;
}
