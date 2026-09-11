import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveStorePresentation, resolveStoreSlugForLiff } from "@/lib/store-resolver";

export const dynamic = "force-dynamic";

export default async function LiffPurchaseThankYouPage() {
  const slug = await resolveStoreSlugForLiff();
  if (!slug) notFound();
  const store = await resolveStorePresentation(slug);
  if (!store) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10 text-center">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-8">
        <p className="text-lg font-bold text-green-900">購買申請已送出</p>
        <p className="mt-2 text-sm leading-6 text-green-800">店長確認款項後會為您開通堂數，請勿重複送出。</p>
      </div>
      <Link href={`/s/${store.slug}/liff/wallets`} className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white">
        回到我的方案
      </Link>
      <Link href={`/s/${store.slug}/liff`} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 font-medium text-earth-700">
        回首頁
      </Link>
    </div>
  );
}
