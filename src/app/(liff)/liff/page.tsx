import { notFound } from "next/navigation";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { LiffShell } from "./liff-shell";

/**
 * /s/[storeSlug]/liff — LIFF MVP shell（PR-A）。
 *
 * 流程：
 *   1. resolveStoreSlugForLiff() → 從 proxy x-store-slug header / store-slug cookie 取 slug
 *      - 皆無 → NotOpenForLiff「無法確認分店」（PR-E2：不再靜默 fallback zhubei）
 *   2. resolveStorePresentation → 取得 {name, liffId, contactUrl, address, mapUrl}（PR-E）
 *      - store 找不到 → NotOpenForLiff「找不到分店」
 *      - liffId 為 null → NotOpenForLiff「尚未開通」
 *   3. 把 storeName / liffId / contactUrl 傳給 client shell；shell 跑 liff.init() 顯示三態
 *
 * 本頁刻意 *不* 做：
 *   - 不查 customer / NextAuth session
 *   - 不寫任何 DB
 *   - 不接預約、不接 onboarding（PR-C/D）
 */

export const dynamic = "force-dynamic";

export default async function LiffEntryPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    // PR-E2：店不存在 → notFound() → render (liff)/not-found.tsx
    // 視覺刻意與 NotOpenForLiff 區隔（URL 錯 ≠ LIFF 服務問題）
    notFound();
  }
  const liffId = await resolveCentralMemberLiffId();
  if (!liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }
  const healthAssessmentEnabled = await hasStoreFeature(
    presentation.id,
    FEATURES.AI_HEALTH_SUMMARY,
  ).catch(() => false);

  return (
    <LiffShell
      storeName={presentation.name}
      storeSlug={presentation.slug}
      liffId={liffId}
      contactUrl={presentation.contactUrl}
      healthAssessmentEnabled={healthAssessmentEnabled}
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
