import { headers, cookies } from "next/headers";
import { resolveLiffIdBySlug } from "@/lib/liff/liff-id";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { WalletsList } from "./wallets-list";

/**
 * /s/[storeSlug]/liff/wallets — LIFF 顧客「我的方案 / 剩餘堂數」頁 (PR-E2)
 *
 * Server-side scaffold（與 /liff/bookings/page.tsx 同 pattern）：
 *   1. 解 store slug：header（proxy 注入）→ cookie → 預設 "zhubei"
 *   2. resolveStoreBySlug → 找不到顯示 NotOpenForLiff
 *   3. 查 LIFF ID（`resolveLiffIdBySlug`；PR-E per-store migration 後改 Store.liffId）
 *   4. 把 storeSlug / storeName / liffId 傳給 client WalletsList
 *
 * 安全考量：
 *   - customerId / storeId / walletId **不從 URL 取**；client 也不傳
 *   - server action `fetchLiffWallets` 自走 requireSession + canonical resolver
 *     （零 client 參數，per PR-E2 拍板）
 *
 * 不在此檔做：
 *   - 不查 DB / 不寫 DB
 *   - 不取消 / 不續約 / 不購買 / 不付款
 *   - 不動 wallet status（read-only）
 */

export const dynamic = "force-dynamic";

export default async function LiffMyWalletsPage() {
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
    <WalletsList
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
