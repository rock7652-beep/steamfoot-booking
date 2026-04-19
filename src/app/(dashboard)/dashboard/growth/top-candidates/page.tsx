import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getGrowthTopCandidates } from "@/server/queries/growth";
import { GrowthCandidateCard } from "../_components/growth-candidate-card";
import { RelativeLink } from "../_components/relative-link";

/**
 * /dashboard/growth/top-candidates — TOP 10 高潛力候選人（v2）
 *
 * v2：排序改用 growthScore desc（readiness × 0.5 + 近30d活躍 + 積分 + 階段）。
 * 每張卡統一用 GrowthCandidateCard — 顯示 growthScore / tags / nextAction，可展開 breakdown。
 *
 * Resilience：getGrowthTopCandidates 內部每支子 query 都有 safe() 包 try/catch，單一失敗回 fallback。
 */
export default async function TopCandidatesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const reqId = Math.random().toString(36).slice(2, 10);
  const t0 = performance.now();
  console.log(
    `[GROWTH:TOP_CANDIDATES] start ${JSON.stringify({
      reqId,
      role: user.role,
      userId: user.id,
      storeId: user.storeId ?? null,
      activeStoreId: activeStoreId ?? null,
    })}`,
  );

  let candidates: Awaited<ReturnType<typeof getGrowthTopCandidates>> = [];
  try {
    candidates = await getGrowthTopCandidates(activeStoreId, 10);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(
      `[GROWTH:TOP_CANDIDATES] fail getGrowthTopCandidates reqId=${reqId} msg=${err.message}`,
    );
    if (err.stack) console.error(err.stack);
  }

  const totalMs = Math.round(performance.now() - t0);
  console.log(
    `[GROWTH:TOP_CANDIDATES] done ${totalMs}ms reqId=${reqId} candidates=${candidates.length}`,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="flex items-center gap-3 text-sm text-earth-500">
        <RelativeLink to="/dashboard/growth" className="hover:text-earth-800">
          ← 成長系統
        </RelativeLink>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">潛力名單 TOP 10</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          以成長分數排序（readiness × 0.5 + 近 30 天活躍 30 + 積分 10 + 階段 10）
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-earth-500">目前尚無足夠資料的候選人</p>
          <p className="mt-1 text-xs text-earth-400">
            當成員累積推薦、點數與出席後，會自動出現在這裡
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {candidates.map((c, i) => (
            <li key={c.customerId}>
              <GrowthCandidateCard candidate={c} rank={i + 1} />
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-[11px] text-earth-400">
        成長分數每次頁面載入重新計算 · 點卡片展開看分數組成
      </p>
    </div>
  );
}
