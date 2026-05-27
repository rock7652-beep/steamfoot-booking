import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { TrialBookingForm } from "./trial-booking-form";

/**
 * /s/[storeSlug]/liff/trial-booking — LIFF 顧客自助體驗預約頁 (PR-D1B)
 *
 * 流程：
 *   1. resolveStoreSlugForLiff() → header / cookie；皆無 → 安全錯誤畫面（PR-E2）
 *   2. resolveStorePresentation → 取得 name / liffId / per-store presentation（PR-E）
 *   3. 把 storeSlug / storeName / liffId / contactUrl 傳給 client TrialBookingForm
 *
 * 安全考量：
 *   - customerId / storeId **不從 query 取**（client 傳值不信任）；server action 自解
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）；
 *     PR-E2 起 store context 缺失時不再靜默 fallback zhubei
 *
 * 不在此檔做：
 *   - 不查 booking / 不查 trial settings / 不寫 DB
 *   - 不檢查顧客是否 signed_in（client form 進場會做；server 不重複防線）
 *
 * 進場 gate：
 *   LiffShell signed_in 才會露 booking CTA Link；
 *   未綁定顧客就算手動敲此 URL 進來，client form 跑 LIFF init →
 *   submitLiffTrialBooking 也會回 no_customer，整體不會出錯。
 */

export const dynamic = "force-dynamic";

export default async function LiffTrialBookingPage() {
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
    <TrialBookingForm
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
