import { headers, cookies } from "next/headers";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { OnboardingForm } from "./onboarding-form";

/**
 * /s/[storeSlug]/liff/onboarding — LIFF 補手機綁定頁 (PR-C2)
 *
 * 流程：
 *   1. server resolve store (header → cookie → "zhubei")
 *   2. server 解 LIFF_ID_BY_SLUG dict（與 /s/[slug]/liff/page.tsx 同一份對應，
 *      未來 PR-E 上 Store.liffId 一起換）
 *   3. 把 storeSlug / storeName / liffId 交給 client OnboardingForm
 *
 * 安全考量：
 *   - lineUserId / displayName **不從 URL / query 取**（會被偽造）
 *   - lineUserId 從 client LIFF SDK idToken 取，交給 server action 再驗
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）
 *
 * 不在此檔做：
 *   - 不查 Customer / 不驗 idToken（server action 做）
 *   - 不寫任何 DB
 */

const LIFF_ID_BY_SLUG: Record<string, string | undefined> = {
  zhubei: process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI,
  staging: process.env.NEXT_PUBLIC_LIFF_ID_STAGING,
};

export const dynamic = "force-dynamic";

export default async function LiffOnboardingPage() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeSlug =
    headerList.get("x-store-slug") ??
    cookieStore.get("store-slug")?.value ??
    "zhubei";

  const store = await resolveStoreBySlug(storeSlug);
  if (!store) {
    return <NotOpenForLiff message={`找不到分店：${storeSlug}`} />;
  }

  const liffId = LIFF_ID_BY_SLUG[store.slug];
  if (!liffId) {
    return <NotOpenForLiff message={`${store.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <OnboardingForm storeSlug={store.slug} storeName={store.name} liffId={liffId} />
  );
}

function NotOpenForLiff({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-earth-900">LINE Mini App</h1>
      <p className="text-sm text-earth-600">{message}</p>
      <p className="text-xs text-earth-500">請洽分店人員或回到分店首頁。</p>
    </div>
  );
}
