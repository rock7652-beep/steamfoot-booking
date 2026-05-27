import { headers, cookies } from "next/headers";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { LiffShell } from "./liff-shell";

/**
 * /s/[storeSlug]/liff — LIFF MVP shell（PR-A）。
 *
 * 流程：
 *   1. 從 proxy 注入的 x-store-slug header（fallback: cookie / "zhubei"）取得 slug
 *   2. resolveStorePresentation → 取得 {name, liffId, contactUrl, address, mapUrl}（PR-E）
 *      - store 找不到 → NotOpenForLiff（找不到分店）
 *      - liffId 為 null → NotOpenForLiff（尚未開通）
 *   3. 把 storeName / liffId / contactUrl 傳給 client shell；shell 跑 liff.init() 顯示三態
 *
 * 本頁刻意 *不* 做：
 *   - 不查 customer / NextAuth session
 *   - 不寫任何 DB
 *   - 不接預約、不接 onboarding（PR-C/D）
 */

export const dynamic = "force-dynamic";

export default async function LiffEntryPage() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeSlug =
    headerList.get("x-store-slug") ??
    cookieStore.get("store-slug")?.value ??
    "zhubei";

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    return <NotOpenForLiff message={`找不到分店：${storeSlug}`} />;
  }
  if (!presentation.liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <LiffShell
      storeName={presentation.name}
      storeSlug={presentation.slug}
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
