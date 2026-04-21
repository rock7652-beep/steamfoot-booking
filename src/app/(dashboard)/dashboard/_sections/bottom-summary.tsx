import { DashboardLink as Link } from "@/components/dashboard-link";

interface BottomSummaryProps {
  isOwner: boolean;
}

interface LinkItem {
  label: string;
  description: string;
  href: string;
  ownerOnly?: boolean;
}

/**
 * E 區 — 低優先資訊入口
 *
 * 依 spec：首頁不再當報表牆。
 * 把原本占據首頁第一屏的成長摘要、本月營收、深度分析移到純入口連結，
 * 店長真的要看再點進去。
 */
const LINKS: LinkItem[] = [
  {
    label: "完整分析",
    description: "月營收、回訪率、預約趨勢",
    href: "/dashboard/revenue",
    ownerOnly: true,
  },
  {
    label: "報表中心",
    description: "月結、日結、交易明細",
    href: "/dashboard/reports",
  },
  {
    label: "成長摘要",
    description: "合作店長、準店長、Top 候選",
    href: "/dashboard/growth",
  },
  {
    label: "系統設定",
    description: "店舖、人員、方案",
    href: "/dashboard/settings",
    ownerOnly: true,
  },
];

export function BottomSummary({ isOwner }: BottomSummaryProps) {
  const visible = LINKS.filter((l) => !l.ownerOnly || isOwner);

  return (
    <section className="rounded-xl border border-earth-200 bg-earth-50/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-earth-700">深入分析與設定</h2>
        <span className="text-sm text-earth-700">有空再看</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex min-h-[64px] items-center justify-between rounded-lg border border-earth-200 bg-white px-4 py-3 hover:border-primary-300 hover:bg-primary-50"
          >
            <div className="min-w-0">
              <p className="text-base font-semibold text-earth-900">{l.label}</p>
              <p className="mt-0.5 truncate text-sm text-earth-700">{l.description}</p>
            </div>
            <span className="ml-2 flex-shrink-0 text-earth-700">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
