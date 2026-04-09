import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CHANGELOG } from "@/lib/version";
import type { ChangelogTag, AffectedRole } from "@/lib/version";

const TAG_COLORS: Record<ChangelogTag, string> = {
  "新功能": "bg-blue-100 text-blue-700",
  "修正": "bg-red-100 text-red-600",
  "優化": "bg-green-100 text-green-700",
};

const ROLE_COLORS: Record<AffectedRole, string> = {
  "全部": "bg-earth-100 text-earth-600",
  "店長": "bg-amber-100 text-amber-700",
  "員工": "bg-purple-100 text-purple-700",
  "顧客": "bg-teal-100 text-teal-700",
};

export default async function ChangelogPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
          ← 首頁
        </Link>
        <h1 className="text-lg font-bold text-earth-900">更新日誌</h1>
      </div>
      <p className="text-xs text-earth-400">系統版本更新歷史與變更紀錄</p>

      <div className="space-y-6">
        {CHANGELOG.map((entry, idx) => (
          <div
            key={entry.version}
            className="rounded-xl border bg-white shadow-sm overflow-hidden"
          >
            {/* Version header */}
            <div className={`flex items-center gap-3 px-5 py-3 ${idx === 0 ? "bg-primary-50 border-b border-primary-100" : "bg-earth-50 border-b border-earth-100"}`}>
              <div className={`rounded-full px-3 py-1 text-sm font-bold ${idx === 0 ? "bg-primary-600 text-white" : "bg-earth-300 text-white"}`}>
                v{entry.version}
              </div>
              <span className="text-sm text-earth-500">{entry.date}</span>
              {idx === 0 && (
                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                  最新版本
                </span>
              )}
            </div>

            {/* Changes list */}
            <div className="px-5 py-4">
              <p className="mb-3 text-sm text-earth-600">{entry.highlights}</p>
              <ul className="space-y-2.5">
                {entry.changes.map((change, ci) => (
                  <li key={ci} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_COLORS[change.tag]}`}>
                      {change.tag}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-earth-800">{change.text}</span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {change.roles.map((role) => (
                          <span key={role} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${ROLE_COLORS[role]}`}>
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
