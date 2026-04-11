import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { CACHE_INVENTORY, PAGE_HOTSPOTS } from "@/lib/cache-inventory";

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-green-100 text-green-700",
};

const CACHE_COLOR: Record<string, string> = {
  full: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  none: "bg-earth-100 text-earth-600",
};

const CACHE_LABEL: Record<string, string> = {
  full: "完整快取",
  partial: "部分快取",
  none: "無快取",
};

export default async function PerfPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-bold text-earth-900">效能熱點總覽</h1>
        <p className="mt-1 text-sm text-earth-500">
          各頁面查詢數、快取覆蓋率、優先度。日誌格式：<code className="rounded bg-earth-100 px-1 text-xs">[PERF]</code> JSON stdout。
        </p>
      </div>

      {/* Page hotspots */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-earth-800">頁面效能清單</h2>
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-earth-100 bg-earth-50/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-earth-600">路由</th>
                <th className="px-3 py-2.5 text-center font-medium text-earth-600">查詢數</th>
                <th className="px-3 py-2.5 text-center font-medium text-earth-600">快取狀態</th>
                <th className="px-3 py-2.5 text-center font-medium text-earth-600">優先度</th>
                <th className="px-3 py-2.5 text-left font-medium text-earth-600">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {PAGE_HOTSPOTS.map((p) => (
                <tr key={p.route} className="hover:bg-earth-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-earth-800">{p.route}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-earth-900">{p.queryCount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CACHE_COLOR[p.cacheCoverage]}`}>
                      {CACHE_LABEL[p.cacheCoverage]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[p.priority]}`}>
                      {p.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-earth-500">{p.cacheNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cache tag inventory */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-earth-800">快取 Tag 清單</h2>
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-earth-100 bg-earth-50/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-earth-600">Tag</th>
                <th className="px-3 py-2.5 text-center font-medium text-earth-600">TTL</th>
                <th className="px-3 py-2.5 text-left font-medium text-earth-600">失效觸發</th>
                <th className="px-3 py-2.5 text-left font-medium text-earth-600">消費頁面</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {CACHE_INVENTORY.map((c) => (
                <tr key={c.tag} className="hover:bg-earth-50/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-primary-700">{c.tag}</td>
                  <td className="px-3 py-2.5 text-center text-earth-600">{c.ttl}s</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.invalidatedBy.map((fn) => (
                        <span key={fn} className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] text-earth-600">
                          {fn}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-earth-500">
                    {c.consumers.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tips */}
      <section className="rounded-xl border border-earth-200 bg-earth-50 p-4">
        <h3 className="text-sm font-semibold text-earth-700">監控指南</h3>
        <ul className="mt-2 space-y-1 text-xs text-earth-600">
          <li>Server 日誌搜尋 <code className="rounded bg-white px-1">[PERF]</code> 可取得各頁面載入耗時與查詢明細。</li>
          <li>快取命中推測：查詢耗時 &lt; 5ms 視為 cache hit。</li>
          <li>錯誤日誌搜尋 <code className="rounded bg-white px-1">[PERF:ERROR]</code> 可追蹤查詢失敗。</li>
          <li>所有 mutation 已使用 <code className="rounded bg-white px-1">updateTag()</code> 即時失效對應快取。</li>
        </ul>
      </section>
    </div>
  );
}
