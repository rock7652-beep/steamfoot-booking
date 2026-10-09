import { notFound } from "next/navigation";
import { isHqUsageUiPreview } from "../../../scripts/guide-ui-preview-scope.mjs";
import { HqBrandUsage } from "@/components/hq-brand-usage";
import { PageShell } from "@/components/desktop";

export const dynamic = "force-dynamic";
const widths = [360, 390, 640, 768, 1024, 1366, 1920];

export default async function HqUsagePreview({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isHqUsageUiPreview()) notFound();
  const params = await searchParams;
  const scenario = params.scenario === "zero" ? "zero" : params.scenario === "large" ? "large" : "normal";
  if (params.frame !== "1") {
    const requested = Number(params.width);
    const width = widths.includes(requested) ? requested : 390;
    return <main>
      <nav className="flex flex-wrap gap-3 p-3 text-sm" aria-label="合成畫面驗收尺寸">
        <span>HQ 統計合成驗收</span>
        {widths.map(size => <a key={size} href={`?width=${size}&scenario=${scenario}`} className="underline">{size}px</a>)}
        {["normal", "zero", "large"].map(value => <a key={value} href={`?width=${width}&scenario=${value}`} className="underline">{value}</a>)}
      </nav>
      <iframe title="HQ 合成統計" src={`/hq-usage-preview?frame=1&scenario=${scenario}`} style={{ width, height: width === 1024 ? 768 : 1024, border: 0 }} />
    </main>;
  }
  const usage = {
    stores: scenario === "zero" ? 0 : 7,
    customers: scenario === "zero" ? 0 : 456,
    completedPeople: scenario === "zero" ? 0 : 2345,
    remindersSent: scenario === "zero" ? 0 : scenario === "large" ? 123456789 : 1234,
    asOf: "2026-10-08",
  };
  return <div className="min-h-screen bg-earth-50">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-earth-200 bg-white p-6 lg:block">蒸管家 HQ<br />合成驗收資料</aside>
    <main className="min-w-0 p-4 lg:ml-60 lg:p-6"><PageShell><HqBrandUsage usage={usage} /></PageShell></main>
  </div>;
}
