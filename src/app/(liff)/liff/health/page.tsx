import { notFound } from "next/navigation";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { HealthView } from "./health-view";

/**
 * /s/[storeSlug]/liff/health — LIFF 顧客「我的健康紀錄」唯讀頁 (PR-H2)
 *
 * 流程：mirror trial-booking / member-booking page pattern
 *   1. resolveStoreSlugForLiff() → header；無 → 安全錯誤畫面
 *   2. resolveStorePresentation → name / liffId / per-store presentation
 *   3. `ai_health_summary` 關閉時直接顯示鎖定狀態，不初始化 LIFF
 *   4. 把 storeSlug / storeName / liffId / contactUrl 傳給 client HealthView
 */

export const dynamic = "force-dynamic";

export default async function LiffHealthPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    notFound();
  }

  if (!(await hasStoreFeature(presentation.id, FEATURES.AI_HEALTH_SUMMARY))) {
    return (
      <NotOpenForLiff
        title="健康紀錄尚未開通"
        message="此店目前未開通健康量測與紀錄功能。"
      />
    );
  }

  const liffId = await resolveCentralMemberLiffId();
  if (!liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <HealthView
      storeSlug={presentation.slug}
      storeName={presentation.name}
      liffId={liffId}
      contactUrl={presentation.contactUrl}
    />
  );
}

function NotOpenForLiff({
  message,
  title = "LINE Mini App",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-earth-900">{title}</h1>
      <p className="text-sm text-earth-600">{message}</p>
      <p className="text-xs text-earth-500">請洽分店人員或回到分店首頁。</p>
    </div>
  );
}
