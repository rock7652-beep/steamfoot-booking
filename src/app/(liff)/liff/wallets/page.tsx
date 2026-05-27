import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { WalletsList } from "./wallets-list";

/**
 * /s/[storeSlug]/liff/wallets — LIFF 顧客「我的方案 / 剩餘堂數」頁
 *
 * Server-side scaffold（與 /liff/bookings/page.tsx 同 pattern）：
 *   1. resolveStoreSlugForLiff() → header / cookie；皆無 → 安全錯誤畫面（PR-E2）
 *   2. resolveStorePresentation → 取得 name / liffId / per-store presentation（PR-E）
 *   3. 把 storeSlug / storeName / liffId / contactUrl 傳給 client WalletsList
 *
 * 安全考量：
 *   - customerId / storeId / walletId **不從 URL 取**；client 也不傳
 *   - server action `fetchLiffWallets` 自走 requireSession + canonical resolver
 *   - PR-E2 起 store context 缺失時不再靜默 fallback zhubei
 *
 * 不在此檔做：
 *   - 不查 DB / 不寫 DB
 *   - 不取消 / 不續約 / 不購買 / 不付款
 *   - 不動 wallet status（read-only）
 */

export const dynamic = "force-dynamic";

export default async function LiffMyWalletsPage() {
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
    <WalletsList
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
