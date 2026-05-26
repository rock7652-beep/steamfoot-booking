import { headers, cookies } from "next/headers";
import { resolveLiffIdBySlug } from "@/lib/liff/liff-id";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { BookingsList } from "./bookings-list";

/**
 * /s/[storeSlug]/liff/bookings — LIFF 顧客「我的預約」頁 (PR-D2)
 *
 * Server-side scaffold（與 trial-booking/page.tsx 同 pattern）：
 *   1. 解 store slug：header（proxy 注入）→ cookie → 預設 "zhubei"
 *   2. resolveStoreBySlug → 找不到顯示 NotOpenForLiff
 *   3. 查 LIFF ID（`resolveLiffIdBySlug`；PR-E 後改 Store.liffId）
 *   4. 把 storeSlug / storeName / liffId 傳給 client BookingsList
 *
 * 安全考量：
 *   - customerId / storeId **不從 URL / query 取**；client 也不傳
 *   - server action `fetchLiffBookings` 自走 requireSession + canonical resolver
 *
 * 不在此檔做：
 *   - 不查 DB / 不寫 DB
 *   - 不取消 / 不改時間（PR-D4）
 *   - 不顯示金額 / 付款狀態
 */

export const dynamic = "force-dynamic";

export default async function LiffMyBookingsPage() {
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
    <BookingsList
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
