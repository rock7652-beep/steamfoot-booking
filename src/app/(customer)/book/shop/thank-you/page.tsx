import { getStoreContext } from "@/lib/store-context";
import { getShopConfig } from "@/lib/shop-config";
import { notFound } from "next/navigation";
import { AppLink as Link } from "@/components/app-link";
import { PurchaseReceipt } from "@/components/purchase-receipt";
import { getCustomerPurchaseSummary } from "@/server/queries/customer-purchase-summary";

export default async function ThankYouPage({ searchParams }: { searchParams: Promise<{ txId?: string }> }) {
  const { txId } = await searchParams;
  const store = await getStoreContext();
  if (!store) notFound();
  const [receipt, config] = await Promise.all([
    getCustomerPurchaseSummary(store.storeId, store.storeSlug, txId),
    getShopConfig(store.storeId),
  ]);
  if (!receipt) notFound();
  const prefix = `/s/${store.storeSlug}`;
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-earth-900">購買申請紀錄</h1>
        <p className="mt-2 text-sm text-earth-600">店長確認入帳後開通方案，請依下方訂單狀態確認，勿重複轉帳。</p>
      </header>
      <PurchaseReceipt receipt={{ ...receipt, amount: Number(receipt.amount) }} contactUrl={config.lineOfficialUrl} />
      <div className="flex flex-col gap-3 text-center">
        <Link href={`${prefix}/my-plans`} className="rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white">查看我的方案</Link>
        <Link href={`${prefix}/book`} className="text-sm text-earth-600">返回首頁</Link>
      </div>
    </div>
  );
}
