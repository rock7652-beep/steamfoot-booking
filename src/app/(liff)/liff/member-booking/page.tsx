import { headers, cookies } from "next/headers";
import { resolveLiffIdBySlug } from "@/lib/liff/liff-id";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { MemberBookingForm } from "./member-booking-form";

/**
 * /s/[storeSlug]/liff/member-booking — LIFF 顧客自助會員方案預約頁 (PR-G3)
 *
 * 流程：
 *   1. server resolve store (header → cookie → "zhubei")  ← 與 trial-booking/page.tsx 同源
 *   2. server 解 LIFF ID（`resolveLiffIdBySlug`；PR-E 後改 Store.liffId）
 *   3. 把 storeSlug / storeName / liffId 傳給 client MemberBookingForm
 *
 * 安全考量：
 *   - customerId / storeId / walletId **不從 query 取**；server action 自解 session
 *   - storeSlug 從 URL path 取（proxy 已注入 x-store-slug header）
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
    <MemberBookingForm
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
