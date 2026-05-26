import { headers, cookies } from "next/headers";
import { resolveLiffIdBySlug } from "@/lib/liff/liff-id";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { TrialBookingForm } from "./trial-booking-form";

/**
 * /s/[storeSlug]/liff/trial-booking — LIFF 顧客自助體驗預約頁 (PR-D1B)
 *
 * 流程：
 *   1. server resolve store (header → cookie → "zhubei")  ← 與 (liff)/liff/page.tsx 同源
 *   2. server 解 LIFF ID（`resolveLiffIdBySlug`，7 個 LIFF page 共用；PR-E 後改 Store.liffId）
 *   3. 把 storeSlug / storeName / liffId 傳給 client TrialBookingForm
 *
 * 安全考量：
 *   - customerId / storeId **不從 query 取**（client 傳值不信任）；server action 自解
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）
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

  const liffId = resolveLiffIdBySlug(store.slug);
  if (!liffId) {
    return <NotOpenForLiff message={`${store.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <TrialBookingForm
      storeSlug={store.slug}
      storeName={store.name}
      liffId={liffId}
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
