import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { HealthView } from "./health-view";

/**
 * /s/[storeSlug]/liff/health — LIFF 顧客「我的健康紀錄」唯讀頁 (PR-H2)
 *
 * 流程：mirror trial-booking / member-booking page pattern
 *   1. resolveStoreSlugForLiff() → header / cookie；皆無 → 安全錯誤畫面（PR-E2）
 *   2. resolveStorePresentation → name / liffId / per-store presentation（PR-E）
 *   3. 把 storeSlug / storeName / liffId / contactUrl 傳給 client HealthView
 *
 * 不在此檔做：
 *   - 不查 customer / HealthFlow（client view 進場才查）
 *   - 不寫 DB
 *   - 不打 HealthFlow API
 */

export const dynamic = "force-dynamic";

export default async function LiffHealthPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    return <NotOpenForLiff message={`找不到分店：${storeSlug}`} />;
  }
  if (!presentation.liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <HealthView
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
