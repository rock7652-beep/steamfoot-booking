import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * C 區 — 快捷操作
 *
 * 4 顆大按鈕卡片化（min-h-[96px]），確保 40+ 店長一眼看懂、容易點。
 * 固定 4 項：新增預約 / 新增顧客 / 查看今日預約 / 查看顧客列表
 */
interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: string;
  tone: "primary" | "earth";
}

const ACTIONS: QuickAction[] = [
  {
    href: "/dashboard/bookings/new",
    label: "新增預約",
    description: "建立今日或未來預約",
    icon: "＋",
    tone: "primary",
  },
  {
    href: "/dashboard/customers/new",
    label: "新增顧客",
    description: "建立新顧客資料",
    icon: "＋",
    tone: "primary",
  },
  {
    href: "/dashboard/bookings",
    label: "查看今日預約",
    description: "掃一下今天的安排",
    icon: "📅",
    tone: "earth",
  },
  {
    href: "/dashboard/customers",
    label: "查看顧客列表",
    description: "搜尋、篩選顧客",
    icon: "👥",
    tone: "earth",
  },
];

export function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-earth-900">快捷操作</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`flex min-h-[72px] flex-col justify-center gap-1 rounded-lg border px-4 py-3 transition ${
              a.tone === "primary"
                ? "border-primary-300 bg-primary-600 text-white hover:bg-primary-700"
                : "border-earth-200 bg-white text-earth-900 hover:bg-earth-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-base font-bold ${
                  a.tone === "primary" ? "bg-white/20 text-white" : "bg-primary-50 text-primary-700"
                }`}
                aria-hidden
              >
                {a.icon}
              </span>
              <span className="text-sm font-semibold leading-tight">{a.label}</span>
            </div>
            <p
              className={`text-xs ${
                a.tone === "primary" ? "text-white/80" : "text-earth-500"
              }`}
            >
              {a.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
