import { notFound } from "next/navigation";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { MemberBookingForm } from "./member-booking-form";

/**
 * /s/[storeSlug]/liff/member-booking — LIFF 顧客自助會員方案預約頁 (PR-G3)
 *
 * 流程：
 *   1. resolveStoreSlugForLiff() → header / cookie；皆無 → 安全錯誤畫面（PR-E2）
 *   2. resolveStorePresentation → 取得 name / liffId / per-store presentation（PR-E）
 *   3. 把 storeSlug / storeName / liffId / contactUrl 傳給 client MemberBookingForm
 *
 * 安全考量：
 *   - customerId / storeId / walletId **不從 query 取**；server action 自解 session
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）；
 *     PR-E2 起 store context 缺失時不再靜默 fallback zhubei
 *
 * 不在此檔做：
 *   - 不查 booking / 不查 wallet（client form 進場才查）
 *   - 不寫 DB
 *
 * 進場 gate：
 *   /liff/wallets ReadyView 才會露「立即預約」CTA（totalAvailable > 0）；
 *   未綁定顧客手動敲此 URL，client form 跑 LIFF init →
 *   submitLiffMemberBooking 也會回 no_customer，整體不會出錯。
 */

export const dynamic = "force-dynamic";

export default async function LiffMemberBookingPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    // PR-E2：店不存在 → notFound() → render (liff)/not-found.tsx
    notFound();
  }
  const liffId = await resolveCentralMemberLiffId(storeSlug);
  if (!liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <MemberBookingForm
      storeSlug={presentation.slug}
      storeName={presentation.name}
      liffId={liffId}
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
