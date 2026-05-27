import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { OnboardingForm } from "./onboarding-form";

/**
 * /s/[storeSlug]/liff/onboarding — LIFF 補手機綁定頁 (PR-C2)
 *
 * 流程：
 *   1. resolveStoreSlugForLiff() → header / cookie；皆無 → 安全錯誤畫面（PR-E2）
 *   2. resolveStorePresentation → 取得 name / liffId / per-store presentation（PR-E）
 *   3. 把 storeSlug / storeName / liffId / contactUrl 交給 client OnboardingForm
 *
 * 安全考量：
 *   - lineUserId / displayName **不從 URL / query 取**（會被偽造）
 *   - lineUserId 從 client LIFF SDK idToken 取，交給 server action 再驗
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）；
 *     PR-E2 起 store context 缺失時不再靜默 fallback zhubei
 *
 * 不在此檔做：
 *   - 不查 Customer / 不驗 idToken（server action 做）
 *   - 不寫任何 DB
 */

export const dynamic = "force-dynamic";

export default async function LiffOnboardingPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    // PR-E2：店不存在 → notFound() → render (liff)/not-found.tsx
    notFound();
  }
  if (!presentation.liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <OnboardingForm
      storeSlug={presentation.slug}
      storeName={presentation.name}
      liffId={presentation.liffId}
      contactUrl={presentation.contactUrl}
    />
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
