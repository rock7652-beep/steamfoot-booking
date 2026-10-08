import { PageHeader, KpiStrip } from "@/components/desktop";
import { formatDateZh } from "@/lib/date-utils";
import type { MarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

/** Shared presentation only; production owns the single authoritative snapshot. */
export function HqBrandUsage({ usage }: { usage: MarketingUsageSnapshot }) {
  return <>
    <PageHeader title="品牌總覽" subtitle={`與官網共用統計・截至 ${formatDateZh(usage.asOf)}`} />
    <KpiStrip items={[
      { label: "使用門市", value: `${usage.stores.toLocaleString("en-US")} 間`, tone: "primary" },
      { label: "服務顧客名單", value: `${usage.customers.toLocaleString("en-US")} 筆`, tone: "earth" },
      { label: "累計完成服務", value: `${usage.completedPeople.toLocaleString("en-US")} 人次`, tone: "primary" },
      { label: "自動提醒", value: `${usage.remindersSent.toLocaleString("en-US")} 則`, tone: "earth" },
    ]} />
  </>;
}
